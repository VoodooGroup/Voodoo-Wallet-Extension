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

export function applyTheme(theme = DEFAULT_THEME) {
  const t = { ...DEFAULT_THEME, ...theme };
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