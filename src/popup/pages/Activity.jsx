import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { shortenAddress } from '../../lib/wallet';
import {
  explorerAddressUrl, fetchWalletActivity, formatTxTime,
} from '../../lib/transactions';
import TxDetail from './TxDetail';

export default function Activity() {
  const { address } = useWallet();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [selectedHash, setSelectedHash] = useState(null);

  const load = useCallback(async (cursor = null, append = false, mode = source || 'scan') => {
    if (!address) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const data = await fetchWalletActivity(address, cursor, append ? mode : 'scan');
      setItems((prev) => {
        if (!append) return data.items;
        const seen = new Set(prev.map((tx) => tx.id));
        const next = data.items.filter((tx) => !seen.has(tx.id));
        return [...prev, ...next];
      });
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      setSource(data.source || 'scan');
    } catch (e) {
      setError(e.message || 'Could not load transaction history');
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [address, source]);

  useEffect(() => {
    load(null, false);
  }, [load]);

  if (selectedHash) {
    return <TxDetail hash={selectedHash} onBack={() => setSelectedHash(null)} />;
  }

  if (loading) {
    return <div className="card muted">Loading transaction history…</div>;
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <div>
            <div className="label">Transaction history</div>
            <div className="muted">
              {shortenAddress(address, 8)}
              {source && ` · via ${source === 'rpc' ? 'RPC' : 'PulseScan'}`}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: 'auto' }}
            onClick={() => load(null, false)}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
          <a
            className="activity-link"
            href={explorerAddressUrl(address)}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: 8 }}
          >
            Open wallet on Otterscan
          </a>
          <button type="button" className="btn btn-secondary" onClick={() => load(null, false)}>
            Retry
          </button>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="card muted">No transactions yet for this wallet.</div>
      )}

      <div className="activity-list">
        {items.map((tx) => (
          <button
            key={tx.id}
            type="button"
            className="card activity-item activity-item-btn"
            onClick={() => setSelectedHash(tx.hash)}
          >
            <div className="row">
              <div>
                <div className="activity-title">
                  {tx.direction === 'sent' ? 'Sent' : 'Received'} {tx.symbol}
                </div>
                <div className="muted">{formatTxTime(tx.timestamp)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={tx.direction === 'sent' ? 'activity-out' : 'activity-in'}>
                  {tx.direction === 'sent' ? '-' : '+'}
                  {Number(tx.amount).toFixed(4)}
                  {' '}
                  {tx.symbol}
                </div>
                {tx.status === 'failed' && <div className="error">Failed</div>}
              </div>
            </div>
            <div className="activity-meta muted">
              {tx.direction === 'sent' ? 'To' : 'From'}
              {' '}
              {shortenAddress(tx.counterparty, 4)}
            </div>
            <span className="activity-link">View details</span>
          </button>
        ))}
      </div>

      {hasMore && !error && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loadingMore}
          onClick={() => load(nextCursor, true)}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}