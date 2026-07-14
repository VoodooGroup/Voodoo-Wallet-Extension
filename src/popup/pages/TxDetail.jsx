import { useEffect, useState } from 'react';
import { formatEther } from 'ethers';
import { useWallet } from '../../context/WalletContext';
import { shortenAddress } from '../../lib/wallet';
import { explorerAddressUrl, explorerTxUrl } from '../../lib/transactions';
import {
  copyText,
  fetchTxDetail,
  formatGwei,
  formatTxDetailTime,
} from '../../lib/tx-detail';

const TABS = [
  ['details', 'Details'],
  ['tokens', 'Tokens'],
  ['internal', 'Internal'],
  ['logs', 'Logs'],
];

function AddressRow({ label, address, contractName, wallet }) {
  if (!address) {
    return (
      <div className="tx-detail-row">
        <span className="tx-detail-label">{label}</span>
        <span className="tx-detail-value muted">Contract creation</span>
      </div>
    );
  }

  const isWallet = wallet && address.toLowerCase() === wallet.toLowerCase();

  return (
    <div className="tx-detail-row">
      <span className="tx-detail-label">{label}</span>
      <div className="tx-detail-value tx-detail-address">
        <a
          className="tx-detail-link"
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
        >
          {shortenAddress(address, 6)}
        </a>
        {isWallet && <span className="tx-detail-badge">Your wallet</span>}
        {contractName && <span className="tx-detail-badge">{contractName}</span>}
        <button
          type="button"
          className="tx-detail-copy"
          onClick={() => copyText(address)}
          title="Copy address"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="tx-detail-row">
      <span className="tx-detail-label">{label}</span>
      <span className={`tx-detail-value${mono ? ' tx-detail-mono' : ''}`}>{value}</span>
    </div>
  );
}

function EmptyTab({ message }) {
  return <div className="card muted tx-detail-empty">{message}</div>;
}

