// Small dependency-free chart helpers. Each returns an HTML/SVG string that follows the theme tokens
// (--viz-1…8, --text, --bg4) so charts stay legible in light and dark. Rows can carry an `attr` string
// (e.g. `data-open-lead="x"`) to make a bar clickable through the app's delegated handlers.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const vizColor = i => `var(--viz-${(i % 8) + 1})`;
const col = (r, i) => r.color || vizColor(i);

export function legend(items) {
  return `<div class="viz-legend">${items.map((r, i) => `<span><i style="background:${col(r, i)}"></i>${esc(r.label)}${r.value != null ? ` <b style="color:var(--text)">${esc(r.display ?? r.value)}</b>` : ''}</span>`).join('')}</div>`;
}

// Donut with a total in the middle.
export function donut(rows, { size = 156, thickness = 24, center, centerLabel } = {}) {
  const data = rows.filter(r => r.value > 0);
  const total = data.reduce((a, r) => a + r.value, 0);
  if (!total) return '<div class="viz-empty">No data yet.</div>';
  const r = (size - thickness) / 2, C = 2 * Math.PI * r, mid = size / 2;
  let off = 0;
  const arcs = data.map((d, i) => {
    const len = (d.value / total) * C;
    const seg = `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${col(d, i)}" stroke-width="${thickness}" stroke-dasharray="${Math.max(len - 2, 0.5)} ${C - Math.max(len - 2, 0.5)}" stroke-dashoffset="${-off}" transform="rotate(-90 ${mid} ${mid})"><title>${esc(d.label)}: ${esc(d.display ?? d.value)}</title></circle>`;
    off += len; return seg;
  }).join('');
  return `<div class="viz-donut"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(centerLabel || 'Distribution')}">
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--bg4)" stroke-width="${thickness}"/>${arcs}
      <text x="${mid}" y="${mid + 4}" text-anchor="middle" class="viz-donut-center">${esc(center ?? total)}</text>
      ${centerLabel ? `<text x="${mid}" y="${mid + 22}" text-anchor="middle" class="viz-donut-sub">${esc(centerLabel)}</text>` : ''}</svg>
    ${legend(data.map(d => ({ ...d, display: d.display ?? d.value })))}</div>`;
}

// Horizontal bars with value labels.
export function hbars(rows, { max } = {}) {
  const m = max ?? Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return '<div class="viz-empty">No data yet.</div>';
  return `<div class="viz-bars">${rows.map((r, i) => `<div class="viz-bar-row" ${r.attr ? `${r.attr} data-click="1"` : ''}>
      <span class="viz-bar-label" title="${esc(r.label)}">${esc(r.label)}</span>
      <div class="viz-bar-track"><div class="viz-bar-fill" style="width:${Math.max(0, (r.value / m) * 100)}%;background:${col(r, i)}"></div></div>
      <span class="viz-bar-val">${esc(r.display ?? r.value)}</span></div>`).join('')}</div>`;
}

// One stacked horizontal bar (for example paid vs pending) with a legend.
export function stack(parts, { total } = {}) {
  const t = total ?? parts.reduce((a, p) => a + p.value, 0);
  if (!t) return '<div class="viz-empty">No data yet.</div>';
  return `<div class="viz-stack" role="img" aria-label="${esc(parts.map(p => p.label + ' ' + (p.display ?? p.value)).join(', '))}">${parts.map((p, i) => `<div style="width:${(p.value / t) * 100}%;background:${col(p, i)}" title="${esc(p.label)}: ${esc(p.display ?? p.value)}"></div>`).join('')}</div>${legend(parts)}`;
}

// Vertical columns (for example payments per horizon, units per phase).
export function columns(rows) {
  const m = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return '<div class="viz-empty">No data yet.</div>';
  return `<div class="viz-cols">${rows.map((r, i) => `<div class="viz-col" ${r.attr ? `${r.attr} data-click="1" style="cursor:pointer"` : ''}>
      <span class="viz-col-val">${esc(r.display ?? r.value)}</span>
      <div class="viz-col-bar" style="height:${Math.max(2, (r.value / m) * 100)}%;background:${col(r, i)}"></div>
      <span class="viz-col-label">${esc(r.label)}</span></div>`).join('')}</div>`;
}

// Funnel: bar length is the share of the largest stage; the count sits on the bar, the value to its right.
export function funnel(rows) {
  const m = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return '<div class="viz-empty">No data yet.</div>';
  return `<div class="viz-funnel">${rows.map((r, i) => `<div class="viz-funnel-row" ${r.attr ? `${r.attr} data-click="1" style="cursor:pointer"` : ''}>
      <span class="viz-bar-label" title="${esc(r.label)}">${esc(r.label)}</span>
      <div class="viz-bar-track" style="height:26px;border-radius:6px"><div class="viz-funnel-bar" style="width:${Math.max(8, (r.value / m) * 100)}%;background:${col(r, i)}">${esc(r.value)}</div></div>
      <span class="viz-bar-val" style="min-width:64px">${esc(r.display ?? '')}</span></div>`).join('')}</div>`;
}

export function sparkline(values, { color = 'var(--viz-1)' } = {}) {
  if (!values.length) return '';
  const w = 200, h = 44, m = Math.max(1, ...values), step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - (v / m) * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="viz-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export const panel = (title, body, { sub, attrs = '' } = {}) => `<section class="panel" ${attrs}><div class="panel-title">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>${body}</section>`;
