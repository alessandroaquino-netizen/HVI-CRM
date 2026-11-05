// "Import dates from an email thread": upload or paste, review what was found, apply only what is ticked.
import { readThreadFile, analyzeThread } from '../controllers/emailDates.js';
import { KIND_LABELS, phaseForKind } from '../emailDates/parse.js';
import { planChanges } from '../emailDates/plan.js';
import { DTC_PHASES } from '../dtc_constants.js';
import { formatDate } from '../utils.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PHASE_ORDER = ['idea', 'design', 'tech-pack', 'sampling', 'production', 'shipping', 'warehouse'];

export function openEmailDatesModal(product, existingPhaseDates, { onApply }) {
  const box = document.getElementById('modalBox'); const overlay = document.getElementById('modalOverlay'); box.removeAttribute('data-drop-modal');
  box.innerHTML = `<div class="modal-header"><div><h3>Import dates from an email thread</h3><div class="mo-meta">${esc(product.name)}</div></div><button class="btn btn-sm btn-ghost" id="edX">✕</button></div>
    <div class="modal-body" id="edBody">
      <div class="mo-note" style="margin-top:0">In Gmail, open the thread, print it and save as PDF, or copy the text. Nothing changes until you review the dates found and press Apply.</div>
      <div class="form-row"><label>PDF or text file of the email thread</label><input type="file" id="edFile" accept=".pdf,.txt,.eml,.md"></div>
      <div class="form-row"><label>…or paste the text</label><textarea id="edText" rows="6" placeholder="Paste the emails here"></textarea></div>
      <div style="display:flex;justify-content:flex-end"><button class="btn btn-accent" id="edGo">Find dates</button></div>
      <div id="edOut"></div></div>`;
  overlay.classList.remove('hidden');
  const q = s => box.querySelector(s); const close = () => overlay.classList.add('hidden');
  q('#edX').addEventListener('click', close);
  q('#edGo').addEventListener('click', async () => {
    const file = q('#edFile').files[0]; let text = q('#edText').value; const out = q('#edOut'); out.innerHTML = '<div class="mo-meta" style="margin-top:12px">Reading…</div>';
    try {
      let read = { text, file: null };
      if (file) read = await readThreadFile(file);
      else if (text.trim().length < 20) throw new Error('Choose a file or paste the email text.');
      const result = await analyzeThread({ text: read.text, file: file && !read.text.trim() ? file : null });
      show(result);
    } catch (e) { out.innerHTML = `<div class="notes-display" style="border-left:3px solid var(--red);margin-top:12px">${esc(e.message || e)}</div>`; }
  });

  function show(r) {
    const out = q('#edOut'); const cur = PHASE_ORDER.indexOf(product.phase);
    const phaseSuggest = (() => { const ph = r.events.map(e => phaseForKind(e.kind)).filter(Boolean).map(k => (k === 'shipping' ? 'shipping' : k)); const best = ph.sort((a, b) => PHASE_ORDER.indexOf(b) - PHASE_ORDER.indexOf(a))[0]; return best && PHASE_ORDER.indexOf(best) > cur ? best : null; })();
    out.innerHTML = `${r.note ? `<div class="mo-note">${esc(r.note)}</div>` : ''}
      <div class="section-divider" style="margin-top:14px">Found ${r.events.length} date${r.events.length === 1 ? '' : 's'}${r.tracking?.length ? ` and ${r.tracking.length} tracking number${r.tracking.length > 1 ? 's' : ''}` : ''} <span class="mo-meta">(${r.source === 'ai' ? 'read by AI' : 'built-in reader'})</span></div>
      ${r.events.map((e, i) => `<label class="ed-row"><input type="checkbox" data-ev="${i}" ${e.confidence === 'low' ? '' : 'checked'}>
        <div><div><b>${esc(KIND_LABELS[e.kind] || e.kind)}</b> · <input type="date" data-ev-date="${i}" value="${e.date}"> <span class="mo-meta">${esc(e.confidence || '')} confidence</span></div>
        <div class="mo-meta">“${esc(e.quote)}”${e.emailDate ? ` · email of ${formatDate(e.emailDate)}` : ''}</div></div></label>`).join('') || '<div class="mo-meta">No dated milestones were found in this text.</div>'}
      ${(r.tracking || []).map((t, i) => `<label class="ed-row"><input type="radio" name="edTrack" data-tr="${i}" ${i === 0 ? 'checked' : ''}><div><b>Tracking ${esc(t.number)}</b> <span class="mo-meta">${esc(t.carrier)}</span></div></label>`).join('')}
      ${phaseSuggest ? `<label class="ed-row"><input type="checkbox" id="edPhase"><div><b>Also move the product to “${esc(DTC_PHASES.find(p => p.id === phaseSuggest)?.label || phaseSuggest)}”</b><div class="mo-meta">The latest milestone found is in that phase. Left unticked by default.</div></div></label>` : ''}
      <div class="mo-meta" style="margin-top:8px">Dates found are written to the phase timeline, the shipping fields and the order date. Review each one against the quote.</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="edCancel">Cancel</button><button class="btn btn-accent" id="edApply" ${r.events.length || r.tracking?.length ? '' : 'disabled'}>Apply selected</button></div>`;
    out.querySelector('#edCancel').addEventListener('click', close);
    out.querySelector('#edApply').addEventListener('click', async () => {
      const events = [...out.querySelectorAll('[data-ev]:checked')].map(c => ({ ...r.events[+c.dataset.ev], date: out.querySelector(`[data-ev-date="${c.dataset.ev}"]`).value })).filter(e => e.date);
      const tr = out.querySelector('[name="edTrack"]:checked'); const tracking = tr ? r.tracking[+tr.dataset.tr] : null;
      const movePhase = out.querySelector('#edPhase')?.checked ? phaseSuggest : null;
      if (!events.length && !tracking && !movePhase) return;
      try { await onApply(planChanges(product, existingPhaseDates, { events, tracking, movePhase })); close(); } catch (e) { alert('Could not apply: ' + (e.message || e)); }
    });
  }
}
