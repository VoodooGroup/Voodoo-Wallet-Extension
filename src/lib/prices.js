import { getFiatSymbol, normalizeFiatCode } from './fiat';

const CACHE_MS = 60_000;
const DEX_API = 'https://api.dexscreener.com/latest/dex/tokens';
const FOREX_API = 'https://open.er-api.com/v6/latest/USD';

const TOKEN_ADDRESSES = {
  VDO: '0x1c5f8e8E84AcC71650F7a627cfA5B24B80f44f00',
  MAGIC: '0xd63b9d8d6e38cb7fbfdceede3ce92f97f5aea7ac',
  POISON: '0xb8c8761fed2aad5c0a75561bc604531a42c452e6',
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
let forexCache = { at: 0, rates: { usd: 1 } };

function bestPulsechainPair(pairs, address) {
  return pairs
    .filter((p) => p.chainId === 'pulsechain'
      && p.baseToken?.address?.toLowerCase() === address.toLowerCase()
      && p.priceUsd != null)
    .sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0))[0];
}

function deriveWplsUsdPrice(pairs) {
  const vdoPair = pairs
    .filter((p) => p.chainId === 'pulsechain'
      && p.baseToken?.symbol === 'VDO'
      && p.quoteToken?.symbol === 'WPLS'
      && p.priceUsd != null
      && p.priceNative != null)
    .sort((a, b) => (Number(b.liquidity?.usd) || 0) - (Number(a.liquidity?.usd) || 0))[0];

  if (!vdoPair) return 0;

  const vdoUsd = Number(vdoPair.priceUsd);
  const vdoInWpls = Number(vdoPair.priceNative);
  if (!vdoUsd || !vdoInWpls) return 0;
  return vdoUsd / vdoInWpls;
}

async function fetchDexScreenerUsdPrices() {
  const addresses = Object.values(TOKEN_ADDRESSES).join(',');
  const res = await fetch(`${DEX_API}/${addresses}`);
  if (!res.ok) throw new Error('DexScreener unavailable');

  const json = await res.json();
  const pairs = json.pairs || [];
  const usd = { ...EMPTY_PRICES };

  for (const [symbol, address] of Object.entries(TOKEN_ADDRESSES)) {
    const best = bestPulsechainPair(pairs, address);
    if (best) {
      usd[symbol] = Number(best.priceUsd) || 0;
      usd[`${symbol}_CHANGE_24H`] = Number(best.priceChange?.h24) || 0;
    }
  }

  const plsUsd = deriveWplsUsdPrice(pairs);
  if (plsUsd > 0) {
    usd.PLS = plsUsd;
    usd.WPLS = plsUsd;
  }

  return usd;
}

async function fetchPlsFromCoinGecko(fiat) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=pulsechain&vs_currencies=${fiat}`,
    );
    if (!res.ok) return 0;
    const json = await res.json();
    return Number(json.pulsechain?.[fiat]) || 0;
  } catch {
    return 0;
  }
}

async function getForexRates() {
  if (Date.now() - forexCache.at < CACHE_MS && forexCache.rates) {
    return forexCache.rates;
  }

  try {
    const res = await fetch(FOREX_API);
    if (!res.ok) throw new Error('Forex unavailable');
    const json = await res.json();
    const rates = Object.fromEntries(
      Object.entries(json.rates || {}).map(([code, rate]) => [code.toLowerCase(), Number(rate) || 0]),
    );
    rates.usd = 1;
    forexCache = { at: Date.now(), rates };
    return rates;
  } catch {
    return { usd: 1 };
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

export async function fetchFiatPrices(currency = 'usd') {
  const fiat = normalizeFiatCode(currency);
  if (Date.now() - cache.at < CACHE_MS && cache.data[fiat]) {
    return cache.data[fiat];
  }

  try {
    const [usdPrices, forexRates] = await Promise.all([
      fetchDexScreenerUsdPrices(),
      getForexRates(),
    ]);

    let prices = applyFiatRate(usdPrices, fiat, forexRates[fiat]);

    if (!prices.PLS) {
      const plsDirect = await fetchPlsFromCoinGecko(fiat);
      if (plsDirect > 0) {
        prices = { ...prices, PLS: plsDirect, WPLS: plsDirect };
      } else if (fiat !== 'usd' && usdPrices.PLS > 0) {
        const plsUsd = usdPrices.PLS * (forexRates[fiat] || 1);
        prices = { ...prices, PLS: plsUsd, WPLS: plsUsd };
      }
    }

    cache = { at: Date.now(), data: { ...cache.data, [fiat]: prices } };
    return prices;
  } catch {
    return { ...EMPTY_PRICES };
  }
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