export default function TxDetail({ hash, onBack }) {
  const { address } = useWallet();
  const [tab, setTab] = useState('details');
  const [tx, setTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setTx(null);
    setTab('details');

    fetchTxDetail(hash)
      .then((data) => {
        if (!cancelled) setTx(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load transaction');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hash]);

  const handleCopyHash = async () => {
    const ok = await copyText(hash);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (loading) {
    return <div className="card muted">Loading transaction…</div>;
  }

  if (error || !tx) {
    return (
      <>
        <button type="button" className="tx-detail-back" onClick={onBack}>
          ← Back to activity
        </button>
        <div className="card">
          <p className="error">{error || 'Transaction not found'}</p>
          <a className="activity-link" href={explorerTxUrl(hash)} target="_blank" rel="noreferrer">
            View on Otterscan
          </a>
        </div>
      </>
    );
  }

  const failReason = tx.revertReason || tx.errorDescription;

  return (
    <div className="tx-detail-page">
      <button type="button" className="tx-detail-back" onClick={onBack}>
        ← Back to activity
      </button>

      <div className="card tx-detail-header">
        <div className="row">
          <span className={`tx-detail-status tx-detail-status-${tx.status}`}>
            {tx.status === 'success' ? 'Success' : 'Failed'}
          </span>
          <button type="button" className="tx-detail-copy" onClick={handleCopyHash}>
            {copied ? 'Copied' : 'Copy hash'}
          </button>
        </div>
        <div className="tx-detail-hash">{shortenAddress(tx.hash, 10)}</div>
        <div className="muted">{formatTxDetailTime(tx.timestamp)}</div>
        {failReason && <div className="error tx-detail-error">{failReason}</div>}
      </div>

      <div className="tx-detail-tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'tokens' && tx.transfers.length > 0 && (
              <span className="tx-detail-tab-count">{tx.transfers.length}</span>
            )}
            {id === 'internal' && tx.internalTxs.length > 0 && (
              <span className="tx-detail-tab-count">{tx.internalTxs.length}</span>
            )}
            {id === 'logs' && tx.logs.length > 0 && (
              <span className="tx-detail-tab-count">{tx.logs.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="card tx-detail-panel">
          <DetailRow label="Block" value={tx.blockNumber || '—'} />
          <DetailRow label="Confirmations" value={tx.confirmations ?? '—'} />
          <DetailRow label="Value" value={`${Number(tx.value).toFixed(6)} PLS`} />
          <DetailRow label="Transaction fee" value={`${Number(tx.txFee).toFixed(6)} PLS`} />
          <DetailRow label="Gas used" value={`${tx.gasUsed} / ${tx.gasLimit}`} />
          <DetailRow label="Gas price" value={formatGwei(tx.gasPrice)} />
          {tx.maxFeePerGas && (
            <DetailRow label="Max fee" value={formatGwei(tx.maxFeePerGas)} />
          )}
          {tx.maxPriorityFeePerGas && (
            <DetailRow label="Priority fee" value={formatGwei(tx.maxPriorityFeePerGas)} />
          )}
          {tx.nonce && <DetailRow label="Nonce" value={tx.nonce} />}
          {tx.txType && <DetailRow label="Type" value={tx.txType} />}
          <AddressRow label="From" address={tx.from} wallet={address} />
          <AddressRow
            label="To"
            address={tx.to}
            contractName={tx.contractName}
            wallet={address}
          />
          {tx.input && tx.input !== '0x' && (
            <div className="tx-detail-input">
              <div className="tx-detail-label">Input data</div>
              <pre className="tx-detail-input-data">{tx.input}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'tokens' && (
        tx.transfers.length === 0
          ? <EmptyTab message="No token transfers in this transaction." />
          : (
            <div className="tx-detail-list">
              {tx.transfers.map((transfer) => {
                const fromWallet = transfer.from === address?.toLowerCase();
                const toWallet = transfer.to === address?.toLowerCase();
                return (
                  <div key={transfer.id} className="card tx-detail-item">
                    <div className="activity-title">
                      {transfer.amountLabel}
                      {' '}
                      {transfer.symbol}
                    </div>
                    <div className="muted">{transfer.tokenName}</div>
                    <div className="tx-detail-transfer-row">
                      <span>
                        From
                        {' '}
                        <a
                          className="tx-detail-link"
                          href={explorerAddressUrl(transfer.from)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortenAddress(transfer.from, 4)}
                        </a>
                        {fromWallet && <span className="tx-detail-badge">You</span>}
                      </span>
                      <span>
                        To
                        {' '}
                        <a
                          className="tx-detail-link"
                          href={explorerAddressUrl(transfer.to)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortenAddress(transfer.to, 4)}
                        </a>
                        {toWallet && <span className="tx-detail-badge">You</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
      )}

      {tab === 'internal' && (
        tx.internalTxs.length === 0
          ? <EmptyTab message="No internal transactions." />
          : (
            <div className="tx-detail-list">
              {tx.internalTxs.map((item, index) => (
                <div key={`${item.transactionHash}-${item.index ?? index}`} className="card tx-detail-item">
                  <div className="activity-title">
                    {Number(formatEther(item.value || '0')).toFixed(6)}
                    {' '}
                    PLS
                  </div>
                  <div className="muted">
                    {item.type || item.callType || 'call'}
                    {item.isError === '1' && ' · Failed'}
                  </div>
                  <div className="tx-detail-transfer-row">
                    <span>
                      From
                      {' '}
                      {shortenAddress(item.from, 4)}
                    </span>
                    <span>
                      To
                      {' '}
                      {shortenAddress(item.to, 4)}
                    </span>
                  </div>
                  {item.gasUsed && (
                    <div className="muted">Gas used: {item.gasUsed}</div>
                  )}
                </div>
              ))}
            </div>
          )
      )}

      {tab === 'logs' && (
        tx.logs.length === 0
          ? <EmptyTab message="No event logs." />
          : (
            <div className="tx-detail-list">
              {tx.logs.map((log, index) => (
                <div key={`${log.logIndex ?? index}-${log.address}`} className="card tx-detail-item">
                  <div className="activity-title">
                    Log #
                    {log.logIndex ?? index}
                  </div>
                  <div className="muted">{shortenAddress(log.address, 6)}</div>
                  {(log.topics || []).map((topic, topicIndex) => (
                    <div key={topic} className="tx-detail-log-topic">
                      <span className="tx-detail-label">
                        Topic
                        {topicIndex}
                      </span>
                      <span className="tx-detail-mono">{shortenAddress(topic, 8)}</span>
                    </div>
                  ))}
                  {log.data && log.data !== '0x' && (
                    <div className="tx-detail-log-topic">
                      <span className="tx-detail-label">Data</span>
                      <span className="tx-detail-mono">{shortenAddress(log.data, 8)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
      )}

      <a
        className="activity-link tx-detail-explorer"
        href={explorerTxUrl(tx.hash)}
        target="_blank"
        rel="noreferrer"
      >
        View full details on Otterscan
      </a>
    </div>
  );
}