import { CHART_TOKENS, getChartToken } from '../config/chart-tokens.js';
import { hasLcwApiKey } from '../config/livecoinwatch.js';
import { fetchLiveCoinWatchChart } from './livecoinwatch.js';

const GT_API = 'https://api.geckoterminal.com/api/v2';
const DEX_PAIRS_API = 'https://api.dexscreener.com/token-pairs/v1/pulsechain';
const CACHE_MS = 10 * 60_000;
const GT_MIN_INTERVAL_MS = 250;
const GT_MAX_RETRIES = 2;
const FETCH_TIMEOUT_MS = 10_000;
const CHART_LOAD_TIMEOUT_MS = 14_000;
const LCW_TIMEOUT_MS = 5_000;

const poolCache = new Map();
const chartCache = new Map();
const inflight = new Map();

let gtQueue = Promise.resolve();
let lastGtFetchAt = 0;

export const CHART_RANGES = [
  { id: '24H', label: '24H' },
  { id: '7D', label: '7D' },
  { id: '30D', label: '30D' },
  { id: '90D', label: '90D' },
  { id: '12M', label: '12M' },
];

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function cacheKey(symbol, rangeId) {
  return `${symbol}:${rangeId}`;
}

function withTimeout(promise, ms, label = 'Request') {
  let timer;
  return Promise.race([
    promise.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Chart request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function getCachedTokenChart(symbol, rangeId = '24H') {
  const cached = chartCache.get(cacheKey(symbol, rangeId));
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;
  return null;
}

export function prefetchTokenCharts(symbols = CHART_TOKENS.map((t) => t.symbol), rangeId = '24H') {
  // Stagger so the active chart is not stuck behind a long queue.
  symbols.forEach((symbol, index) => {
    setTimeout(() => {
      fetchTokenChart(symbol, rangeId).catch(() => {});
    }, index * 350);
  });
}

function storeChart(symbol, rangeId, data) {
  chartCache.set(cacheKey(symbol, rangeId), { at: Date.now(), data });
  return data;
}

function rangeParams(rangeId) {
  switch (rangeId) {
    case '24H':
      return { timeframe: 'hour', limit: 24, aggregate: 1 };
    case '7D':
      return { timeframe: 'hour', limit: 168, aggregate: 1 };
    case '30D':
      return { timeframe: 'day', limit: 30, aggregate: 1 };
    case '90D':
      return { timeframe: 'day', limit: 90, aggregate: 1 };
    case '12M':
      return { timeframe: 'day', limit: 365, aggregate: 1 };
    default:
      return { timeframe: 'hour', limit: 24, aggregate: 1 };
  }
}

function enqueueGt(task) {
  const run = async () => {
    const wait = Math.max(0, GT_MIN_INTERVAL_MS - (Date.now() - lastGtFetchAt));
    if (wait > 0) await sleep(wait);
    lastGtFetchAt = Date.now();
    return task();
  };
  const next = gtQueue.then(run, run);
  gtQueue = next.catch(() => {});
  return next;
}

async function gtFetch(path) {
  return enqueueGt(async () => {
    let lastError = new Error('Chart data unavailable');

    for (let attempt = 0; attempt < GT_MAX_RETRIES; attempt += 1) {
      let res;
      try {
        res = await fetchWithTimeout(`${GT_API}${path}`, {
          headers: { accept: 'application/json' },
        }, FETCH_TIMEOUT_MS);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Chart data unavailable');
        if (attempt < GT_MAX_RETRIES - 1) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      if (res.status === 429 && attempt < GT_MAX_RETRIES - 1) {
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (!res.ok) {
        lastError = new Error(`Chart data unavailable (${res.status})`);
        if (res.status >= 500 && attempt < GT_MAX_RETRIES - 1) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw lastError;
      }

      return res.json();
    }

    throw lastError;
  });
}

async function dexFetch(path) {
  const res = await fetchWithTimeout(path, { headers: { accept: 'application/json' } }, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`DexScreener unavailable (${res.status})`);
  return res.json();
}

function bestBaseTokenPair(pairs, tokenAddress) {
  const target = tokenAddress.toLowerCase();
  return [...(pairs || [])]
    .filter((pair) => pair.baseToken?.address?.toLowerCase() === target
      && pair.priceUsd != null)
    .sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0))[0];
}

async function resolvePoolFromDexScreener(tokenAddress) {
  const pairs = await dexFetch(`${DEX_PAIRS_API}/${tokenAddress.toLowerCase()}`);
  const best = bestBaseTokenPair(pairs, tokenAddress);
  if (!best?.pairAddress) throw new Error('No liquidity pool found for chart');
  return best.pairAddress.toLowerCase();
}

async function resolvePoolFromGeckoTerminal(tokenAddress) {
  const json = await gtFetch(`/networks/pulsechain/tokens/${tokenAddress.toLowerCase()}/pools`);
  const pools = json?.data || [];
  const target = tokenAddress.toLowerCase();

  const eligible = pools.filter((pool) => {
    const baseId = pool.relationships?.base_token?.data?.id || '';
    return baseId.toLowerCase().endsWith(target);
  });

  const ranked = (eligible.length ? eligible : pools)
    .sort((a, b) => {
      const aUsd = Number(a.attributes?.reserve_in_usd || 0);
      const bUsd = Number(b.attributes?.reserve_in_usd || 0);
      return bUsd - aUsd;
    });

  const best = ranked[0];
  const pool = best?.attributes?.address;
  if (!pool) throw new Error('No liquidity pool found for chart');
  return pool.toLowerCase();
}

async function resolvePoolAddress(token) {
  const key = token.address.toLowerCase();
  const cached = poolCache.get(key);
  if (cached && Date.now() - cached.at < 24 * 60 * 60_000) return cached.pool;

  if (token.poolAddress) {
    const pool = token.poolAddress.toLowerCase();
    poolCache.set(key, { at: Date.now(), pool });
    return pool;
  }

  let pool = null;
  try {
    pool = await resolvePoolFromDexScreener(token.address);
  } catch {
    pool = await resolvePoolFromGeckoTerminal(token.address);
  }

  poolCache.set(key, { at: Date.now(), pool });
  return pool;
}

function parseOhlcvList(list) {
  return (list || [])
    .map((row) => ({
      t: Number(row[0]) * 1000,
      price: Number(row[4]),
    }))
    .filter((p) => p.price > 0)
    .sort((a, b) => a.t - b.t);
}

async function fetchGeckoTerminalChart(symbol, rangeId) {
  const token = getChartToken(symbol);
  const { timeframe, limit, aggregate } = rangeParams(rangeId);
  const pool = await resolvePoolAddress(token);
  const qs = new URLSearchParams({
    limit: String(limit),
    currency: 'usd',
    aggregate: String(aggregate),
  });

  const json = await gtFetch(
    `/networks/pulsechain/pools/${pool}/ohlcv/${timeframe}?${qs}`,
  );

  const points = parseOhlcvList(json?.data?.attributes?.ohlcv_list);
  if (points.length < 2) throw new Error('Not enough chart data yet');

  const first = points[0].price;
  const last = points[points.length - 1].price;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

  return {
    symbol: token.symbol,
    rangeId,
    points,
    changePct,
    source: 'geckoterminal',
  };
}

/**
 * Prefer GeckoTerminal (CoinGecko Terminal) on PulseChain.
 * LiveCoinWatch is fallback only when GT fails or returns thin data.
 */
async function loadTokenChart(symbol, rangeId) {
  try {
    return await withTimeout(
      fetchGeckoTerminalChart(symbol, rangeId),
      CHART_LOAD_TIMEOUT_MS,
      'GeckoTerminal',
    );
  } catch (gtErr) {
    if (!hasLcwApiKey()) throw gtErr;
    try {
      return await withTimeout(
        fetchLiveCoinWatchChart(symbol, rangeId),
        LCW_TIMEOUT_MS,
        'LiveCoinWatch',
      );
    } catch {
      throw gtErr;
    }
  }
}

export async function fetchTokenChart(symbol, rangeId = '24H') {
  const key = cacheKey(symbol, rangeId);
  const cached = chartCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  if (inflight.has(key)) return inflight.get(key);

  const promise = loadTokenChart(symbol, rangeId)
    .then((data) => storeChart(symbol, rangeId, data))
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
