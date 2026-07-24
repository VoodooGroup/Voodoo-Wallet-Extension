import { useEffect, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import { shortenAddress } from '../../lib/wallet';
import {
  fetchGasSpending,
  fetchRecentYields,
  fetchUpcomingUnlocks,
} from '../../lib/wallet-insights.js';

const LOADERS = {
  unlocks: fetchUpcomingUnlocks,
  gas: fetchGasSpending,
  yields: fetchRecentYields,
};

const TITLES = {
  unlocks: 'insights_upcoming_unlocks_title',
  gas: 'insights_gas_spending_title',
  yields: 'insights_recent_yields_title',
};

function formatWhen(timestamp, t) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MenuInsightsPanel({ view, onClose, onGoStake }) {
  const { t } = useI18n();
  const { address } = useWallet();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);

    const load = LOADERS[view];
    if (!load || !address) {
      setLoading(false);
      return undefined;
    }

    load(address)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(t('insights_load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [view, address, t]);

  const titleKey = TITLES[view] || 'insights_upcoming_unlocks_title';

  return (
    <div
      className="insights-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insights-title"
    >
      <div className="insights-panel">
        <div className="insights-panel-top">
          <button type="button" className="insights-panel-back" onClick={onClose}>
            {t('cancel')}
          </button>
          <h2 id="insights-title">{t(titleKey)}</h2>
        </div>

        {loading && <div className="card muted">{t('insights_loading')}</div>}
        {error && <div className="card"><p className="error">{error}</p></div>}

        {!loading && !error && view === 'unlocks' && (
          Array.isArray(data) && data.length > 0 ? (
            <div className="insights-list">
              {data.map((item) => (
                <div key={item.id} className="card insights-item">
                  <div className="activity-title">
                    {t('insights_stake_amount', { amount: Number(item.amount).toFixed(4) })}
                  </div>
                  <div className="muted">
                    {t('earn_reward', { reward: item.rewardLabel })}
                    {item.lockupDays ? ` · ${t('day_lock', { days: item.lockupDays })}` : ''}
                  </div>
                  <div className={item.ready ? 'insights-ready' : 'muted'}>
                    {item.ready
                      ? t('insights_unlock_ready')
                      : t('insights_unlock_in', { time: item.timeLeft })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card muted insights-empty">
              <p>{t('insights_unlocks_empty')}</p>
              <button type="button" className="btn btn-secondary" onClick={onGoStake}>
                {t('insights_go_stake')}
              </button>
            </div>
          )
        )}

        {!loading && !error && view === 'gas' && data && (
          <>
            <div className="card insights-summary">
              {t('insights_gas_total', {
                count: data.txCount,
                amount: Number(data.totalPls || 0).toFixed(6),
              })}
            </div>
            {data.items.length > 0 ? (
              <div className="insights-list">
                {data.items.map((item) => (
                  <div key={item.id} className="card insights-item">
                    <div className="activity-title">
                      {Number(item.feePls).toFixed(6)}
                      {' '}
                      PLS
                    </div>
                    <div className="muted">{formatWhen(item.timestamp, t)}</div>
                    <div className="muted">{shortenAddress(item.hash, 8)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card muted">{t('insights_gas_empty')}</div>
            )}
          </>
        )}

        {!loading && !error && view === 'yields' && (
          Array.isArray(data) && data.length > 0 ? (
            <div className="insights-list">
              {data.map((item) => (
                <div key={item.id} className="card insights-item">
                  <div className="activity-title">
                    {t('insights_yield_row', {
                      amount: Number(item.amount).toFixed(4),
                      symbol: item.symbol,
                    })}
                  </div>
                  <div className="muted">{formatWhen(item.timestamp, t)}</div>
                  <div className="muted">{shortenAddress(item.from, 6)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card muted">{t('insights_yields_empty')}</div>
          )
        )}
      </div>
    </div>
  );
}