import { touchSession } from './session';

const FULLSCREEN_PAGE = 'fullscreen/index.html';

export function isFullscreenMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'fullscreen') return true;
  if (window.location.hash === '#fullscreen') return true;
  return /\/fullscreen\/index\.html$/i.test(window.location.pathname);
}

export function applyFullscreenMode() {
  if (!isFullscreenMode()) return;
  document.documentElement.classList.add('fullscreen-mode');
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
  }
}

function resolveFullscreenPage() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    return null;
  }

  const manifest = chrome.runtime.getManifest?.();
  const popup = manifest?.action?.default_popup || 'src/popup/index.html';
  const page = popup.replace(/popup\/index\.html$/, FULLSCREEN_PAGE);
  return chrome.runtime.getURL(page);
}

export function getFullscreenUrl() {
  const base = resolveFullscreenPage();
  if (!base) {
    const page = new URL(window.location.href);
    page.hash = '';
    page.searchParams.set('mode', 'fullscreen');
    return page.toString();
  }
  return base;
}

export async function openFullscreenWallet() {
  await touchSession();

  const url = getFullscreenUrl();

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}