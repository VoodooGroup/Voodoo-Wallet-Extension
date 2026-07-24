export const DEFAULT_THEME = {
  bg: '#ffffff',
  panel: '#ffffff',
  panel2: '#f7f8f9',
  accent: '#037dd6',
  accentSoft: '#e8f4fd',
  text: '#141414',
  muted: '#6b7280',
  border: '#e5e7eb',
};

/** Temporary grey default — migrate saved wallets back to blue. */
const GREY_ACCENT = '#4e575d';
const GREY_ACCENT_SOFT = '#e8eaeb';

export function normalizeTheme(theme = {}) {
  const t = { ...DEFAULT_THEME, ...theme };
  const accent = String(t.accent || '').toLowerCase();
  const soft = String(t.accentSoft || '').toLowerCase();
  if (accent === GREY_ACCENT) t.accent = DEFAULT_THEME.accent;
  if (soft === GREY_ACCENT_SOFT) t.accentSoft = DEFAULT_THEME.accentSoft;
  return t;
}

export function applyTheme(theme = DEFAULT_THEME) {
  const t = normalizeTheme(theme);
  const root = document.documentElement;
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--panel', t.panel);
  root.style.setProperty('--panel2', t.panel2);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-soft', t.accentSoft);
  root.style.setProperty('--text', t.text);
  root.style.setProperty('--muted', t.muted);
  root.style.setProperty('--border', t.border);
  return t;
}
