const PUBLIC_FILES = new Set([
  'voodoo-extension-icon.png',
  'voodoo-token-logo.png',
  'voodoo-wallet.png',
  'voodoo-letter-logo.png',
  'pulsechain-logo.webp',
  'pulsechain-logo.png',
  'pulsechain-logo-40.png',
  'pulsechain-logo-64.png',
  'voodoo-token.png',
  'magic-token.png',
  'poison-token.png',
  'voodoo-token-background.png',
  'voodoo-token-img.png',
  'token-inc.webp',
  'token-hex.webp',
  'token-pump.webp',
  'token-most.webp',
  'token-plsx.webp',
  'token-prvx.webp',
  'warning.png',
  'success-check.png',
  'reset-button.png',
  'tier-bronze.png',
  'tier-silver.png',
  'tier-gold.png',
  'tier-yellowgem.png',
  'tier-bluegem.png',
  'tier-sapphire.png',
]);

/** Sharp default for UI chips/dropdowns (128×119 PNG). */
const PULSECHAIN_LOGO = 'pulsechain-logo.png';

function extensionAssetUrl(file) {
  if (!PUBLIC_FILES.has(file)) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`public/${file}`);
  }
  return `/public/${file}`;
}

export function appBrandLogoUrl() {
  return assetUrl('voodoo-wallet.png');
}

export function assetUrl(file) {
  // Serve the requested file as-is (do not force tiny webp for PLS).
  if (file === 'pulsechain-logo.webp') {
    // Prefer sharp PNG when callers still ask for webp
    return extensionAssetUrl(PULSECHAIN_LOGO);
  }
  return extensionAssetUrl(file);
}

export function pulsechainLogoUrl() {
  return extensionAssetUrl(PULSECHAIN_LOGO);
}

export function wallpaperUrl() {
  return assetUrl('voodoo-token-background.png');
}

export function warningIconUrl() {
  return assetUrl('warning.png');
}

export function resetButtonIconUrl() {
  return assetUrl('reset-button.png');
}

export function tierBadgeUrl(file) {
  return assetUrl(file);
}

const WALLET_LOCALE_FLAG_CODES = new Set([
  'en', 'zh', 'hi', 'es', 'fr', 'ar', 'pt', 'nl',
]);

export function localeFlagUrl(code) {
  const locale = (code || '').toLowerCase();
  if (!WALLET_LOCALE_FLAG_CODES.has(locale)) return '';
  const file = `flag-${locale}.png`;
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`public/${file}`);
  }
  return `/public/${file}`;
}

/** Currency icons for Settings display-currency dropdown (public/currency-*.png). */
const CURRENCY_ICON_FILES = {
  usd: 'currency-usd.png',
  eur: 'currency-eur.png',
  gbp: 'currency-gbp.png',
  jpy: 'currency-jpy.png',
  cad: 'currency-cad.png',
  aud: 'currency-aud.png',
  chf: 'currency-chf.png',
  cny: 'currency-cny.png',
  inr: 'currency-inr.png',
  brl: 'currency-brl.png',
  mxn: 'currency-mxn.png',
  sgd: 'currency-sgd.png',
  // Nordic currencies share one "krone" artwork
  nok: 'currency-krone.png',
  sek: 'currency-krone.png',
  dkk: 'currency-krone.png',
  pln: 'currency-pln.png',
  try: 'currency-try.png',
  rub: 'currency-rub.png',
  zar: 'currency-zar.png',
  thb: 'currency-thb.png',
  idr: 'currency-idr.png',
  php: 'currency-php.png',
  vnd: 'currency-vnd.png',
  czk: 'currency-czk.png',
  ils: 'currency-ils.png',
  ars: 'currency-ars.png',
  aed: 'currency-aed.png',
  sar: 'currency-sar.png',
  myr: 'currency-myr.png',
  twd: 'currency-twd.png',
  uah: 'currency-uah.png',
  bdt: 'currency-bdt.png',
  bgn: 'currency-bgn.png',
};

export function currencyIconUrl(code) {
  const key = (code || '').toLowerCase();
  const file = CURRENCY_ICON_FILES[key];
  if (!file) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`public/${file}`);
  }
  return `/public/${file}`;
}

const MENU_ICONS = new Set([
  'menu-unlocks.png',
  'menu-gas.png',
  'menu-yields.png',
  'menu-import.png',
  'menu-fullscreen.png',
  'menu-lock.png',
]);

export function menuIconUrl(file) {
  if (!MENU_ICONS.has(file)) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`public/${file}`);
  }
  return `/public/${file}`;
}

export function menuUnlocksIconUrl() {
  return menuIconUrl('menu-unlocks.png');
}

export function menuGasIconUrl() {
  return menuIconUrl('menu-gas.png');
}

export function menuYieldsIconUrl() {
  return menuIconUrl('menu-yields.png');
}

export function menuImportIconUrl() {
  return menuIconUrl('menu-import.png');
}

export function menuFullscreenIconUrl() {
  return menuIconUrl('menu-fullscreen.png');
}

export function menuLockIconUrl() {
  return menuIconUrl('menu-lock.png');
}

/** Home tab lock / logout icon */
export function logoutIconUrl() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('public/logout.png');
  }
  return '/public/logout.png';
}

/** Green check — dApp approve/stake success */
export function successCheckIconUrl() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL('public/success-check.png');
  }
  return '/public/success-check.png';
}