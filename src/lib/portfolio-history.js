const MAX_POINTS = 180;
const MIN_INTERVAL_MS = 60 * 60_000;

function storageKey(address) {
  return `portfolioHistory:${address.toLowerCase()}`;
}

export async function recordPortfolioSnapshot(address, value, currency = 'usd') {
  if (!address || !chrome?.storage?.local) return;
  const key = storageKey(address);
  const stored = await chrome.storage.local.get(key);
  const existing = Array.isArray(stored[key]) ? [...stored[key]] : [];
  const now = Date.now();
  const numeric = Number(value) || 0;

  const last = existing[existing.length - 1];
  if (last && now - last.t < MIN_INTERVAL_MS) {
    existing[existing.length - 1] = { t: now, v: numeric, c: currency };
  } else {
    existing.push({ t: now, v: numeric, c: currency });
  }

  await chrome.storage.local.set({ [key]: existing.slice(-MAX_POINTS) });
}

export async function getPortfolioHistory(address) {
  if (!address || !chrome?.storage?.local) return [];
  const key = storageKey(address);
  const stored = await chrome.storage.local.get(key);
  return Array.isArray(stored[key]) ? stored[key] : [];
}