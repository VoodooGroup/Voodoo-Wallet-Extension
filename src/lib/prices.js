import { getFiatSymbol, normalizeFiatCode } from './fiat';
import { hasLcwApiKey } from '../config/livecoinwatch.js';
import {
  fetchLiveCoinWatchTokenUsdPrices,
  fillMissingPricesFromLiveCoinWatch,
} from './livecoinwatch.js';

/**
 * Price order: 1) GeckoTerminal (CoinGecko Terminal)
 *              2) DexScreener
 *              3) LiveCoinWatch — fallback only for missing tokens
 */

const CACHE_MS = 30_000;
const STALE_OK_MS = 15 * 60_000;
const GT_API = 'https://api.geckoterminal.com/api/v2';
const DEX_API = 'https://api.dexscreener.com/latest/dex/tokens';
const FOREX_API = 'https://open.er-api.com/v6/latest/USD';
const FETCH_TIMEOUT_MS = 10_000;

const TOKENS = {
  VDO: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
  MAGIC: '0xd63b9d8d6e38cb7fbfdceede3ce92f97f5aea7ac',
  POISON: '0xb8c8761fed2aad5c0a75561bc604531a42c452e6',
  WPLS: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
};

const EMPTY_PRICES = {
  PLS: 0,
  WPLS: 0,
  VDO: 0,
  VDO_CHANGE_24H: 0,
  MAGIC: 0,
  MAGIC_CHANGE_24H: 0,
  POISON: 0,
  POISON_CHANGE_24H: 0,
};

let cache = { at: 0, data: {} };
let lastGood = { at: 0, usd: null };
let forexCache = { at: 0, rates: { usd: 1 } };
let inflightByFiat = new Map();

async function fetchJson(url, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Price request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function emptyUsd() {
  return { ...EMPTY_PRICES };
}

function hasAnyPrice(usd) {
  return ['VDO', 'MAGIC', 'POISON', 'PLS', 'WPLS'].some((k) => Number(usd?.[k]) > 0);
}

function hasVdo(usd) {
  return Number(usd?.VDO) > 0;
}

function rememberGood(usd) {
  if (hasAnyPrice(usd)) lastGood = { at: Date.now(), usd: { ...usd } };
}

function mergeUsd(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (k.endsWith('_CHANGE_24H')) {
      if (!out[k] && Number(v)) out[k] = Number(v);
      continue;
    }
    if (!(Number(out[k]) > 0) && Number(v) > 0) out[k] = Number(v);
  }
  return out;
}

/* ─── 1) GeckoTerminal ─────────────────────────────────────────── */

async function gtSimplePrices(addresses) {
  const joined = addresses.map((a) => a.toLowerCase()).join(',');
  const json = await fetchJson(`${GT_API}/simple/networks/pulsechain/token_price/${joined}`);
  if (json?.status?.error_code) {
    const err = new Error(json.status.error_message || 'GeckoTerminal error');
    err.status = Number(json.status.error_code) || 0;
    throw err;
  }
  return json?.data?.attributes?.token_prices || {};
}

async function fetchFromGeckoTerminal() {
  const map = await gtSimplePrices(Object.values(TOKENS));
  const usd = emptyUsd();

  for (const [symbol, address] of Object.entries(TOKENS)) {
    if (symbol === 'WPLS') continue;
    const price = Number(map[address.toLowerCase()]) || 0;
    if (price > 0) usd[symbol] = price;
  }

  const wpls = Number(map[TOKENS.WPLS.toLowerCase()]) || 0;
  if (wpls > 0) {
    usd.PLS = wpls;
    usd.WPLS = wpls;
  }

  if (!hasAnyPrice(usd)) throw new Error('GeckoTerminal returned no prices');
  return usd;
}

/* ─── 2) LiveCoinWatch ─────────────────────────────────────────── */

