import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { shortenAddress } from '../../lib/wallet';
import {
  clearActivityCache,
  fetchActivityFast,
  fetchActivityFull,
  fetchWalletActivity,
  formatTxTime,
  peekActivityCache,
} from '../../lib/transactions';
import TxDetail from './TxDetail';

export default function Activity() {
  const { t } = useI18n();
  const { address } = useWallet();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selectedHash, setSelectedHash] = useState(null);
  const sourceRef = useRef('auto');
  const requestIdRef = useRef(0);
  const loadedOnceRef = useRef(false);

  const applyActivityData = useCallback((data, append = false) => {
    setItems((prev) => {
      if (!append) return data.items;
      const seen = new Set(prev.map((tx) => tx.id));
      const next = data.items.filter((tx) => !seen.has(tx.id));
      return [...prev, ...next];
    });
    setHasMore(data.hasMore);
    setNextCursor(data.nextCursor);
    sourceRef.current = data.source || sourceRef.current;
  }, []);

  const loadFull = useCallback(async (requestId, options = {}) => {
    const { silent = true } = options;
    try {
      const data = await fetchActivityFull(address);
      if (requestId !== requestIdRef.current) return;
      applyActivityData(data, false);
      loadedOnceRef.current = true;
      setError('');
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      if (!silent) {
        setError(e.message || t('activity_load_error'));
        setItems([]);
      }
    }
  }, [address, applyActivityData, t]);

  const load = useCallback(async (cursor = null, append = false, mode = null, options = {}) => {
    if (!address) {
      setLoading(false);
      setLoadingMore(false);
      setItems([]);
      return;
    }

    const { silent = false, bypassCache = false } = options;
    const fetchMode = mode || (append ? sourceRef.current : 'auto');
    const requestId = ++requestIdRef.current;

    if (append) setLoadingMore(true);
    else if (!silent && !loadedOnceRef.current) setLoading(true);
    setError('');

    try {
      if (!cursor && bypassCache) {
        clearActivityCache(address);
      }

      if (!cursor && !append && bypassCache) {
        const fast = await fetchActivityFast(address);
        if (requestId !== requestIdRef.current) return;
        applyActivityData(fast, false);
        if (fast.items.length > 0) {
          loadedOnceRef.current = true;
          setLoading(false);
        }
        await loadFull(requestId, { silent: false });
        return;
      }

      const data = await fetchWalletActivity(address, cursor, fetchMode, { bypassCache });
      if (requestId !== requestIdRef.current) return;

      applyActivityData(data, append);
      loadedOnceRef.current = true;
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      if (!silent) {
        setError(e.message || t('activity_load_error'));
        if (!append) setItems([]);
      }
    } finally {
      if (requestId !== requestIdRef.current) return;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [address, applyActivityData, loadFull, t]);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      setItems([]);
      loadedOnceRef.current = false;
      return undefined;
    }

    loadedOnceRef.current = false;
    setError('');
    sourceRef.current = 'auto';

    const requestId = ++requestIdRef.current;
    const cached = peekActivityCache(address);

    if (cached?.items?.length && cached.tokenEnriched) {
      applyActivityData(cached, false);
      loadedOnceRef.current = true;
      setLoading(false);
      loadFull(requestId, { silent: true });
      return () => {
        requestIdRef.current += 1;
      };
    }

    if (cached?.items?.length) {
      applyActivityData(cached, false);
      loadedOnceRef.current = true;
      setLoading(false);
      loadFull(requestId, { silent: false });
      return () => {
        requestIdRef.current += 1;
      };
    }

    (async () => {
      try {
        const fast = await fetchActivityFast(address);
        if (requestId !== requestIdRef.current) return;

        if (fast.items.length > 0) {
          applyActivityData(fast, false);
          loadedOnceRef.current = true;
          setLoading(false);
        }

        await loadFull(requestId, { silent: fast.items.length === 0 });
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setError(e.message || t('activity_load_error'));
        setItems([]);
      } finally {
        if (requestId !== requestIdRef.current) return;
        setLoading(false);
      }
    })();

    return () => {
      requestIdRef.current += 1;
    };
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  if (selectedHash) {
    return <TxDetail hash={selectedHash} onBack={() => setSelectedHash(null)} />;
  }

  if (loading) {
    return <div className="card muted">{t('activity_loading')}</div>;
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <div>
            <div className="label">{t('activity_title')}</div>
            <div className="muted">{shortenAddress(address, 8)}</div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: 'auto' }}
            onClick={() => load(null, false, 'auto', { bypassCache: true })}
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => load(null, false, 'auto', { bypassCache: true })}
          >
            {t('retry')}
          </button>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="card muted">{t('no_transactions')}</div>
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
                  {tx.direction === 'sent' ? t('tx_sent') : t('tx_received')} {tx.symbol}
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
                {tx.status === 'failed' && <div className="error">{t('tx_failed')}</div>}
              </div>
            </div>
            <div className="activity-meta muted">
              {tx.direction === 'sent' ? t('to') : t('tx_from')}
              {' '}
              {tx.counterparty}
            </div>
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
          {loadingMore ? t('loading') : t('load_more')}
        </button>
      )}
    </>
  );
}