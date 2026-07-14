const PUBLIC_FILES = new Set([
  'voodoo-wallet.png',
  'voodoo-letter-logo.png',
  'pulsechain-logo.webp',
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
]);

const PULSECHAIN_LOGO = 'pulsechain-logo.webp';

function extensionAssetUrl(file) {
  if (!PUBLIC_FILES.has(file)) return '';
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`public/${file}`);
  }
  return `/public/${file}`;
}

export function assetUrl(file) {
  if (file === 'pulsechain-logo.png' || file === 'pulsechain-logo.webp') {
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