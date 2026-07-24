import { getIncomingNotifyEnabled, getPrefs, getWalletState, INCOMING_NOTIFY_KEY } from '../lib/storage.js';
import { clearActivityCache, fetchWalletActivity } from '../lib/transactions.js';
import { isIncomingCredit } from '../lib/incoming-notifications.js';
import { showTransferNotification } from './transfer-notify.js';

const NOTIFY_STATE_KEY = 'voodoo_notify_state_v1';
const ALARM_NAME = 'incoming-tx-poll';
const POLL_MINUTES = 1;
const MAX_SEEN_IDS = 80;

async function getNotifyState() {
  const result = await chrome.storage.local.get(NOTIFY_STATE_KEY);
  return result[NOTIFY_STATE_KEY] || { byAddress: {} };
}

async function setNotifyState(state) {
  await chrome.storage.local.set({ [NOTIFY_STATE_KEY]: state });
}

function addressState(state, address) {
  const key = address.toLowerCase();
  if (!state.byAddress[key]) {
    state.byAddress[key] = { seeded: false, seenIds: [] };
  }
  return state.byAddress[key];
}

function rememberSeen(addrState, txId) {
  const ids = addrState.seenIds.filter((id) => id !== txId);
  ids.unshift(txId);
  addrState.seenIds = ids.slice(0, MAX_SEEN_IDS);
}

async function pollAddress(account, state, locale, seedOnly) {
  const addrState = addressState(state, account.address);
  clearActivityCache(account.address);
  const data = await fetchWalletActivity(account.address, null, 'scan', { bypassCache: true });
  const incoming = data.items.filter((tx) => isIncomingCredit(tx, account.address));

  if (!addrState.seeded || seedOnly) {
    const cutoff = state.enabledAt ?? Date.now();
    incoming
      .filter((tx) => !tx.timestamp || tx.timestamp < cutoff)
      .forEach((tx) => rememberSeen(addrState, tx.id));
    addrState.seeded = true;
    return 0;
  }

  let shown = 0;
  const unseen = incoming.filter((tx) => !addrState.seenIds.includes(tx.id));
  unseen.sort((a, b) => a.timestamp - b.timestamp);

  for (const tx of unseen) {
    await showTransferNotification({
      kind: 'received',
      amount: tx.amount,
      symbol: tx.symbol,
      from: tx.sender || tx.counterparty,
      accountName: account.name,
      hash: tx.hash,
    });
    rememberSeen(addrState, tx.id);
    shown += 1;
  }

  return shown;
}

export async function pollIncomingTransactions({ seedOnly = false } = {}) {
  const [enabled, prefs, walletState] = await Promise.all([
    getIncomingNotifyEnabled(),
    getPrefs(),
    getWalletState(),
  ]);
  if (!enabled || !walletState?.vault) {
    return { ok: false, reason: 'disabled' };
  }

  const accounts = prefs.watchedAccounts || [];
  if (!accounts.length) {
    return { ok: false, reason: 'no_accounts' };
  }

  const locale = prefs.locale || walletState.locale || 'en';
  const state = await getNotifyState();
  let notified = 0;

  for (const account of accounts) {
    try {
      notified += await pollAddress(account, state, locale, seedOnly);
    } catch {
      /* skip address on transient API errors */
    }
  }

  await setNotifyState(state);
  return { ok: true, notified };
}

export async function setIncomingNotificationsEnabled(enabled) {
  await chrome.alarms.clear(ALARM_NAME);
  if (!enabled) return;

  const state = await getNotifyState();
  state.enabledAt = Date.now();
  await setNotifyState(state);

  await pollIncomingTransactions({ seedOnly: true });
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: POLL_MINUTES });
  await pollIncomingTransactions({ seedOnly: false });
}

export function initIncomingTxMonitor() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      pollIncomingTransactions().catch(() => {});
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const notifyChange = changes[INCOMING_NOTIFY_KEY];
    if (!notifyChange) return;
    const enabled = Boolean(notifyChange.newValue);
    const wasEnabled = Boolean(notifyChange.oldValue);
    if (enabled === wasEnabled) return;
    setIncomingNotificationsEnabled(enabled).catch(() => {});
  });

  getIncomingNotifyEnabled().then((enabled) => {
    if (enabled) {
      setIncomingNotificationsEnabled(true).catch(() => {});
    }
  }).catch(() => {});
}

export async function clearIncomingNotificationState() {
  await chrome.storage.local.remove(NOTIFY_STATE_KEY);
  await chrome.alarms.clear(ALARM_NAME);
}