import { getIncomingNotifyEnabled, getPrefs, getWalletState } from '../lib/storage.js';
import {
  buildIncomingNotification,
  buildSentNotification,
} from '../lib/incoming-notifications.js';

function iconUrl() {
  return chrome.runtime.getURL('public/icon128.png');
}

async function resolveLocale() {
  const [prefs, walletState] = await Promise.all([getPrefs(), getWalletState()]);
  return prefs.locale || walletState?.locale || 'en';
}

export async function showTransferNotification(payload) {
  if (!(await getIncomingNotifyEnabled())) {
    return { ok: false, reason: 'disabled' };
  }

  const locale = await resolveLocale();
  let content;

  if (payload.kind === 'sent') {
    content = buildSentNotification({
      amount: payload.amount,
      symbol: payload.symbol,
      to: payload.to,
      accountName: payload.accountName,
    }, locale);
  } else if (payload.kind === 'received') {
    content = buildIncomingNotification({
      amount: payload.amount,
      symbol: payload.symbol,
      direction: 'received',
      status: 'success',
      sender: payload.from,
      counterparty: payload.from,
    }, payload.accountName, locale);
  } else {
    return { ok: false, reason: 'unknown_kind' };
  }

  const idBase = payload.hash || `${payload.kind}-${Date.now()}`;
  await chrome.notifications.create(`transfer-${idBase}`, {
    type: 'basic',
    iconUrl: iconUrl(),
    title: content.title,
    message: content.message,
    priority: 2,
    silent: false,
  });

  return { ok: true };
}