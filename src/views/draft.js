import { DRAFT_TEMPLATES, buildDraft, placeholderCount } from '../outreach/draft.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}

// ctx: { company, contacts: [{ name, title }], angle, signal, executiveName, sender, onMarkContacted }
export function renderDraftModal(ctx) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const people = (ctx.contacts || []).filter(p => p.name);
  const state = { template: 'intro', person: 0, sender: ctx.sender || '' };
  const pick = () => people[state.person] || {};

  const compose = () => buildDraft(state.template, {
    company: ctx.company, contactName: pick().name, contactTitle: pick().title, angle: ctx.angle, signal: ctx.signal,
    executiveName: ctx.executiveName, sender: state.sender,
  });

  box.innerHTML = `
    <div class="modal-header"><h3>Draft email · ${esc(ctx.company)}</h3><button class="btn btn-sm btn-ghost" id="drClose">✕</button></div>
    <div class="modal-body">
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
        This text is only a draft built from what the system knows. Nothing is sent and nothing is connected to Gmail:
        copy it, edit it, and send it yourself.
      </div>
      <div class="form-grid">
        <div class="form-row"><label>Template</label><select id="dr_tpl">${DRAFT_TEMPLATES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></div>
        <div class="form-row"><label>To</label><select id="dr_to">${people.length ? people.map((p, i) => `<option value="${i}">${esc(p.name)}${p.title ? ' · ' + esc(p.title) : ''}</option>`).join('') : '<option value="0">(no contact yet)</option>'}</select></div>
      </div>
      <div class="form-row"><label>Your name (signature)</label><input id="dr_sender" value="${esc(state.sender)}" placeholder="Tony"></div>
      <div class="form-row"><label>Subject</label>
        <div style="display:flex;gap:8px"><input id="dr_subject" style="flex:1"><button class="btn btn-sm" id="drCopySubject">Copy</button></div></div>
      <div class="form-row"><label>Message</label><textarea id="dr_body" style="min-height:260px;font-family:var(--font);line-height:1.5"></textarea></div>
      <div id="drNote" style="font-size:12px;min-height:16px"></div>
    </div>
    <div class="modal-footer">
      ${ctx.onMarkContacted ? '<button class="btn" id="drMark" style="margin-right:auto">Mark as contacted today</button>' : ''}
      <button class="btn btn-ghost" id="drReset">Regenerate</button>
      <button class="btn btn-accent" id="drCopy">Copy message</button>
    </div>`;
  overlay.classList.remove('hidden');

  const subject = box.querySelector('#dr_subject'), body = box.querySelector('#dr_body'), note = box.querySelector('#drNote');
  const fill = () => {
    const d = compose(); subject.value = d.subject; body.value = d.body; refreshNote();
  };
  const refreshNote = () => {
    const n = placeholderCount(subject.value + '\n' + body.value);
    note.style.color = n ? 'var(--accent)' : 'var(--green)';
    note.textContent = n ? `${n} [bracketed] placeholder${n > 1 ? 's' : ''} still to fill in before sending.` : 'No placeholders left.';
  };
  box.querySelector('#dr_tpl').addEventListener('change', e => { state.template = e.target.value; fill(); });
  box.querySelector('#dr_to').addEventListener('change', e => { state.person = Number(e.target.value); fill(); });
  box.querySelector('#dr_sender').addEventListener('input', e => { state.sender = e.target.value.trim(); fill(); });
  box.querySelector('#drReset').addEventListener('click', fill);
  subject.addEventListener('input', refreshNote); body.addEventListener('input', refreshNote);
  box.querySelector('#drCopySubject').addEventListener('click', async () => { note.textContent = (await copy(subject.value)) ? 'Subject copied.' : 'Could not copy; select the text and copy it manually.'; });
  box.querySelector('#drCopy').addEventListener('click', async () => { note.style.color = 'var(--green)'; note.textContent = (await copy(body.value)) ? 'Message copied. Paste it into Gmail, review it and send.' : 'Could not copy; select the text and copy it manually.'; });
  box.querySelector('#drMark')?.addEventListener('click', async e => { await ctx.onMarkContacted(); e.target.textContent = 'Marked'; e.target.disabled = true; });
  box.querySelector('#drClose').addEventListener('click', () => overlay.classList.add('hidden'));
  fill();
}
