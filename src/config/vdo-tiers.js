/**
 * VDO holder tier ladder (min balance inclusive).
 * Thresholds are fixed community ranks — tweak here if official cutoffs change.
 */
export const VDO_HOLDER_TIERS = [
  {
    id: 'bronze',
    min: 1,
    badge: 'tier-bronze.png',
    nameKey: 'tier_bronze',
  },
  {
    id: 'silver',
    min: 1_000,
    badge: 'tier-silver.png',
    nameKey: 'tier_silver',
  },
  {
    id: 'gold',
    min: 10_000,
    badge: 'tier-gold.png',
    nameKey: 'tier_gold',
  },
  {
    id: 'yellowgem',
    min: 50_000,
    badge: 'tier-yellowgem.png',
    nameKey: 'tier_yellowgem',
  },
  {
    id: 'bluegem',
    min: 100_000,
    badge: 'tier-bluegem.png',
    nameKey: 'tier_bluegem',
  },
  {
    id: 'sapphire',
    min: 500_000,
    badge: 'tier-sapphire.png',
    nameKey: 'tier_sapphire',
  },
];

/**
 * @returns {{
 *   tier: object|null,
 *   next: object|null,
 *   needForNext: number,
 *   progress: number, // 0..1 toward next tier (1 if max)
 * }}
 */
export function resolveVdoTier(balance) {
  const bal = Number(balance) || 0;
  if (bal <= 0) {
    return {
      tier: null,
      next: VDO_HOLDER_TIERS[0],
      needForNext: VDO_HOLDER_TIERS[0].min,
      progress: 0,
    };
  }

  let current = VDO_HOLDER_TIERS[0];
  for (const tier of VDO_HOLDER_TIERS) {
    if (bal >= tier.min) current = tier;
  }

  const idx = VDO_HOLDER_TIERS.findIndex((t) => t.id === current.id);
  const next = idx >= 0 && idx < VDO_HOLDER_TIERS.length - 1
    ? VDO_HOLDER_TIERS[idx + 1]
    : null;

  if (!next) {
    return { tier: current, next: null, needForNext: 0, progress: 1 };
  }

  const span = next.min - current.min;
  const into = bal - current.min;
  const progress = span > 0 ? Math.min(1, Math.max(0, into / span)) : 1;
  const needForNext = Math.max(0, next.min - bal);

  return { tier: current, next, needForNext, progress };
}

export function formatVdoAmount(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
