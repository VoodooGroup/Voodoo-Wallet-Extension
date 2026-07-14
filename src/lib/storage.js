const STORAGE_KEY = 'voodoo_wallet_v1';
const PREFS_KEY = 'voodoo_wallet_prefs_v1';

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

export async function setPrefs(patch) {
  assertChrome();
  const current = await getPrefs();
  await chrome.storage.local.set({ [PREFS_KEY]: { ...current, ...patch } });
}