async function fetchFromLiveCoinWatch() {
  if (!hasLcwApiKey()) throw new Error('LiveCoinWatch API key not configured');
  const tokenUsd = await fetchLiveCoinWatchTokenUsdPrices();
  const usd = emptyUsd();
  usd.VDO = tokenUsd.VDO || 0;
  usd.VDO_CHANGE_24H = tokenUsd.VDO_CHANGE_24H || 0;
  usd.MAGIC = tokenUsd.MAGIC || 0;
  usd.MAGIC_CHANGE_24H = tokenUsd.MAGIC_CHANGE_24H || 0;
  usd.POISON = tokenUsd.POISON || 0;
  usd.POISON_CHANGE_24H = tokenUsd.POISON_CHANGE_24H || 0;
  if (!hasAnyPrice(usd)) throw new Error('LiveCoinWatch returned no prices');
  return usd;
}

/* ─── 3) DexScreener ───────────────────────────────────────────── */

async function fetchFromDexScreener() {
  const addresses = Object.values(TOKENS).join(',');
  const json = await fetchJson(`${DEX_API}/${addresses}`);
  const pairs = json.pairs || [];
  const usd = emptyUsd();

  const bestPair = (address) => pairs
    .filter((p) => p.chainId === 'pulsechain'
      && p.baseToken?.address?.toLowerCase() === address.toLowerCase()
      && p.priceUsd != null)
    .sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0))[0];

  for (const [symbol, address] of Object.entries(TOKENS)) {
    if (symbol === 'WPLS') continue;
    const best = bestPair(address);
    if (best) {
      usd[symbol] = Number(best.priceUsd) || 0;
      usd[`${symbol}_CHANGE_24H`] = Number(best.priceChange?.h24) || 0;
    }
  }

  const wplsPair = bestPair(TOKENS.WPLS);
  if (wplsPair) {
    usd.PLS = Number(wplsPair.priceUsd) || 0;
    usd.WPLS = usd.PLS;
  }

  if (!hasAnyPrice(usd)) throw new Error('DexScreener returned no prices');
  return usd;
}

