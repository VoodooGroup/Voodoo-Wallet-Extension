import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { shortenAddress } from '../../lib/wallet';
import { describeDappRequest } from '../../lib/dapp-display';
import { formatEther } from 'ethers';
import { notifyTransferSent } from '../../lib/notify-transfer';
import { sendRuntimeMessage } from '../../lib/runtime-message.js';

export default function DappPrompt() {
  const { t } = useI18n();
  const { signer, address, unlocked, activeAccount } = useWallet();
  const [pending, setPending] = useState({ connect: null, sign: null });
  const [busy, setBusy] = useState(false);
  const [signError, setSignError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    sendRuntimeMessage({ type: 'DAPP_GET_PENDING' }, (res) => {
      if (!mountedRef.current || !res) return;
      setPending(res);
    });
  }, []);

  useEffect(() => {
    if (!unlocked) return undefined;
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [unlocked, refresh]);

  // After unlock: auto-approve pending site connect (user already clicked Connect on the dApp).
  useEffect(() => {
    if (!unlocked || !address || !pending.connect?.origin) return undefined;
    const origin = pending.connect.origin;
    const timer = setTimeout(() => {
      sendRuntimeMessage({
        type: 'DAPP_APPROVE_CONNECT',
        origin,
      }, refresh);
    }, 250);
    return () => clearTimeout(timer);
  }, [unlocked, address, pending.connect?.id, pending.connect?.origin, refresh]);

  const signDetails = useMemo(() => {
    if (!pending.sign) return null;
    return describeDappRequest(pending.sign.method, pending.sign.params, t);
  }, [pending.sign, t]);

  const rejectConnect = () => {
    sendRuntimeMessage({ type: 'DAPP_REJECT_CONNECT' }, refresh);
  };

  const approveConnect = () => {
    if (!pending.connect) return;
    if (!address) {
      setSignError(t('dapp_unlock_first'));
      return;
    }
    setSignError('');
    sendRuntimeMessage({
      type: 'DAPP_APPROVE_CONNECT',
      origin: pending.connect.origin,
    }, refresh);
  };

  const rejectSign = () => {
    sendRuntimeMessage({ type: 'DAPP_REJECT_SIGN' }, refresh);
  };

  const approveSign = async () => {
    if (!signer || !pending.sign) return;
    setBusy(true);
    setSignError('');
    try {
      const { method, params } = pending.sign;
      let result;
      if (method === 'personal_sign') {
        let message = params[0];
        if (typeof params[0] === 'string' && params[0].length === 42 && params[1]) {
          message = params[1];
        }
        result = await signer.signMessage(message);
      } else if (method === 'eth_sendTransaction') {
        // Normalize JSON-RPC tx → ethers v6 TransactionRequest
        const raw = params[0] || {};
        const txParams = {
          to: raw.to,
          data: raw.data,
          value: raw.value,
          nonce: raw.nonce,
          gasLimit: raw.gasLimit ?? raw.gas,
          gasPrice: raw.gasPrice,
          maxFeePerGas: raw.maxFeePerGas,
          maxPriorityFeePerGas: raw.maxPriorityFeePerGas,
          chainId: raw.chainId,
          type: raw.type,
        };
        // Drop undefined keys (ethers is picky)
        Object.keys(txParams).forEach((k) => {
          if (txParams[k] === undefined || txParams[k] === null || txParams[k] === '') {
            delete txParams[k];
          }
        });

        const tx = await signer.sendTransaction(txParams);
        // MetaMask-compatible: return hash immediately. The dApp (ethers) waits for receipt.
        // Awaiting tx.wait() here caused 90s timeouts on Approve/Stake.
        result = tx.hash;

        const value = raw.value ? BigInt(raw.value) : 0n;
        // Fire-and-forget confirmation notify (do not block dApp response)
        tx.wait()
          .then((receipt) => {
            if (receipt?.status === 1) {
              notifyTransferSent({
                amount: value > 0n ? formatEther(value) : null,
                symbol: value > 0n ? 'PLS' : null,
                to: raw.to,
                accountName: activeAccount?.name,
                hash: tx.hash,
              });
            }
          })
          .catch(() => {});
      } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
        const typed = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        result = await signer.signTypedData(typed.domain, typed.types, typed.message);
      } else {
        throw new Error('Unsupported sign method');
      }
      sendRuntimeMessage({ type: 'DAPP_APPROVE_SIGN', result }, refresh);
    } catch (err) {
      console.error('[DappPrompt] approveSign failed', err);
      setSignError(err?.shortMessage || err?.message || t('dapp_sign_failed'));
      sendRuntimeMessage({ type: 'DAPP_REJECT_SIGN' }, refresh);
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) return null;

  if (pending.connect) {
    return (
      <div className="dapp-prompt">
        <div className="card dapp-prompt-card">
          <div className="label">{t('dapp_connect_site')}</div>
          <p className="dapp-host">{pending.connect.hostname}</p>
          <p className="muted">{t('dapp_connect_hint')}</p>
          <p className="muted" style={{ fontSize: 11 }}>{t('dapp_connect_manual_hint')}</p>
          <div className="dapp-detail-row">
            <span className="label">{t('dapp_your_address')}</span>
            <span className="value">{shortenAddress(address, 8)}</span>
          </div>
          {signError && <p className="error">{signError}</p>}
          <div className="dapp-actions">
            <button type="button" className="btn btn-secondary" onClick={rejectConnect}>{t('reject')}</button>
            <button type="button" className="btn btn-primary" onClick={approveConnect}>{t('connect')}</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.sign && signDetails) {
    return (
      <div className="dapp-prompt">
        <div className="card dapp-prompt-card">
          <div className="label">{t('dapp_confirm_request')}</div>
          <p className="dapp-host">{pending.sign.hostname}</p>
          <p className="dapp-request-title">{signDetails.title}</p>
          {signDetails.lines.map((line) => (
            <div key={line.label} className="dapp-detail-row">
              <span className="label">{line.label}</span>
              <span className="dapp-detail-value">{line.value}</span>
            </div>
          ))}
          {signDetails.warning && (
            <p className="dapp-warning">{signDetails.warning}</p>
          )}
          {signError && <p className="error">{signError}</p>}
          <div className="dapp-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={rejectSign}>{t('reject')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={approveSign}>
              {busy ? t('dapp_confirming') : t('approve')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}