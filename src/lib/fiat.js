export const FIAT_CURRENCIES = [
  { code: 'usd', label: 'US Dollar', symbol: '$' },
  { code: 'eur', label: 'Euro', symbol: '€' },
  { code: 'gbp', label: 'British Pound', symbol: '£' },
  { code: 'jpy', label: 'Japanese Yen', symbol: '¥' },
  { code: 'cad', label: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'aud', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'chf', label: 'Swiss Franc', symbol: 'CHF ' },
  { code: 'cny', label: 'Chinese Yuan', symbol: '¥' },
  { code: 'inr', label: 'Indian Rupee', symbol: '₹' },
  { code: 'brl', label: 'Brazilian Real', symbol: 'R$' },
  { code: 'mxn', label: 'Mexican Peso', symbol: 'MX$' },
  { code: 'sgd', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'nok', label: 'Norwegian Krone', symbol: 'kr ' },
  { code: 'sek', label: 'Swedish Krona', symbol: 'kr ' },
  { code: 'dkk', label: 'Danish Krone', symbol: 'kr ' },
  { code: 'pln', label: 'Polish Złoty', symbol: 'zł ' },
  { code: 'try', label: 'Turkish Lira', symbol: '₺' },
  { code: 'rub', label: 'Russian Ruble', symbol: '₽' },
  { code: 'zar', label: 'South African Rand', symbol: 'R ' },
  { code: 'thb', label: 'Thai Baht', symbol: '฿' },
  { code: 'idr', label: 'Indonesian Rupiah', symbol: 'Rp ' },
  { code: 'php', label: 'Philippine Peso', symbol: '₱' },
  { code: 'vnd', label: 'Vietnamese Dong', symbol: '₫' },
  { code: 'czk', label: 'Czech Koruna', symbol: 'Kč ' },
  { code: 'ils', label: 'Israeli Shekel', symbol: '₪' },
  { code: 'ars', label: 'Argentine Peso', symbol: 'AR$' },
  { code: 'aed', label: 'UAE Dirham', symbol: 'AED ' },
  { code: 'sar', label: 'Saudi Riyal', symbol: 'SAR ' },
  { code: 'myr', label: 'Malaysian Ringgit', symbol: 'RM ' },
  { code: 'twd', label: 'Taiwan Dollar', symbol: 'NT$' },
  { code: 'uah', label: 'Ukrainian Hryvnia', symbol: '₴' },
  { code: 'bdt', label: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'bgn', label: 'Bulgarian Lev', symbol: 'лв ' },
];

export const FIAT_CURRENCY_CODES = new Set(FIAT_CURRENCIES.map((c) => c.code));

const fiatByCode = Object.fromEntries(FIAT_CURRENCIES.map((c) => [c.code, c]));

export function normalizeFiatCode(currency) {
  const code = (currency || 'usd').toLowerCase();
  return FIAT_CURRENCY_CODES.has(code) ? code : 'usd';
}

export function getFiatMeta(currency) {
  return fiatByCode[normalizeFiatCode(currency)] || fiatByCode.usd;
}

export function getFiatSymbol(currency) {
  return getFiatMeta(currency).symbol;
}

export function formatFiatAmount(amount, currency = 'usd', decimals = 4) {
  const n = Number(amount || 0);
  return `${getFiatSymbol(currency)}${n.toFixed(decimals)}`;
}

export function portfolioFiatValue({ pls, tokens }, prices) {
  let total = Number(pls || 0) * (prices.PLS || 0);
  tokens.forEach((t) => {
    total += Number(t.balance || 0) * (prices[t.symbol] || 0);
  });
  return total;
}
