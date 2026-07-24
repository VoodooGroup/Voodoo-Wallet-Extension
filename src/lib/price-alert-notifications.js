import { translate } from './i18n/index.js';
import { formatTokenPrice } from './prices.js';

export function buildPriceTargetNotification({
  symbol,
  target,
  current,
  direction,
  currency,
}, locale) {
  const price = formatTokenPrice(current, currency);
  const targetLabel = formatTokenPrice(target, currency);
  const directionKey = direction === 'below'
    ? 'price_alert_direction_below'
    : 'price_alert_direction_above';

  return {
    title: translate(locale, 'notify_price_target_title', { symbol }),
    message: translate(locale, 'notify_price_target_body', {
      symbol,
      price,
      target: targetLabel,
      direction: translate(locale, directionKey),
    }),
  };
}