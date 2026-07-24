import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext.jsx';
import { fetchVdoRichlistRank } from '../lib/richlist';
import { tierBadgeUrl } from '../lib/assets';
import {
  formatVdoAmount,
  resolveVdoTier,
  VDO_HOLDER_TIERS,
} from '../config/vdo-tiers';

function formatRank(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `#${Number(n).toLocaleString()}`;
}

/**
 * Home card: holder tier ladder + explorer rank stats.
 */
export default function VdoRankCard({ address, vdoBalance }) {
  const { t } = useI18n();
  const bal = Number(vdoBalance) || 0;
  const ladder = useMemo(() => resolveVdoTier(bal), [bal]);

  const [state, setState] = useState({
    loading: true,
    rank: null,
    totalHolders: 0,
    percentile: null,
    approx: false,
    error: '',
  });

  useEffect(() => {
    let cancelled = false;

    if (!address || bal <= 0) {
      setState({
        loading: false,
        rank: null,
        totalHolders: 0,
        percentile: null,
        approx: false,
        error: '',
      });
      return undefined;
    }

    setState((s) => ({ ...s, loading: true, error: '' }));

    fetchVdoRichlistRank({ address, balance: bal })
      .then((data) => {
        if (cancelled) return;
        setState({
          loading: false,
          rank: data.rank,
          totalHolders: data.totalHolders,
          percentile: data.percentile,
          approx: Boolean(data.approx),
          error: '',
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err?.message || t('richlist_error'),
        }));
      });

    return () => { cancelled = true; };
  }, [address, bal, t]);

  const tierName = ladder.tier ? t(ladder.tier.nameKey) : t('tier_none');
  const nextName = ladder.next ? t(ladder.next.nameKey) : null;
  const badgeSrc = ladder.tier
    ? tierBadgeUrl(ladder.tier.badge)
    : tierBadgeUrl(VDO_HOLDER_TIERS[0].badge);
  const needAmount = ladder.next
    ? formatVdoAmount(ladder.needForNext)
    : null;
  const unlockAt = ladder.next
    ? formatVdoAmount(ladder.next.min)
    : null;

  return (
    <div className="card richlist-card">
      <div className="richlist-tier-hero">
        <div className="richlist-badge-wrap">
          <img
            src={badgeSrc}
            alt=""
            className={`richlist-badge${bal <= 0 ? ' is-muted' : ''}`}
            width={48}
            height={48}
            draggable={false}
          />
        </div>
        <div className="richlist-tier-copy">
          <div className="richlist-title">{t('richlist_title')}</div>
          <div className="richlist-tier-name">
            {bal <= 0
              ? t('tier_locked')
              : t('tier_you_are', { tier: tierName })}
          </div>
          {bal > 0 && !ladder.next && (
            <p className="muted richlist-tier-next">{t('tier_max')}</p>
          )}
        </div>
      </div>

      {ladder.next && (
        <div className="richlist-unlock">
          <div className="richlist-unlock-need">
            <span className="muted richlist-unlock-label">{t('tier_need_label')}</span>
            <span className="richlist-unlock-amount">
              {t('tier_need_amount', { amount: needAmount })}
            </span>
          </div>
          <div className="richlist-unlock-target">
            {t('tier_unlock_at', {
              tier: nextName,
              amount: unlockAt,
            })}
          </div>
        </div>
      )}

      {(bal > 0 || ladder.next) && (
        <div className="richlist-progress-block">
          <div className="richlist-progress-track" aria-hidden="true">
            <div
              className="richlist-progress-fill"
              style={{ width: `${Math.round((ladder.progress || 0) * 100)}%` }}
            />
          </div>
          <div className="richlist-tier-rail" aria-hidden="true">
            {VDO_HOLDER_TIERS.map((tier) => {
              const active = bal >= tier.min;
              const current = ladder.tier?.id === tier.id;
              return (
                <img
                  key={tier.id}
                  src={tierBadgeUrl(tier.badge)}
                  alt=""
                  title={`${t(tier.nameKey)} · ${formatVdoAmount(tier.min)}+`}
                  className={`richlist-rail-badge${active ? ' is-on' : ''}${current ? ' is-current' : ''}`}
                  width={18}
                  height={18}
                  draggable={false}
                />
              );
            })}
          </div>
        </div>
      )}

      {bal > 0 && state.loading && (
        <p className="muted richlist-loading">{t('richlist_loading')}</p>
      )}

      {bal > 0 && !state.loading && state.error && (
        <p className="error richlist-error">{t('richlist_error')}</p>
      )}

      {bal > 0 && !state.loading && !state.error && (
        <div className="richlist-stats">
          <div className="richlist-stat">
            <span className="muted richlist-stat-label">{t('richlist_rank')}</span>
            <span className="richlist-stat-value">
              {formatRank(state.rank)}
              {state.approx ? '+' : ''}
            </span>
          </div>
          <div className="richlist-stat">
            <span className="muted richlist-stat-label">{t('richlist_top')}</span>
            <span className="richlist-stat-value">
              {state.percentile != null
                ? t('richlist_top_pct', { pct: state.percentile })
                : '—'}
            </span>
          </div>
          <div className="richlist-stat">
            <span className="muted richlist-stat-label">{t('richlist_holders')}</span>
            <span className="richlist-stat-value">
              {state.totalHolders > 0
                ? state.totalHolders.toLocaleString()
                : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
