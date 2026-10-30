// Light / dark theme (light by default, like highvoltageindustries.com) and readable ink colours for the
// pastel palette colours stored in constants (they were chosen for a dark background).
const KEY = 'hvi-theme';
const root = document.documentElement;

export function getTheme() { return root.dataset.theme === 'dark' ? 'dark' : 'light'; }

export function initTheme() {
  let t = null;
  try { t = localStorage.getItem(KEY); } catch {}
  if (!t) t = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = t;
  syncMeta();
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem(KEY, next); } catch {}
  syncMeta();
  window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  return next;
}

function syncMeta() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = getTheme() === 'dark' ? '#0B0B0B' : '#0A0A0A';
}

function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2; let h = 0, s = 0;
  if (max !== min) {
    const d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h * 360, s, l];
}

// A palette colour as TEXT or a thin border: unchanged on dark, darkened on light so it keeps ≥4.5:1 on white.
export function ink(hex) {
  const h = String(hex).replace('#', '');
  if (getTheme() === 'dark') return '#' + h;
  const [hue, s, l] = hexToHsl(h);
  return `hsl(${Math.round(hue)}deg ${Math.round(Math.min(1, s * 1.05) * 100)}% ${Math.round(Math.min(l, 0.36) * 100)}%)`;
}

// A palette colour as a FILL behind dark text: keep it vivid in both themes.
export const fill = hex => '#' + String(hex).replace('#', '');