async function fetchPlsFromCoinGecko(fiat) {
  try {
    const json = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=pulsechain&vs_currencies=${fiat}`,
    );
    return Number(json.pulsechain?.[fiat]) || 0;
  } catch {
    return 0;
  }
}

async function getForexRates() {
  if (Date.now() - forexCache.at < CACHE_MS && forexCache.rates) return forexCache.rates;
  try {
    const json = await fetchJson(FOREX_API);
    const rates = Object.fromEntries(
      Object.entries(json.rates || {}).map(([code, rate]) => [code.toLowerCase(), Number(rate) || 0]),
    );
    rates.usd = 1;
    forexCache = { at: Date.now(), rates };
    return rates;
  } catch {
    return forexCache.rates || { usd: 1 };
  }
}

function applyFiatRate(usdPrices, fiat, rate) {
  const multiplier = fiat === 'usd' ? 1 : (rate || 1);
  return {
    PLS: (usdPrices.PLS || 0) * multiplier,
    WPLS: (usdPrices.WPLS || 0) * multiplier,
    VDO: (usdPrices.VDO || 0) * multiplier,
    VDO_CHANGE_24H: usdPrices.VDO_CHANGE_24H || 0,
    MAGIC: (usdPrices.MAGIC || 0) * multiplier,
    MAGIC_CHANGE_24H: usdPrices.MAGIC_CHANGE_24H || 0,
    POISON: (usdPrices.POISON || 0) * multiplier,
    POISON_CHANGE_24H: usdPrices.POISON_CHANGE_24H || 0,
  };
}

/**
 * 1) GeckoTerminal (primary)
 * 2) DexScreener (public gap-fill)
 * 3) LiveCoinWatch (fallback for any tokens still missing)
 */
async function fetchUsdPrices() {
  let usd = emptyUsd();

  // 1) GeckoTerminal / CoinGecko Terminal
  try {
    const gt = await fetchFromGeckoTerminal();
    usd = mergeUsd(usd, gt);
  } catch (err) {
    console.warn('GT prices failed:', err?.message || err);
  }

  // 2) DexScreener — fill gaps without API key
  if (!hasVdo(usd) || !hasAnyPrice(usd)
    || !(Number(usd.MAGIC) > 0) || !(Number(usd.POISON) > 0) || !(Number(usd.PLS) > 0)) {
    try {
      const dex = await fetchFromDexScreener();
      usd = mergeUsd(usd, dex);
    } catch (err) {
      console.warn('DexScreener prices failed:', err?.message || err);
    }
  }

  // 3) LiveCoinWatch — only for remaining zeros
  if (hasLcwApiKey()) {
    const missingCore = ['VDO', 'MAGIC', 'POISON'].some((s) => !(Number(usd[s]) > 0));
    if (missingCore) {
      try {
        usd = await fillMissingPricesFromLiveCoinWatch(usd, ['VDO', 'MAGIC', 'POISON']);
      } catch (err) {
        console.warn('LCW prices fallback failed:', err?.message || err);
      }
    }
  }

  // Last resort: full LCW snapshot if still empty
  if (!hasAnyPrice(usd) && hasLcwApiKey()) {
    try {
      const lcw = await fetchFromLiveCoinWatch();
      usd = mergeUsd(usd, lcw);
    } catch (err) {
      console.warn('LCW full prices failed:', err?.message || err);
    }
  }

  if (hasAnyPrice(usd)) {
    rememberGood(usd);
    return usd;
  }

  if (lastGood.usd && Date.now() - lastGood.at < STALE_OK_MS) {
    return { ...lastGood.usd };
  }

  throw new Error('All price sources failed');
}

export async function fetchFiatPrices(currency = 'usd', { bypassCache = false } = {}) {
  const fiat = normalizeFiatCode(currency);

  if (
    !bypassCache
    && Date.now() - cache.at < CACHE_MS
    && cache.data[fiat]
    && hasVdo(cache.data[fiat])
  ) {
    return cache.data[fiat];
  }

  // Don't serve "any price" cache without VDO for long — prefer refetch
  if (
    !bypassCache
    && Date.now() - cache.at < CACHE_MS
    && cache.data[fiat]
    && hasAnyPrice(cache.data[fiat])
    && hasVdo(cache.data[fiat])
  ) {
    return cache.data[fiat];
  }

  if (!bypassCache && inflightByFiat.has(fiat)) {
    return inflightByFiat.get(fiat);
  }

  const job = (async () => {
    try {
      const [usdPrices, forexRates] = await Promise.all([
        fetchUsdPrices(),
        getForexRates(),
      ]);

      let prices = applyFiatRate(usdPrices, fiat, forexRates[fiat]);

      if (!prices.PLS) {
        const plsDirect = await fetchPlsFromCoinGecko(fiat);
        if (plsDirect > 0) {
          prices = { ...prices, PLS: plsDirect, WPLS: plsDirect };
        }
      }

      if (hasAnyPrice(prices)) {
        cache = { at: Date.now(), data: { ...cache.data, [fiat]: prices } };
      }
      return prices;
    } catch (err) {
      console.warn('fetchFiatPrices failed:', err?.message || err);
      if (cache.data[fiat] && hasAnyPrice(cache.data[fiat])) return cache.data[fiat];
      if (lastGood.usd && Date.now() - lastGood.at < STALE_OK_MS) {
        const forexRates = await getForexRates();
        return applyFiatRate(lastGood.usd, fiat, forexRates[fiat]);
      }
      return { ...EMPTY_PRICES };
    } finally {
      inflightByFiat.delete(fiat);
    }
  })();

  inflightByFiat.set(fiat, job);
  return job;
}

export function portfolioFiatValue({ pls, tokens }, prices) {
  let total = Number(pls || 0) * (prices.PLS || 0);
  tokens.forEach((t) => {
    total += Number(t.balance || 0) * (prices[t.symbol] || 0);
  });
  return total;
}

export function formatTokenPrice(price, currency = 'usd') {
  const n = Number(price || 0);
  if (n === 0) return '—';
  const symbol = getFiatSymbol(currency);
  if (n < 0.01) return `${symbol}${n.toFixed(8)}`;
  if (n < 1) return `${symbol}${n.toFixed(6)}`;
  return `${symbol}${n.toFixed(4)}`;
}
