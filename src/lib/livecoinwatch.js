import { getChartToken } from '../config/chart-tokens.js';
import {
  getLcwApiKey,
  hasLcwApiKey,
  LCW_COIN_URL,
  LCW_HISTORY_URL,
} from '../config/livecoinwatch.js';

/** Exact LiveCoinWatch coin codes (confirmed working). */
export const LCW_SPOT_CODES = {
  VDO: 'VDO',
  MAGIC: '__________MAGIC',
  POISON: '__POISON',
};

function lcwRangeWindow(rangeId) {
  const end = Date.now();
  const windows = {
    '24H': 24 * 60 * 60_000,
    '7D': 7 * 24 * 60 * 60_000,
    '30D': 30 * 24 * 60 * 60_000,
    '90D': 90 * 24 * 60 * 60_000,
    '12M': 365 * 24 * 60 * 60_000,
  };
  const span = windows[rangeId] || windows['24H'];
  return { start: end - span, end };
}

let lcwQueue = Promise.resolve();
const LCW_MIN_INTERVAL_MS = 150;
const LCW_FETCH_TIMEOUT_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function enqueueLcw(task) {
  const run = async () => {
    await sleep(LCW_MIN_INTERVAL_MS);
    return task();
  };
  const next = lcwQueue.then(run, run);
  lcwQueue = next.catch(() => {});
  return next;
}

async function lcwPost(url, body) {
  if (!hasLcwApiKey()) {
    throw new Error('LiveCoinWatch API key not configured');
  }

  return enqueueLcw(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LCW_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': getLcwApiKey(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`LiveCoinWatch unavailable (${res.status})`);
      }

      return res.json();
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error('LiveCoinWatch timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  });
}

function parseLcwHistory(history) {
  return (history || [])
    .map((row) => ({
      t: Number(row.date),
      price: Number(row.rate),
    }))
    .filter((p) => p.price > 0)
    .sort((a, b) => a.t - b.t);
}

/**
 * LiveCoinWatch delta values are ratios vs previous period:
 *   1.0854 ≈ +8.54%,  0.8417 ≈ -15.83%
 */
function lcwDeltaToPercent(delta) {
  const n = Number(delta);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 0.05 && n < 20) return (n - 1) * 100;
  if (Math.abs(n) <= 1) return n * 100;
  return n;
}

function resolveLcwCode(symbolOrCode) {
  const raw = String(symbolOrCode || '').trim();
  const upper = raw.toUpperCase();
  if (upper === 'PLS' || upper === 'WPLS') {
    return { symbol: 'PLS', code: 'PLS' };
  }
  if (LCW_SPOT_CODES[upper]) {
    return { symbol: upper, code: LCW_SPOT_CODES[upper] };
  }
  const token = getChartToken(raw);
  return {
    symbol: token?.symbol || upper,
    code: token?.lcwCode || LCW_SPOT_CODES[token?.symbol] || upper,
  };
}

/**
 * LiveCoinWatch coins/single — exact body shape:
 *   { currency: "USD", code: "VDO" | "__________MAGIC" | "__POISON", meta: true }
 */
export async function fetchLiveCoinWatchSpot(symbolOrCode) {
  const { symbol, code } = resolveLcwCode(symbolOrCode);

  const json = await lcwPost(LCW_COIN_URL, {
    currency: 'USD',
    code,
    meta: true,
  });

  const price = Number(json?.rate) || 0;
  if (price <= 0) throw new Error(`LiveCoinWatch has no rate for ${code}`);

  return {
    symbol,
    price,
    change24h: lcwDeltaToPercent(json?.delta?.day),
    source: 'livecoinwatch',
  };
}

/**
 * Primary spot fetch for VDO / MAGIC / POISON via LiveCoinWatch.
 */
export async function fetchLiveCoinWatchTokenUsdPrices() {
  if (!hasLcwApiKey()) {
    throw new Error('LiveCoinWatch API key not configured');
  }

  const out = {
    VDO: 0,
    VDO_CHANGE_24H: 0,
    MAGIC: 0,
    MAGIC_CHANGE_24H: 0,
    POISON: 0,
    POISON_CHANGE_24H: 0,
  };

  await Promise.all(
    (['VDO', 'MAGIC', 'POISON']).map(async (symbol) => {
      try {
        const spot = await fetchLiveCoinWatchSpot(symbol);
        if (spot.price > 0) {
          out[symbol] = spot.price;
          out[`${symbol}_CHANGE_24H`] = spot.change24h || 0;
        }
      } catch (err) {
        console.warn(`LCW spot ${symbol} failed:`, err?.message || err);
      }
    }),
  );

  if (!(out.VDO > 0 || out.MAGIC > 0 || out.POISON > 0)) {
    throw new Error('LiveCoinWatch returned no token prices');
  }
  return out;
}

/** Fill only missing symbols (price === 0) from LCW. */
export async function fillMissingPricesFromLiveCoinWatch(usdPrices, symbols = ['VDO', 'MAGIC', 'POISON']) {
  if (!hasLcwApiKey()) return usdPrices;
  const next = { ...usdPrices };

  await Promise.all(
    symbols.map(async (symbol) => {
      if (Number(next[symbol]) > 0) return;
      try {
        const spot = await fetchLiveCoinWatchSpot(symbol);
        if (spot.price > 0) {
          next[symbol] = spot.price;
          const chKey = `${symbol}_CHANGE_24H`;
          if (!next[chKey] && spot.change24h) {
            next[chKey] = spot.change24h;
          }
        }
      } catch {
        /* keep missing */
      }
    }),
  );

  return next;
}

export async function fetchLiveCoinWatchChart(symbol, rangeId = '24H') {
  const token = getChartToken(symbol);
  const code = token.lcwCode || LCW_SPOT_CODES[token.symbol] || token.symbol;
  const { start, end } = lcwRangeWindow(rangeId);
  const json = await lcwPost(LCW_HISTORY_URL, {
    currency: 'USD',
    code,
    start,
    end,
    meta: false,
  });

  const points = parseLcwHistory(json.history);
  if (points.length < 2) throw new Error('Not enough LiveCoinWatch chart data yet');

  const first = points[0].price;
  const last = points[points.length - 1].price;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

  return {
    symbol: token.symbol,
    rangeId,
    points,
    changePct,
    source: 'livecoinwatch',
  };
}
