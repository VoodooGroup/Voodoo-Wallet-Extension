import { parseUnits } from 'ethers';
import { DEFAULT_TOKENS, TOKEN_LOGOS } from '../config/pulsechain.js';

/** Max integer digits — keeps UI boxes from expanding and avoids parseUnits overflow. */
export const SWAP_AMOUNT_MAX_INT_DIGITS = 18;
/** Max fraction digits while typing (token decimals are usually ≤ 18). */
export const SWAP_AMOUNT_MAX_FRAC_DIGITS = 18;

/**
 * Sanitize amount input for Swap. Caps length so huge paste/type cannot blow out the layout
 * or feed unparseable values into quotes.
 */
export function sanitizeSwapAmountInput(raw) {
  const normalized = String(raw ?? '').trim().replace(',', '.');
  if (!normalized) return '';
  let out = '';
  let dotSeen = false;
  for (const ch of normalized) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
      continue;
    }
    if (ch === '.' && !dotSeen) {
      out += ch;
      dotSeen = true;
    }
  }
  if (!out) return '';

  const [intRaw, fracRaw = ''] = out.split('.');
  // Keep leading zeros only when the value is "0.xxx"
  let intPart = intRaw.replace(/^0+(?=\d)/, '') || (out.startsWith('0') || out.startsWith('.') ? '0' : '');
  if (intPart.length > SWAP_AMOUNT_MAX_INT_DIGITS) {
    intPart = intPart.slice(0, SWAP_AMOUNT_MAX_INT_DIGITS);
  }
  const fracPart = fracRaw.slice(0, SWAP_AMOUNT_MAX_FRAC_DIGITS);

  if (out.includes('.')) {
    return `${intPart || '0'}.${fracPart}`;
  }
  return intPart;
}

/**
 * Compact display for swap UI — never returns a string long enough to stretch panels.
 */
export function formatSwapUiAmount(value, { maxFrac = 8, maxChars = 14 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';

  // Tiny values
  if (Math.abs(n) > 0 && Math.abs(n) < 1e-6) {
    return n.toExponential(2);
  }
  // Huge values — scientific keeps width stable
  if (Math.abs(n) >= 1e9) {
    return n.toExponential(3);
  }
  if (Math.abs(n) < 0.0001) {
    return n.toExponential(2);
  }

  let formatted = n.toLocaleString(undefined, {
    maximumFractionDigits: maxFrac,
    useGrouping: true,
  });

  if (formatted.length > maxChars) {
    formatted = n.toLocaleString(undefined, {
      maximumFractionDigits: Math.min(maxFrac, 4),
      notation: 'compact',
      compactDisplay: 'short',
    });
  }
  if (formatted.length > maxChars) {
    return n.toExponential(3);
  }
  return formatted;
}

export function canQuoteSwapAmount(value, decimals = 18) {
  const amount = sanitizeSwapAmountInput(value);
  if (!amount || amount === '.') return false;
  try {
    return parseUnits(amount, decimals) > 0n;
  } catch {
    return false;
  }
}

export function buildSwapTokenList(tokens = [], plsBalance = '0') {
  const walletTokens = tokens || [];
  const walletByAddress = new Map(
    walletTokens
      .filter((tok) => tok.address)
      .map((tok) => [tok.address.toLowerCase(), tok]),
  );

  const list = [{
    key: 'PLS',
    symbol: 'PLS',
    name: 'Pulse',
    decimals: 18,
    balance: plsBalance,
    isNative: true,
    logo: TOKEN_LOGOS.PLS,
  }];

  const coreAddresses = new Set();
  for (const def of DEFAULT_TOKENS) {
    if (def.symbol === 'WPLS') continue;
    coreAddresses.add(def.address.toLowerCase());
    const walletTok = walletByAddress.get(def.address.toLowerCase());
    // Prefer wallet/on-chain decimals when present (e.g. POISON is 9, not 18)
    const decimals = walletTok?.decimals != null
      ? Number(walletTok.decimals)
      : Number(def.decimals ?? 18);
    list.push({
      key: def.address,
      symbol: def.symbol,
      name: def.name,
      decimals,
      balance: walletTok?.balance ?? '0',
      address: def.address,
      isNative: false,
      logo: def.logo || TOKEN_LOGOS[def.symbol],
      logoData: walletTok?.logoData,
      isCustom: walletTok?.isCustom ?? false,
    });
  }

  for (const tok of walletTokens) {
    if (tok.symbol === 'WPLS' || tok.symbol === 'PLS') continue;
    const addr = tok.address?.toLowerCase();
    if (!addr || coreAddresses.has(addr)) continue;
    list.push({
      key: tok.address,
      symbol: tok.symbol,
      name: tok.name,
      // Prefer wallet row (filled via on-chain decimals). Swap quotes also re-resolve on-chain.
      decimals: tok.decimals != null ? Number(tok.decimals) : 18,
      balance: tok.balance,
      address: tok.address,
      isNative: false,
      logo: tok.logo,
      logoData: tok.logoData,
      isCustom: tok.isCustom,
    });
  }

  return list;
}

export function findSwapToken(list, key) {
  return list.find((t) => t.key === key) || list[0];
}