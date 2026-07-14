import { useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { estimateGasSend, sendNative, sendToken } from '../../lib/chain';
import { formatEther } from 'ethers';
import { formatTxError } from '../../lib/gas';
import { normalizeAddress } from '../../lib/validate';
import { shortenAddress } from '../../lib/wallet';

export default function Send() {
  const { signer, tokens } = useWallet();
  const [asset, setAsset] = useState('PLS');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [gasInfo, setGasInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');
  const [confirming, setConfirming] = useState(false);

  const selectedToken = tokens.find((t) => t.symbol === asset);
  const checksumTo = normalizeAddress(to);

  useEffect(() => {
    if (!signer || !checksumTo || !amount || Number(amount) <= 0) {
      setGasInfo(null);
      return;
    }
    const run = async () => {
      try {
        const info = await estimateGasSend({
          signer,
          to: checksumTo,
          amount,
          isNative: asset === 'PLS',
          tokenAddress: selectedToken?.address,
          decimals: selectedToken?.decimals || 18,
        });
        setGasInfo(info);
      } catch {
        setGasInfo(null);
      }
    };
    const id = setTimeout(run, 400);
    return () => clearTimeout(id);
  }, [signer, checksumTo, amount, asset, selectedToken]);

  const estCost = gasInfo?.gasLimit && gasInfo?.gasPrice
    ? formatEther(BigInt(gasInfo.gasLimit) * BigInt(gasInfo.gasPrice))
    : null;

  const openConfirm = () => {
    setError('');
    if (!checksumTo) {
      setError('Enter a valid recipient address (0x…)');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (asset !== 'PLS' && !selectedToken) {
      setError('Select a valid token');
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    setHash('');
    try {
      let txHash;
      if (asset === 'PLS') {
        txHash = await sendNative(signer, checksumTo, amount);
      } else {
        txHash = await sendToken(signer, selectedToken.address, checksumTo, amount, selectedToken.decimals);
      }
      setHash(txHash);
      setAmount('');
      setTo('');
      setConfirming(false);
    } catch (e) {
      setError(formatTxError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="label">Asset</div>
        <select value={asset} onChange={(e) => setAsset(e.target.value)}>
          <option value="PLS">PLS</option>
          {tokens.map((t) => (
            <option key={t.address} value={t.symbol}>{t.symbol}</option>
          ))}
        </select>

        <div className="label">Recipient</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
        />
        {to && !checksumTo && <p className="error">Invalid address</p>}

        <div className="label">Amount</div>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" />

        {estCost && <p className="muted">Est. gas: ~{Number(estCost).toFixed(6)} PLS</p>}

        <button type="button" className="btn btn-primary" disabled={busy} onClick={openConfirm}>
          Review send
        </button>
        {error && !confirming && <p className="error">{error}</p>}
        {hash && <p className="success">Sent: {hash.slice(0, 14)}…</p>}
      </div>

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(false)} role="presentation">
          <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="label">Confirm send</div>
            <div className="confirm-rows">
              <div className="confirm-row">
                <span className="label">To</span>
                <span className="value">{shortenAddress(checksumTo, 8)}</span>
              </div>
              <div className="confirm-row">
                <span className="label">Amount</span>
                <span className="value">{amount} {asset}</span>
              </div>
              {estCost && (
                <div className="confirm-row">
                  <span className="label">Est. gas</span>
                  <span className="value">~{Number(estCost).toFixed(6)} PLS</span>
                </div>
              )}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Double-check the address. Transactions cannot be reversed.</p>
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" style={{ width: 'auto', flex: 1 }} disabled={busy} onClick={submit}>
                {busy ? 'Sending…' : 'Confirm & send'}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}