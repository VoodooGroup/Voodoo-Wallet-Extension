export const STORAGE_KEY = 'voodoo_wallet_v1';
export const PREFS_KEY = 'voodoo_wallet_prefs_v1';
/** Isolated boolean — never merged with watchedAccounts updates. */
export const INCOMING_NOTIFY_KEY = 'voodoo_incoming_notify_v1';
export const PRICE_ALERTS_ENABLED_KEY = 'voodoo_price_alerts_enabled_v1';
export const PRICE_ALERTS_KEY = 'voodoo_price_alerts_v1';
/** Show VDO rich-list rank card on Home (default on). */
export const RICHLIST_HOME_KEY = 'voodoo_richlist_home_v1';
/** Optional: require authenticator code when confirming Send transfers. */
export const TRANSFER_2FA_KEY = 'voodoo_transfer_2fa_v1';
/** Local TOTP (Google Authenticator–compatible) — see lib/totp.js */
export const TOTP_KEY = 'voodoo_totp_v1';

function assertChrome() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    throw new Error('Chrome extension APIs unavailable. Load the built dist folder via chrome://extensions.');
  }
}

export async function getWalletState() {
  assertChrome();
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

export async function setWalletState(state) {
  assertChrome();
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('QUOTA') || msg.includes('quota')) {
      throw new Error('Wallet storage full. Remove a custom token logo or reset the wallet.');
    }
    throw err;
  }
}

export async function clearWalletState() {
  assertChrome();
  await chrome.storage.local.remove(STORAGE_KEY);
}

export async function getPrefs() {
  assertChrome();
  const result = await chrome.storage.local.get(PREFS_KEY);
  return result[PREFS_KEY] || {};
}

export async function getIncomingNotifyEnabled() {
  assertChrome();
  const result = await chrome.storage.local.get([INCOMING_NOTIFY_KEY, PREFS_KEY]);
  if (typeof result[INCOMING_NOTIFY_KEY] === 'boolean') {
    return result[INCOMING_NOTIFY_KEY];
  }
  const legacy = Boolean(result[PREFS_KEY]?.incomingNotifications);
  if (legacy) {
    await chrome.storage.local.set({ [INCOMING_NOTIFY_KEY]: true });
  }
  return legacy;
}

export async function setIncomingNotifyEnabled(enabled) {
  assertChrome();
  await chrome.storage.local.set({ [INCOMING_NOTIFY_KEY]: Boolean(enabled) });
}

export async function getPriceAlertsEnabled() {
  assertChrome();
  const result = await chrome.storage.local.get(PRICE_ALERTS_ENABLED_KEY);
  return Boolean(result[PRICE_ALERTS_ENABLED_KEY]);
}

export async function setPriceAlertsEnabled(enabled) {
  assertChrome();
  await chrome.storage.local.set({ [PRICE_ALERTS_ENABLED_KEY]: Boolean(enabled) });
}

/** @returns {Promise<boolean>} default true when unset */
export async function getRichlistHomeEnabled() {
  assertChrome();
  const result = await chrome.storage.local.get(RICHLIST_HOME_KEY);
  if (typeof result[RICHLIST_HOME_KEY] === 'boolean') {
    return result[RICHLIST_HOME_KEY];
  }
  return true;
}

export async function setRichlistHomeEnabled(enabled) {
  assertChrome();
  await chrome.storage.local.set({ [RICHLIST_HOME_KEY]: Boolean(enabled) });
}

/** @returns {Promise<boolean>} default false */
export async function getTransfer2faEnabled() {
  assertChrome();
  const result = await chrome.storage.local.get(TRANSFER_2FA_KEY);
  return Boolean(result[TRANSFER_2FA_KEY]);
}

export async function setTransfer2faEnabled(enabled) {
  assertChrome();
  await chrome.storage.local.set({ [TRANSFER_2FA_KEY]: Boolean(enabled) });
}

export async function getPriceAlerts() {
  assertChrome();
  const result = await chrome.storage.local.get(PRICE_ALERTS_KEY);
  const alerts = result[PRICE_ALERTS_KEY];
  return Array.isArray(alerts) ? alerts : [];
}

export async function setPriceAlerts(alerts) {
  assertChrome();
  await chrome.storage.local.set({ [PRICE_ALERTS_KEY]: alerts });
}

let prefsWriteChain = Promise.resolve();

/** Serialized read-merge-write so concurrent pref updates cannot clobber each other. */
export async function setPrefs(patch) {
  assertChrome();
  const write = async () => {
    const current = await getPrefs();
    await chrome.storage.local.set({ [PREFS_KEY]: { ...current, ...patch } });
  };
  prefsWriteChain = prefsWriteChain.then(write, write);
  return prefsWriteChain;
}