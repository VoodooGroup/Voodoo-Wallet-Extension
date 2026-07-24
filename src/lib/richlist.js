import { DEFAULT_TOKENS } from '../config/pulsechain.js';

const SCAN_API = 'https://api.scan.pulsechain.com/api';
const SCAN_V2 = 'https://api.scan.pulsechain.com/api/v2';
const PAGE_SIZE = 100;
/** Cap requests so Home never hangs on huge holder lists */
const MAX_PAGES = 25;
const FETCH_TIMEOUT_MS = 12_000;
const CACHE_MS = 5 * 60_000;

const VDO = DEFAULT_TOKENS.find((t) => t.symbol === 'VDO');

const cache = new Map(); // key -> { at, data }

function cacheKey(address, balance) {
  const bal = Number(balance) || 0;
  const bucket = bal >= 1 ? bal.toFixed(2) : bal.toPrecision(4);
  return `${(address || '').toLowerCase()}:${bucket}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Rich list request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rank a wallet by VDO holdings using PulseChain Scan holder pages
 * (same data source as the Voodoo rich-list web tool).
 */
export async function fetchVdoRichlistRank({
  address,
  balance,
  tokenAddress = VDO?.address,
  decimals = VDO?.decimals ?? 18,
} = {}) {
  const addr = String(address || '').trim().toLowerCase();
  const bal = Number(balance);
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error('Invalid address');
  }
  if (!tokenAddress) throw new Error('VDO token address missing');
  if (!Number.isFinite(bal) || bal <= 0) {
    return {
      rank: null,
      totalHolders: 0,
      percentile: null,
      balance: 0,
      approx: false,
    };
  }

  const key = cacheKey(addr, bal);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  let totalHolders = 0;
  try {
    const counters = await fetchJson(`${SCAN_V2}/tokens/${tokenAddress}/counters`);
    totalHolders = Number(counters?.token_holders_count || 0);
  } catch {
    totalHolders = 0;
  }

  let holdersAbove = 0;
  let rank = null;
  let exact = false;
  let pages = 0;

  while (pages < MAX_PAGES && rank == null) {
    pages += 1;
    const url = `${SCAN_API}?module=token&action=getTokenHolders`
      + `&contractaddress=${tokenAddress}&page=${pages}&offset=${PAGE_SIZE}`;
    const json = await fetchJson(url);
    if (String(json?.status) !== '1') {
      if (pages === 1) throw new Error(json?.message || 'Holders API error');
      break;
    }
    const rows = Array.isArray(json?.result) ? json.result : [];
    if (!rows.length) break;

    const pageHolders = rows
      .map((h) => {
        const raw = h.value ?? h.balance ?? '0';
        const value = Number(raw) / (10 ** decimals);
        return {
          address: String(h.address || '').toLowerCase(),
          balance: Number.isFinite(value) ? value : 0,
        };
      })
      .filter((h) => h.balance > 0);

    pageHolders.sort((a, b) => b.balance - a.balance);

    for (const h of pageHolders) {
      if (h.address === addr) {
        rank = holdersAbove + 1;
        exact = true;
        break;
      }
      if (h.balance > bal) {
        holdersAbove += 1;
        continue;
      }
      if (h.balance === bal) {
        // Same balance, listed before us → count as above until we hit our address
        holdersAbove += 1;
        continue;
      }
      // First holder with less than us → our insert position
      rank = holdersAbove + 1;
      exact = false;
      break;
    }

    if (rank != null) break;

    // If entire page is still strictly above us, keep going
    const last = pageHolders[pageHolders.length - 1];
    if (last && last.balance < bal) {
      rank = holdersAbove + 1;
      exact = false;
      break;
    }
  }

  if (rank == null && holdersAbove > 0) {
    // Hit page cap while still among top — best-effort rank
    rank = holdersAbove + 1;
  }

  const approx = rank != null && !exact && pages >= MAX_PAGES;
  const denom = totalHolders > 0 ? totalHolders : Math.max(rank || 0, holdersAbove + 1);
  const percentile = rank && denom > 0
    ? Number(((rank / denom) * 100).toFixed(2))
    : null;

  const data = {
    rank,
    totalHolders: denom,
    percentile,
    balance: bal,
    approx,
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

export function clearRichlistCache() {
  cache.clear();
}
