/** LiveCoinWatch API — charts + live spot fallback when GeckoTerminal is unavailable */
export const LCW_HISTORY_URL = 'https://api.livecoinwatch.com/coins/single/history';
export const LCW_COIN_URL = 'https://api.livecoinwatch.com/coins/single';
export const LCW_PLATFORM = 'PLS';

export function getLcwApiKey() {
  return (import.meta.env?.VITE_LCW_API_KEY || '').trim();
}

export function hasLcwApiKey() {
  return getLcwApiKey().length > 0;
}