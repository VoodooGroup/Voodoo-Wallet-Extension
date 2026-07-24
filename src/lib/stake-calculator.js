/**
 * Staking calculator estimate.
 *
 * On-chain `rewardRates` return whole percent (15 / 20 / 30) for each pool.
 * The official site uses daily-compound APY over the lock:
 *
 *   dailyRate    = (apy% / 100) / 365
 *   totalRewards = amount * (1 + dailyRate)^lockupDays − amount
 *   dailyReward  = amount * dailyRate   (first-day / nominal daily)
 *
 * Accuracy notes:
 * - Live rates match the contract (source of truth for the %).
 * - Compounding is an *estimate* (matches website); many contracts pay
 *   simple pro-rata: amount × apy% × days/365. Gap is small at low APYs.
 * - Rewards are expressed in the pool reward token units (MAGIC/POISON),
 *   not USD APY of VDO; fiat value uses the current token price feed.
 * - Not a guarantee of on-chain unstake payout (fees, rate changes, etc.).
 *
 * @param apyPercent  Annual % as stored/displayed (e.g. 15 for 15%).
 */
export function estimateStakeRewards({ amount, apyPercent, lockupDays }) {
  const principal = Number(amount);
  const apyPct = Number(apyPercent);
  const days = Number(lockupDays);

  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(apyPct) || apyPct < 0) return null;
  if (!Number.isFinite(days) || days <= 0) return null;

  const apyDecimal = apyPct / 100;
  const dailyRate = apyDecimal / 365;
  // 365 * (days/365) === days
  const totalReward = principal * ((1 + dailyRate) ** days - 1);
  const dailyReward = principal * dailyRate;
  // Simple pro-rata reference (common on-chain style) for comparison tooling
  const simpleTotal = principal * apyDecimal * (days / 365);

  return {
    principal,
    apy: apyPct,
    lockupDays: days,
    totalReward,
    dailyReward,
    simpleTotal,
  };
}

export function formatCalcAmount(value, maxFrac = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  return n.toFixed(maxFrac);
}

/** Compact wallet-style pool label */
export function poolCalcLabel(pool) {
  if (!pool) return '';
  const reward = pool.rewardLabel || pool.rewardToken || 'TOKEN';
  const days = pool.lockupDays ?? '—';
  const apy = pool.apy != null && !Number.isNaN(Number(pool.apy))
    ? `${Number(pool.apy)}%`
    : '—';
  return `${reward} · ${days}d · ${apy} APY`;
}
