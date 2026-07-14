import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { shortenAddress } from '../../lib/wallet';
import { describeDappRequest } from '../../lib/dapp-display';

export default function DappPrompt() {
  const { signer, address, unlocked } = useWallet();
  const [pending, setPending] = useState({ connect: null, sign: null });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'DAPP_GET_PENDING' }, (res) => {
      if (res) setPending(res);
    });
  }, []);

  useEffect(() => {
    if (!unlocked) return undefined;
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [unlocked, refresh]);

  const signDetails = useMemo(() => {
    if (!pending.sign) return null;
    return describeDappRequest(pending.sign.method, pending.sign.params);
  }, [pending.sign]);

  const rejectConnect = () => {
    chrome.runtime.sendMessage({ type: 'DAPP_REJECT_CONNECT' }, refresh);
  };

  const approveConnect = () => {
    if (!pending.connect) return;
    chrome.runtime.sendMessage({
      type: 'DAPP_APPROVE_CONNECT',
      origin: pending.connect.origin,
    }, refresh);
  };

  const rejectSign = () => {
    chrome.runtime.sendMessage({ type: 'DAPP_REJECT_SIGN' }, refresh);
  };

  const approveSign = async () => {
    if (!signer || !pending.sign) return;
    setBusy(true);
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
        const tx = await signer.sendTransaction(params[0]);
        await tx.wait();
        result = tx.hash;
      } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
        const typed = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1];
        result = await signer.signTypedData(typed.domain, typed.types, typed.message);
      } else {
        throw new Error('Unsupported sign method');
      }
      chrome.runtime.sendMessage({ type: 'DAPP_APPROVE_SIGN', result }, refresh);
    } catch (e) {
      chrome.runtime.sendMessage({ type: 'DAPP_REJECT_SIGN' }, refresh);
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) return null;

  if (pending.connect) {
    return (
      <div className="dapp-prompt">
        <div className="card dapp-prompt-card">
          <div className="label">Connect to site</div>
          <p className="dapp-host">{pending.connect.hostname}</p>
          <p className="muted">Allow this site to view your PulseChain address?</p>
          <p className="muted" style={{ fontSize: 11 }}>If you opened the wallet manually, approve below.</p>
          <div className="dapp-detail-row">
            <span className="label">Your address</span>
            <span className="value">{shortenAddress(address, 8)}</span>
          </div>
          <div className="dapp-actions">
            <button type="button" className="btn btn-secondary" onClick={rejectConnect}>Reject</button>
            <button type="button" className="btn btn-primary" onClick={approveConnect}>Connect</button>
          </div>
        </div>
      </div>
    );
  }

  if (pending.sign && signDetails) {
    return (
      <div className="dapp-prompt">
        <div className="card dapp-prompt-card">
          <div className="label">Confirm request</div>
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
          <div className="dapp-actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={rejectSign}>Reject</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={approveSign}>
              {busy ? 'Confirming…' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}