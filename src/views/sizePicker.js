// Checkbox size picker (Nov 11 meeting: typing sizes separated by commas was too much work).
// `have` = labels already on the product (shown ticked and locked), `suggested` = the standard range for the product type.
import { SIZE_GROUPS, parseLabels } from '../dtc_constants.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function pickSizes({ title = 'Add sizes', have = [], suggested = [], onAdd }) {
  // own layer on top, so a product being edited underneath keeps its unsaved rows
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.style.zIndex = '1200';
  const box = document.createElement('div'); box.className = 'modal'; overlay.appendChild(box); document.body.appendChild(overlay);
  const haveSet = new Set(have.map(x => String(x).trim().toLowerCase()));
  const group = g => `<div class="sz-group"><div class="sz-label">${esc(g.label)}</div><div class="sz-grid">${g.sizes.map(s => {
    const has = haveSet.has(s.toLowerCase());
    return `<label class="sz-chip${has ? ' has' : ''}"><input type="checkbox" value="${esc(s)}" ${has ? 'checked disabled' : ''}><span>${esc(s)}</span></label>`; }).join('')}</div></div>`;
  box.innerHTML = `<div class="modal-header"><h3>${esc(title)}</h3><button class="btn btn-sm btn-ghost" data-close>✕</button></div>
    <div class="modal-body">
      <p class="sc-modal-sub">Tick the sizes this product comes in. Sizes already added are locked.</p>
      ${suggested.length ? `<button class="btn btn-sm" id="szStd" type="button">Select the standard range (${esc(suggested[0])}–${esc(suggested[suggested.length - 1])})</button>` : ''}
      ${SIZE_GROUPS.map(group).join('')}
      <div class="form-row" style="margin-top:12px"><label>Other sizes, colors or variants (separate with commas)</label><input id="szOther" placeholder="e.g. Black, Navy"></div>
    </div>
    <div class="modal-footer"><span id="szCount" class="sc-ro" style="margin-right:auto"></span><button class="btn" data-close>Cancel</button><button class="btn btn-accent" id="szAdd">Add</button></div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  box.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  const chosen = () => [...box.querySelectorAll('.sz-chip input:checked:not(:disabled)')].map(i => i.value);
  const count = () => { const n = chosen().length + parseLabels(box.querySelector('#szOther').value).length; box.querySelector('#szCount').textContent = n ? `${n} to add` : ''; };
  box.addEventListener('change', count); box.querySelector('#szOther').addEventListener('input', count);
  box.querySelector('#szStd')?.addEventListener('click', () => { const s = new Set(suggested); box.querySelectorAll('.sz-chip input:not(:disabled)').forEach(i => { if (s.has(i.value)) i.checked = true; }); count(); });
  box.querySelector('#szAdd').addEventListener('click', async () => {
    const labels = [...new Set([...chosen(), ...parseLabels(box.querySelector('#szOther').value)])].filter(l => !haveSet.has(l.toLowerCase()));
    if (!labels.length) return alert('Tick at least one size or type a variant.');
    try { await onAdd(labels); close(); } catch (e) { alert('Could not add: ' + (e.message || e)); }
  });
}
