import { getPrefs, getWalletState } from '../lib/storage.js';
import { buildPriceTargetNotification } from '../lib/price-alert-notifications.js';

function iconUrl() {
  return chrome.runtime.getURL('public/icon128.png');
}

async function resolveLocale() {
  const [prefs, walletState] = await Promise.all([getPrefs(), getWalletState()]);
  return prefs.locale || walletState?.locale || 'en';
}

export async function showPriceTargetNotification(payload) {
  const locale = await resolveLocale();
  const content = buildPriceTargetNotification(payload, locale);

  await chrome.notifications.create(`price-alert-${payload.id}`, {
    type: 'basic',
    iconUrl: iconUrl(),
    title: content.title,
    message: content.message,
    priority: 2,
    silent: false,
  });

  return { ok: true };
}