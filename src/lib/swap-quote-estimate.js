import { DEFAULT_TOKENS } from '../config/pulsechain.js';

const DEX_API = 'https://api.dexscreener.com/latest/dex/tokens';
const DEX_CACHE_MS = 60_000;

let dexRatesCache = { at: 0, key: '', rates: null };
let dexRatesInflight = null;

export function swapPriceSymbol(token) {
  if (!token) return '';
  return token.isNative || token.symbol === 'WPLS' ? 'PLS' : token.symbol;
}

export function swapRateKey(token) {
  if (!token) return '';
  if (token.isNative || token.symbol === 'PLS' || token.symbol === 'WPLS') return 'pls';
  return token.address?.toLowerCase() || '';
}

export function formatSwapEstimateOut(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 0.000001) return n.toPrecision(6);
  if (n < 1) return String(Number(n.toFixed(8)));
  return String(Number(n.toFixed(6)));
}

export function wplsPerTokenFromPair(pair, tokenAddress) {
  if (!tokenAddress || pair.chainId !== 'pulsechain') return null;

  const addr = tokenAddress.toLowerCase();
  const priceNative = Number(pair.priceNative);
  if (!priceNative) return null;

  const baseAddr = pair.baseToken?.address?.toLowerCase();
  const quoteAddr = pair.quoteToken?.address?.toLowerCase();

  if (baseAddr === addr && pair.quoteToken?.symbol === 'WPLS') {
    return priceNative;
  }
  if (quoteAddr === addr && pair.baseToken?.symbol === 'WPLS') {
    return 1 / priceNative;
  }
  return null;
}

export function bestWplsRateForAddress(pairs, tokenAddress) {
  let best = null;
  let bestLiq = 0;
  for (const pair of pairs) {
    const rate = wplsPerTokenFromPair(pair, tokenAddress);
    if (!rate) continue;
    const liq = Number(pair.liquidity?.usd) || 0;
    if (liq > bestLiq) {
      bestLiq = liq;
      best = rate;
    }
  }
  return best;
}

function buildDexRatesCacheKey(addresses = []) {
  return [...new Set(addresses.map((addr) => addr.toLowerCase()))].sort().join(',');
}

function coreSwapAddresses() {
  return DEFAULT_TOKENS
    .filter((tok) => tok.symbol !== 'WPLS')
    .map((tok) => tok.address.toLowerCase());
}

export async function fetchDexSwapRates({ tokenAddresses = [], bypassCache = false } = {}) {
  const allAddresses = [...new Set([
    ...coreSwapAddresses(),
    ...tokenAddresses.map((addr) => addr.toLowerCase()),
  ])];
  const cacheKey = buildDexRatesCacheKey(allAddresses);

  if (!bypassCache
    && Date.now() - dexRatesCache.at < DEX_CACHE_MS
    && dexRatesCache.key === cacheKey
    && dexRatesCache.rates) {
    return dexRatesCache.rates;
  }
  if (dexRatesInflight) return dexRatesInflight;

  dexRatesInflight = (async () => {
    const res = await fetch(`${DEX_API}/${allAddresses.join(',')}`);
    if (!res.ok) throw new Error('DexScreener unavailable');

    const pairs = (await res.json()).pairs || [];
    const wplsPerToken = { pls: 1 };
    for (const addr of allAddresses) {
      const rate = bestWplsRateForAddress(pairs, addr);
      if (rate) wplsPerToken[addr] = rate;
    }

    dexRatesCache = { at: Date.now(), key: cacheKey, rates: wplsPerToken };
    return wplsPerToken;
  })();

  try {
    return await dexRatesInflight;
  } finally {
    dexRatesInflight = null;
  }
}

function convertViaWpls(amountIn, fromToken, toToken, wplsPerToken) {
  const fromKey = swapRateKey(fromToken);
  const toKey = swapRateKey(toToken);
  const fromRate = fromKey === 'pls' ? 1 : wplsPerToken[fromKey];
  const toRate = toKey === 'pls' ? 1 : wplsPerToken[toKey];
  if (!fromRate || !toRate) return null;

  const amount = Number(amountIn);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const wplsAmount = fromKey === 'pls' ? amount : amount * fromRate;
  const out = toKey === 'pls' ? wplsAmount : wplsAmount / toRate;
  return formatSwapEstimateOut(out);
}

function convertViaFiatPrices(amountIn, fromToken, toToken, prices) {
  const fromPrice = Number(prices[swapPriceSymbol(fromToken)] || 0);
  const toPrice = Number(prices[swapPriceSymbol(toToken)] || 0);
  if (!fromPrice || !toPrice) return null;

  const amount = Number(amountIn);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return formatSwapEstimateOut((amount * fromPrice) / toPrice);
}

export function estimateSwapOutput(amountIn, fromToken, toToken, prices = {}, dexRates = null) {
  if (!fromToken || !toToken || fromToken.key === toToken.key) return null;

  const amountOutFormatted = dexRates
    ? convertViaWpls(amountIn, fromToken, toToken, dexRates)
    : null;

  const viaPrices = amountOutFormatted
    ? null
    : convertViaFiatPrices(amountIn, fromToken, toToken, prices);

  const resolved = amountOutFormatted || viaPrices;
  if (!resolved || resolved === '0') return null;

  return {
    amountOutFormatted: resolved,
    isEstimate: true,
    source: amountOutFormatted ? 'dex' : 'prices',
  };
}

/** Exact-out style local estimate: desired receive → required pay. */
export function estimateSwapInput(amountOut, fromToken, toToken, prices = {}, dexRates = null) {
  if (!fromToken || !toToken || fromToken.key === toToken.key) return null;
  const flipped = estimateSwapOutput(amountOut, toToken, fromToken, prices, dexRates);
  if (!flipped?.amountOutFormatted) return null;
  return {
    amountInFormatted: flipped.amountOutFormatted,
    isEstimate: true,
    source: flipped.source,
  };
}