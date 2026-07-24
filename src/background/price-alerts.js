import {
  getPriceAlerts,
  getPriceAlertsEnabled,
  PRICE_ALERTS_ENABLED_KEY,
  PRICE_ALERTS_KEY,
  setPriceAlerts,
} from '../lib/storage.js';
import { fetchFiatPrices } from '../lib/prices.js';
import {
  didCrossPriceTarget,
  normalizePriceAlert,
} from '../lib/price-alerts.js';
import { showPriceTargetNotification } from './price-alert-notify.js';

const STATE_KEY = 'voodoo_price_alert_state_v1';
const ALARM_NAME = 'price-alert-poll';
const POLL_MINUTES = 5;

async function getAlertState() {
  const result = await chrome.storage.local.get(STATE_KEY);
  return result[STATE_KEY] || { lastPrices: {} };
}

async function setAlertState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

function priceStateKey(symbol, currency) {
  return `${symbol.toUpperCase()}:${currency.toLowerCase()}`;
}

function readLastPrice(state, symbol, currency) {
  return state.lastPrices?.[priceStateKey(symbol, currency)];
}

function writeLastPrice(state, symbol, currency, price) {
  if (!state.lastPrices) state.lastPrices = {};
  state.lastPrices[priceStateKey(symbol, currency)] = price;
}

export async function pollPriceAlerts() {
  const [enabled, rawAlerts] = await Promise.all([
    getPriceAlertsEnabled(),
    getPriceAlerts(),
  ]);

  if (!enabled) {
    return { ok: false, reason: 'disabled' };
  }

  const alerts = rawAlerts
    .map((alert) => normalizePriceAlert(alert))
    .filter(Boolean);

  if (!alerts.length) {
    return { ok: true, notified: 0 };
  }

  const state = await getAlertState();
  const remaining = [];
  let notified = 0;

  const byCurrency = alerts.reduce((map, alert) => {
    const key = alert.currency;
    if (!map[key]) map[key] = [];
    map[key].push(alert);
    return map;
  }, {});

  for (const [currency, currencyAlerts] of Object.entries(byCurrency)) {
    let prices;
    try {
      prices = await fetchFiatPrices(currency, { bypassCache: true });
    } catch {
      remaining.push(...currencyAlerts);
      continue;
    }

    for (const alert of currencyAlerts) {
      const current = Number(prices[alert.symbol] || 0);
      const previous = readLastPrice(state, alert.symbol, alert.currency);

      if (current > 0) {
        if (previous != null && didCrossPriceTarget(alert, previous, current)) {
          await showPriceTargetNotification({
            id: alert.id,
            symbol: alert.symbol,
            target: alert.target,
            current,
            direction: alert.direction,
            currency: alert.currency,
          });
          notified += 1;
        } else {
          remaining.push(alert);
        }
        writeLastPrice(state, alert.symbol, alert.currency, current);
      } else {
        remaining.push(alert);
      }
    }
  }

  if (remaining.length !== rawAlerts.length) {
    await setPriceAlerts(remaining);
  }

  await setAlertState(state);
  return { ok: true, notified };
}

export async function setPriceAlertsEnabled(enabled) {
  await chrome.alarms.clear(ALARM_NAME);
  if (!enabled) return;

  const state = await getAlertState();
  state.enabledAt = Date.now();
  await setAlertState(state);

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
  await pollPriceAlerts();
}

export function initPriceAlertMonitor() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      pollPriceAlerts().catch(() => {});
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    const enabledChange = changes[PRICE_ALERTS_ENABLED_KEY];
    if (enabledChange) {
      const enabled = Boolean(enabledChange.newValue);
      const wasEnabled = Boolean(enabledChange.oldValue);
      if (enabled !== wasEnabled) {
        setPriceAlertsEnabled(enabled).catch(() => {});
      }
      return;
    }

    if (changes[PRICE_ALERTS_KEY]) {
      getPriceAlertsEnabled().then((enabled) => {
        if (enabled) pollPriceAlerts().catch(() => {});
      }).catch(() => {});
    }
  });

  getPriceAlertsEnabled().then((enabled) => {
    if (enabled) {
      setPriceAlertsEnabled(true).catch(() => {});
    }
  }).catch(() => {});
}

export async function clearPriceAlertState() {
  await chrome.storage.local.remove(STATE_KEY);
  await chrome.alarms.clear(ALARM_NAME);
}