import { Contract } from 'ethers';
import { ERC20_ABI } from '../config/pulsechain.js';

/** In-memory cache: lowercase address → decimals (0–36). */
const decimalsCache = new Map();

const DECIMALS_TIMEOUT_MS = 6_000;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), DECIMALS_TIMEOUT_MS);
    }),
  ]);
}

/** Lazy provider — avoids circular import with chain.js */
async function provider() {
  const { getProvider } = await import('./chain.js');
  return getProvider();
}

/**
 * Normalize ERC-20 decimals to a safe integer.
 * Invalid values fall back to `fallback` (default 18).
 * Note: 0 is a valid ERC-20 decimals value for some tokens.
 */
export function normalizeDecimals(value, fallback = 18) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < 0 || i > 36) return fallback;
  return i;
}

export function isNativeSwapToken(token) {
  if (!token) return false;
  return Boolean(token.isNative) || token.symbol === 'PLS';
}

/**
 * Read ERC-20 decimals from chain (cached). Optional `hint` used only if RPC fails.
 */
export async function getErc20Decimals(tokenAddress, hint = 18) {
  const addr = String(tokenAddress || '').trim();
  if (!addr) return normalizeDecimals(hint);

  const key = addr.toLowerCase();
  if (decimalsCache.has(key)) return decimalsCache.get(key);

  const fallback = normalizeDecimals(hint);
  try {
    const contract = new Contract(addr, ERC20_ABI, await provider());
    const raw = await withTimeout(contract.decimals(), 'token decimals');
    const decimals = normalizeDecimals(raw, fallback);
    decimalsCache.set(key, decimals);
    return decimals;
  } catch {
    return fallback;
  }
}

/** Test helper / recovery after wrong cache. */
export function clearTokenDecimalsCache() {
  decimalsCache.clear();
}

/**
 * Resolve a token object to one with authoritative decimals for parse/format.
 * Native PLS → 18. ERC-20 → on-chain (cached).
 */
export async function withOnChainDecimals(token) {
  if (!token) return token;
  if (isNativeSwapToken(token)) {
    return { ...token, decimals: 18 };
  }
  if (!token.address) {
    return { ...token, decimals: normalizeDecimals(token.decimals) };
  }
  const decimals = await getErc20Decimals(token.address, token.decimals);
  return { ...token, decimals };
}

/**
 * Fetch symbol / name / decimals from chain for add-token flows.
 * Always prefers on-chain decimals so custom tokens cannot store wrong precision.
 */
export async function fetchErc20TokenMeta(tokenAddress, walletAddress = null) {
  const addr = String(tokenAddress || '').trim();
  if (!addr) throw new Error('error_token_address');

  const contract = new Contract(addr, ERC20_ABI, await provider());
  const tasks = [
    withTimeout(contract.decimals(), 'decimals'),
    withTimeout(contract.symbol(), 'symbol'),
    withTimeout(contract.name(), 'name'),
  ];
  if (walletAddress) {
    tasks.push(withTimeout(contract.balanceOf(walletAddress), 'balanceOf'));
  }

  const results = await Promise.all(tasks);
  const decimalsRaw = results[0];
  const symbol = results[1];
  const name = results[2];
  const rawBalance = walletAddress ? results[3] : null;
  const decimals = normalizeDecimals(decimalsRaw);
  const key = addr.toLowerCase();
  decimalsCache.set(key, decimals);

  const result = {
    address: addr,
    symbol: String(symbol || 'TOKEN'),
    name: String(name || symbol || 'Token'),
    decimals,
  };
  if (rawBalance != null) {
    result.raw = rawBalance.toString();
  }
  return result;
}

/**
 * If balance rows have different decimals than stored custom tokens, return a healed list.
 * Returns null when nothing changed.
 */
export function healCustomTokensDecimals(customTokens = [], balanceTokens = []) {
  if (!Array.isArray(customTokens) || !customTokens.length) return null;
  if (!Array.isArray(balanceTokens) || !balanceTokens.length) return null;

  const byAddr = new Map(
    balanceTokens
      .filter((t) => t?.address && t.decimals != null)
      .map((t) => [t.address.toLowerCase(), t]),
  );

  let changed = false;
  const next = customTokens.map((custom) => {
    const key = (custom.address || '').toLowerCase();
    if (!key) return custom;
    const bal = byAddr.get(key);
    if (!bal) return custom;

    const chainDec = normalizeDecimals(bal.decimals, normalizeDecimals(custom.decimals));
    const storedDec = normalizeDecimals(custom.decimals, chainDec);
    // Only rewrite storage when decimals are wrong (precision bug) or identity fields empty
    const decimalsWrong = storedDec !== chainDec;
    const missingSymbol = !custom.symbol && bal.symbol;
    const missingName = !custom.name && bal.name;
    if (!decimalsWrong && !missingSymbol && !missingName) {
      return custom;
    }

    changed = true;
    return {
      ...custom,
      decimals: chainDec,
      symbol: custom.symbol || bal.symbol,
      name: custom.name || bal.name,
    };
  });

  return changed ? next : null;
}
