import {
  memo, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useWallet } from '../../context/WalletContext';
import { useI18n } from '../../context/I18nContext.jsx';
import {
  approveVdo,
  checkApprovePlsFunds,
  checkStakePlsFunds,
  checkUnstakePlsFunds,
  checkVdoApproval,
  clearPoolApyCache,
  fetchPoolApys,
  fetchUserStakes,
  filterStakesForPool,
  formatTimeLeft,
  getCachedPoolApys,
  getCachedVdoApproval,
  rememberVdoApproval,
  stakeVdo,
  unstakeVdo,
} from '../../lib/staking';
import {
  estimateStakeRewards,
  formatCalcAmount,
  poolCalcLabel,
} from '../../lib/stake-calculator';
import { formatFiatAmount } from '../../lib/fiat';
import { STAKING_POOLS } from '../../config/staking';
import { TOKEN_LOGOS } from '../../config/pulsechain';
import TokenIcon from '../../components/TokenIcon';
import SwapErrorModal from '../../components/SwapErrorModal';
import { formatTxError } from '../../lib/gas';
import { parseSendBlocker } from '../../lib/send-blocker';

function tokenFundsBlocker(symbol, have, need, t) {
  const bal = Number(have) || 0;
  const req = Number(need) || 0;
  return {
    reason: 'insufficient_token',
    tokenSymbol: symbol,
    tokenBalance: String(bal),
    tokenRequired: String(req),
    shortfallPls: String(Math.max(0, req - bal)),
    hint: t('send_blocked_hint_token', { symbol }),
  };
}

function withHint(blocker, t) {
  if (!blocker) return null;
  return { ...blocker, hint: blocker.hint || t('send_blocked_hint_pls') };
}

