export const ALERT_SYMBOLS = ['VDO', 'MAGIC', 'POISON', 'PLS'];

export function createPriceAlertId() {
  return `pa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizePriceAlert(alert) {
  const symbol = String(alert?.symbol || '').toUpperCase();
  const target = Number(alert?.target);
  const direction = alert?.direction === 'below' ? 'below' : 'above';
  const currency = String(alert?.currency || 'usd').toLowerCase();
  if (!ALERT_SYMBOLS.includes(symbol) || !Number.isFinite(target) || target <= 0) {
    return null;
  }
  return {
    id: alert?.id || createPriceAlertId(),
    symbol,
    target,
    direction,
    currency,
    createdAt: Number(alert?.createdAt) || Date.now(),
  };
}

export function didCrossPriceTarget(alert, previousPrice, currentPrice) {
  const prev = Number(previousPrice);
  const current = Number(currentPrice);
  const target = Number(alert?.target);
  if (!Number.isFinite(prev) || prev <= 0 || !Number.isFinite(current) || current <= 0) {
    return false;
  }
  if (alert.direction === 'above') {
    return prev < target && current >= target;
  }
  return prev > target && current <= target;
}

export function defaultAlertDirection(currentPrice, targetPrice) {
  const current = Number(currentPrice);
  const target = Number(targetPrice);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return 'above';
  return target >= current ? 'above' : 'below';
}