const PoolCard = memo(function PoolCard({
  pool, approved, signer, address, vdoBalance, plsBalance, onDone, onFundsError,
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('stake');
  const [amount, setAmount] = useState('');
  const [stakes, setStakes] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState('');
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadStakes = useCallback(async () => {
    if (!address) return;
    const all = await fetchUserStakes(address);
    setStakes(filterStakesForPool(all, pool));
  }, [address, pool.id, pool.rewardToken, pool.duration]);

  useEffect(() => {
    if (tab === 'unstake') loadStakes();
  }, [tab, loadStakes]);

  useEffect(() => {
    if (tab !== 'unstake' || !selectedIdx) return undefined;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [tab, selectedIdx]);

  const selectedStake = stakes.find((s) => String(s.index) === selectedIdx);
  const unlockLabel = selectedStake
    ? formatTimeLeft(selectedStake.unlockAt - now)
    : '—';

  const showTxError = (e) => {
    const blocker = parseSendBlocker(e, t);
    if (blocker.reason === 'generic') {
      setErr(formatTxError(e));
      return;
    }
    onFundsError?.(blocker);
  };

  const handleStake = async () => {
    if (!signer || !amount || Number(amount) <= 0) return;
    const payAmt = Number(amount);
    const vdoBal = Number(vdoBalance) || 0;

    if (payAmt > vdoBal) {
      onFundsError?.(tokenFundsBlocker('VDO', vdoBal, payAmt, t));
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const funds = await checkStakePlsFunds(
        signer, amount, pool.rewardToken, pool.duration,
      );
      if (!funds.ok && funds.blocker) {
        onFundsError?.(withHint(funds.blocker, t));
        return;
      }
      await stakeVdo(signer, amount, pool.rewardToken, pool.duration);
      setAmount('');
      onDone?.();
    } catch (e) {
      showTxError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleUnstake = async () => {
    if (!signer || selectedIdx === '') return;

    setBusy(true);
    setErr('');
    try {
      const funds = await checkUnstakePlsFunds(signer, Number(selectedIdx));
      if (!funds.ok && funds.blocker) {
        onFundsError?.(withHint(funds.blocker, t));
        return;
      }
      await unstakeVdo(signer, Number(selectedIdx));
      setSelectedIdx('');
      await loadStakes();
      onDone?.();
    } catch (e) {
      showTxError(e);
    } finally {
      setBusy(false);
    }
  };

  const useMax = () => {
    if (vdoBalance > 0) setAmount(String(vdoBalance));
  };

  return (
    <div className="stake-pool-card">
      <div className="stake-pool-header">
        <div className="stake-pool-header-top">
          <div className="stake-pool-flow">
            <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-xl" lazy />
            <span className="stake-flow-arrow">→</span>
            <TokenIcon symbol={pool.rewardLabel} logo={TOKEN_LOGOS[pool.rewardLabel]} className="token-icon-xxl" lazy />
          </div>
          <div className="stake-apy-badge">
            <span className="stake-apy-value">{pool.apy ?? '—'}%</span>
            <span className="stake-apy-label">{t('apy')}</span>
          </div>
        </div>
        <div className="stake-pool-meta">
          <div className="stake-pool-lock">{t('day_lock', { days: pool.lockupDays })}</div>
          <div className="stake-pool-reward">{t('earn_reward', { reward: pool.rewardLabel })}</div>
        </div>
      </div>

      <div className="stake-tabs">
        <button type="button" className={tab === 'stake' ? 'active' : ''} onClick={() => setTab('stake')}>{t('stake_tab')}</button>
        <button type="button" className={tab === 'unstake' ? 'active' : ''} onClick={() => { setTab('unstake'); setSelectedIdx(''); }}>{t('unstake_tab')}</button>
      </div>

      {tab === 'stake' ? (
        <div className="stake-panel">
          <div className="row">
            <label className="label" style={{ margin: 0 }}>{t('amount_to_stake')}</label>
            <button type="button" className="stake-max-btn" onClick={useMax}>{t('max')}</button>
          </div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('placeholder_amount')} />
          <p className="muted stake-hint">{t('available_vdo', { balance: vdoBalance.toFixed(4) })}</p>
          <button type="button" className="btn btn-primary" disabled={busy || !approved} onClick={handleStake}>
            {busy ? t('staking') : t('stake_vdo')}
          </button>
        </div>
      ) : (
        <div className="stake-panel">
          {stakes.length === 0 ? (
            <p className="muted stake-empty">{t('no_active_stakes')}</p>
          ) : (
            <div className="stake-positions">
              {stakes.map((s) => {
                const left = formatTimeLeft(s.unlockAt - now);
                const active = selectedIdx === String(s.index);
                return (
                  <button
                    key={s.index}
                    type="button"
                    className={`stake-position${active ? ' active' : ''}`}
                    onClick={() => setSelectedIdx(String(s.index))}
                  >
                    <div className="stake-position-top">
                      <span className="stake-position-amount">{Number(s.amount).toFixed(2)} VDO</span>
                      <span className="stake-position-id">#{s.index}</span>
                    </div>
                    <span className="stake-position-time">{left}</span>
                  </button>
                );
              })}
            </div>
          )}
          {selectedStake && (
            <div className="stake-unlock-banner">
              <span className="label">{t('unlock_in')}</span>
              <span className="stake-unlock-time">{unlockLabel}</span>
            </div>
          )}
          <button type="button" className="btn btn-secondary" disabled={busy || !selectedIdx} onClick={handleUnstake}>
            {busy ? t('unstaking') : t('unstake_selected')}
          </button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
});

function PoolSection({ title, pools, ...cardProps }) {
  if (!pools.length) return null;
  return (
    <section className="stake-section">
      <div className="stake-section-head">
        <h2 className="stake-section-title">{title}</h2>
      </div>
      {pools.map((pool) => (
        <PoolCard key={pool.id} pool={pool} {...cardProps} />
      ))}
    </section>
  );
}

function CalculatorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="7" y="5" width="10" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="13" r="1" fill="currentColor" />
      <circle cx="12" cy="13" r="1" fill="currentColor" />
      <circle cx="15.5" cy="13" r="1" fill="currentColor" />
      <circle cx="8.5" cy="16.5" r="1" fill="currentColor" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}

function StakeCalculatorModal({
  open, onClose, pools, prices, fiatCurrency, vdoBalance, t, onOpen,
}) {
  const [amount, setAmount] = useState('');
  const [poolId, setPoolId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resultRef = useRef(null);
  const wasOpenRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Prefer pools with live APY; if none yet, still list base pools so UI is usable
  const selectablePools = useMemo(() => {
    const list = pools || [];
    const withApy = list.filter((p) => p.apy != null && Number.isFinite(Number(p.apy)));
    return withApy.length ? withApy : list;
  }, [pools]);

  // Open once: clear form + refresh APYs. Do NOT depend on onOpen identity
  // (inline callbacks re-created every render and wiped calculate results).
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return undefined;
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setError('');
      setResult(null);
      onOpenRef.current?.();
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    // Close when hamburger / other header menus open (avoids stacking under calc)
    const onHeaderMenu = () => onClose?.();
    window.addEventListener('keydown', onKey);
    window.addEventListener('voodoo:header-menu-open', onHeaderMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('voodoo:header-menu-open', onHeaderMenu);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!poolId && selectablePools[0]) {
      setPoolId(String(selectablePools[0].id));
    } else if (poolId && selectablePools.length
      && !selectablePools.some((p) => String(p.id) === String(poolId))) {
      setPoolId(String(selectablePools[0].id));
    }
  }, [open, poolId, selectablePools]);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [result]);

  if (!open) return null;

  const selectedPool = selectablePools.find((p) => String(p.id) === String(poolId))
    || (pools || []).find((p) => String(p.id) === String(poolId));

  const amountNum = Number(String(amount).replace(',', '.'));
  const canCalculate = Number.isFinite(amountNum)
    && amountNum > 0
    && selectedPool
    && selectedPool.apy != null
    && Number.isFinite(Number(selectedPool.apy));

  const runCalculate = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canCalculate) return;
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const est = estimateStakeRewards({
        amount: amountNum,
        apyPercent: Number(selectedPool.apy),
        lockupDays: selectedPool.lockupDays,
      });
      if (!est) {
        setError(t('stake_calc_error_pool'));
        return;
      }
      const rewardPrice = Number(prices?.[selectedPool.rewardLabel] || 0);
      const fiatValue = rewardPrice > 0 ? est.totalReward * rewardPrice : null;
      setResult({
        ...est,
        rewardLabel: selectedPool.rewardLabel,
        fiatValue,
      });
    } catch (err) {
      setError(err?.message || t('stake_calc_error_pool'));
    } finally {
      setBusy(false);
    }
  };

  const useMax = () => {
    if (vdoBalance > 0) {
      setAmount(String(vdoBalance));
      setResult(null);
      setError('');
    }
  };

  return createPortal(
    <div
      className="stake-calc-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="stake-calc-modal" role="dialog" aria-modal="true" aria-label={t('stake_calc_title')}>
        <header className="stake-calc-header">
          <div className="stake-calc-header-left">
            <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-md" />
            <div>
              <h2 className="stake-calc-title">{t('stake_calc_title')}</h2>
              <p className="muted stake-calc-sub">{t('stake_calc_about_body')}</p>
            </div>
          </div>
          <button type="button" className="stake-calc-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="stake-calc-field">
          <div className="stake-calc-field-top">
            <label className="label" htmlFor="stake-calc-amount">{t('stake_calc_amount')}</label>
            <button type="button" className="stake-calc-max-link" onClick={useMax}>
              {t('max')}
            </button>
          </div>
          <div className="stake-calc-input-shell">
            <input
              id="stake-calc-amount"
              className="stake-calc-input"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.,]/g, ''));
                setResult(null);
              }}
            />
            <span className="stake-calc-input-suffix">VDO</span>
          </div>
          <p className="muted stake-calc-avail">
            {t('available_vdo', { balance: Number(vdoBalance || 0).toFixed(4) })}
          </p>
        </div>

        <div className="stake-calc-field">
          <label className="label" htmlFor="stake-calc-pool">{t('stake_calc_pool')}</label>
          <select
            id="stake-calc-pool"
            className="stake-calc-select"
            value={poolId}
            onChange={(e) => {
              setPoolId(e.target.value);
              setResult(null);
            }}
          >
            {selectablePools.length === 0 && (
              <option value="">{t('stake_calc_loading_rates')}</option>
            )}
            {selectablePools.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {poolCalcLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn btn-primary stake-calc-run"
          disabled={busy || !canCalculate}
          onClick={runCalculate}
        >
          {busy ? '…' : t('stake_calc_run')}
        </button>

        {error ? <p className="error stake-calc-error">{error}</p> : null}

        {result && (
          <div className="stake-calc-result" ref={resultRef}>
            <div className="stake-calc-result-head">
              <TokenIcon
                symbol={result.rewardLabel}
                logo={TOKEN_LOGOS[result.rewardLabel]}
                className="token-icon-md"
                lazy
              />
              <div>
                <p className="label">{t('stake_calc_estimated')}</p>
                <p className="stake-calc-reward-main">
                  {formatCalcAmount(result.totalReward, 4)}
                  {' '}
                  {result.rewardLabel}
                </p>
              </div>
            </div>
            <div className="stake-calc-rows">
              <div className="stake-calc-row">
                <span className="muted">{t('stake_calc_fiat_label')}</span>
                <span className="stake-calc-row-val">
                  {result.fiatValue != null
                    ? formatFiatAmount(result.fiatValue, fiatCurrency, 2)
                    : '—'}
                </span>
              </div>
              <div className="stake-calc-row">
                <span className="muted">{t('stake_calc_daily_label')}</span>
                <span className="stake-calc-row-val">
                  {formatCalcAmount(result.dailyReward, 6)}
                  {' '}
                  {result.rewardLabel}
                </span>
              </div>
              <div className="stake-calc-row">
                <span className="muted">{t('day_lock', { days: result.lockupDays })}</span>
                <span className="stake-calc-row-val stake-calc-apy-chip">
                  {Number(result.apy)}
                  % APY
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function Stake() {
  const { t } = useI18n();
  const {
    signer, address, plsBalance, tokens, refresh, prices, fiatCurrency,
  } = useWallet();
  const [pools, setPools] = useState(() => getCachedPoolApys() || STAKING_POOLS);
  const [approved, setApproved] = useState(() => getCachedVdoApproval(address) ?? false);
  const [approving, setApproving] = useState(false);
  const [approveErr, setApproveErr] = useState('');
  const [loadError, setLoadError] = useState('');
  const [fundsBlocker, setFundsBlocker] = useState(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const mountedRef = useRef(true);

  const pls = Number(plsBalance || 0);
  const vdoToken = tokens.find((tok) => tok.symbol === 'VDO');
  const vdoBalance = vdoToken ? Number(vdoToken.balance) : 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async ({ forceApy = false } = {}) => {
    if (!address) return;

    const cachedApys = !forceApy ? getCachedPoolApys() : null;
    const cachedApproval = !forceApy ? getCachedVdoApproval(address) : null;

    if (cachedApys) setPools(cachedApys);
    if (cachedApproval !== null) setApproved(cachedApproval);

    setLoadError('');

    try {
      const [apys, ok] = await Promise.all([
        fetchPoolApys({ force: forceApy }),
        checkVdoApproval(address),
      ]);
      if (!mountedRef.current) return;
      setPools(apys);
      setApproved(ok);
    } catch (e) {
      if (!mountedRef.current) return;
      if (!getCachedPoolApys()) setPools(STAKING_POOLS);
      if (getCachedVdoApproval(address) === null) setApproved(false);
      setLoadError(formatTxError(e) || t('stake_load_failed'));
    }
  }, [address, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setApproved(getCachedVdoApproval(address) ?? false);
  }, [address]);

  const handleDone = useCallback(() => {
    clearPoolApyCache();
    load({ forceApy: true });
    refresh();
  }, [load, refresh]);

  const openCalculatorRefresh = useCallback(() => {
    load({ forceApy: true });
  }, [load]);

  const onFundsError = useCallback((blocker) => {
    setFundsBlocker(blocker);
    setApproveErr('');
  }, []);

  const approve = async () => {
    if (!signer) return;
    setApproveErr('');
    setFundsBlocker(null);
    setApproving(true);
    try {
      // Live gas estimate (not a fixed 0.01 PLS)
      const funds = await checkApprovePlsFunds(signer);
      if (!funds.ok && funds.blocker) {
        setFundsBlocker(withHint(funds.blocker, t));
        return;
      }
      await approveVdo(signer);
      rememberVdoApproval(address, true);
      setApproved(true);
      await refresh();
    } catch (e) {
      const blocker = parseSendBlocker(e, t);
      if (blocker.reason !== 'generic') {
        setFundsBlocker(blocker);
      } else {
        setApproveErr(formatTxError(e));
      }
    } finally {
      setApproving(false);
    }
  };

  const magicPools = pools.filter((p) => p.rewardLabel === 'MAGIC');
  const poisonPools = pools.filter((p) => p.rewardLabel === 'POISON');
  const cardProps = {
    approved,
    signer,
    address,
    vdoBalance,
    plsBalance,
    onDone: handleDone,
    onFundsError,
  };

  return (
    <div className="stake-page">
      {loadError && (
        <div className="card">
          <p className="error">{loadError}</p>
          <button type="button" className="btn btn-secondary" onClick={() => load({ forceApy: true })}>
            {t('retry')}
          </button>
        </div>
      )}

      <div className="stake-hero card">
        <div className="stake-hero-top">
          <div className="stake-hero-icons">
            <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-xl" />
            <span className="stake-hero-arrow">→</span>
            <div className="stake-hero-rewards">
              <TokenIcon symbol="MAGIC" logo={TOKEN_LOGOS.MAGIC} className="token-icon-lg" lazy />
              <TokenIcon symbol="POISON" logo={TOKEN_LOGOS.POISON} className="token-icon-lg" lazy />
            </div>
          </div>
          <button
            type="button"
            className="stake-calc-btn"
            onClick={() => setCalcOpen(true)}
            aria-label={t('stake_calc_title')}
            title={t('stake_calc_title')}
          >
            <CalculatorIcon />
          </button>
        </div>
        <h2 className="stake-hero-title">{t('stake_title')}</h2>
        <p className="muted stake-hero-desc">{t('stake_subtitle')}</p>
      </div>

      <div className="card stake-setup-card">
        <div className="stake-setup-row">
          <div className="stake-setup-item">
            <TokenIcon symbol="PLS" logo={TOKEN_LOGOS.PLS} className="token-icon-md" />
            <div>
              <div className="label">{t('gas_balance')}</div>
              <div className="value">{pls.toFixed(4)} PLS</div>
            </div>
          </div>
          <div className="stake-setup-item">
            <TokenIcon symbol="VDO" logo={TOKEN_LOGOS.VDO} className="token-icon-md" lazy />
            <div>
              <div className="label">{t('your_vdo')}</div>
              <div className="value">{vdoBalance.toFixed(4)}</div>
            </div>
          </div>
        </div>
        <div className="stake-approve-row">
          {approved ? (
            <p className="success stake-approved">{t('vdo_approved')}</p>
          ) : (
            <button
              type="button"
              className={`btn btn-primary stake-approve-btn${approving ? '' : ' stake-approve-pulse'}`}
              disabled={approving}
              onClick={approve}
            >
              {approving ? t('approving') : t('approve_vdo')}
            </button>
          )}
        </div>
        {approveErr && <p className="error">{approveErr}</p>}
      </div>

      <PoolSection title={t('magic_pools')} pools={magicPools} {...cardProps} />
      <PoolSection title={t('poison_pools')} pools={poisonPools} {...cardProps} />

      <SwapErrorModal
        open={Boolean(fundsBlocker)}
        blocker={fundsBlocker}
        onClose={() => setFundsBlocker(null)}
        title={t('send_blocked_title')}
      />

      <StakeCalculatorModal
        open={calcOpen}
        onClose={() => setCalcOpen(false)}
        pools={pools}
        prices={prices}
        fiatCurrency={fiatCurrency}
        vdoBalance={vdoBalance}
        t={t}
        onOpen={openCalculatorRefresh}
      />
    </div>
  );
}
