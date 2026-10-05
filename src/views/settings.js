import { ACCESS_CATALOG, ALL_PAGE_IDS } from '../access.js';
import { inviteLink, inviteMailto } from '../controllers/users.js';
import { formatDate } from '../utils.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || 'highvoltageindustries.com';

const STATUS_STYLE = {
  active:   'background:rgba(76,175,125,.18);color:var(--green)',
  invited:  'background:rgba(240,192,64,.18);color:var(--accent)',
  disabled: 'background:rgba(224,85,85,.15);color:var(--red)',
};

function accessSummary(u) {
  if (u.role === 'admin') return 'All pages + Settings';
  const n = (u.pages || []).length;
  if (!n) return 'No pages';
  const modules = ACCESS_CATALOG.filter(m => m.pages.some(p => u.pages.includes(p.id))).map(m => m.module.split(' (')[0]);
  return `${n} of ${ALL_PAGE_IDS.length} pages · ${modules.join(', ')}`;
}

export function renderSettings(users, myEmail, { onInvite, onEdit, onToggle, onDelete, onShowLink }) {
  const el = document.getElementById('settingsView');
  if (!el) return;

  const rows = users.map(u => {
    const isMe = u.email === myEmail;
    return `<tr>
      <td><div style="font-weight:500">${esc(u.full_name || '—')}${isMe ? ' <span style="color:var(--text3);font-size:11px">(you)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${esc(u.email)}</div></td>
      <td>${u.role === 'admin' ? '<span class="badge" style="background:rgba(155,127,232,.2);color:var(--purple)">Admin</span>' : 'Member'}</td>
      <td><span class="badge" style="${STATUS_STYLE[u.status] || ''}">${esc(u.status)}</span></td>
      <td style="font-size:12px;color:var(--text2)">${esc(accessSummary(u))}</td>
      <td style="font-size:11px;color:var(--text3);font-family:var(--mono)">${u.last_login_at ? formatDate(u.last_login_at.slice(0, 10)) : '—'}</td>
      <td style="white-space:nowrap;text-align:right">
        ${u.status === 'invited' ? `<button class="btn btn-sm" data-user-link="${u.id}">Invite link</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-user-edit="${u.id}">Edit access</button>
        ${!isMe ? `<button class="btn btn-sm btn-ghost" data-user-toggle="${u.id}">${u.status === 'disabled' ? 'Enable' : 'Disable'}</button>
        <button class="btn btn-sm btn-danger" data-user-delete="${u.id}">Remove</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem">
      <div>
        <div style="font-size:15px;font-weight:500">User management</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Invite people with an @${esc(ALLOWED_DOMAIN)} email and choose which pages each person can open.</div>
      </div>
      <button class="btn btn-accent" id="inviteUserBtn">+ Invite user</button>
    </div>
    <table class="list-table">
      <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Access</th><th>Last login</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="color:var(--text3)">No users yet.</td></tr>'}</tbody>
    </table>`;

  el.querySelector('#inviteUserBtn').addEventListener('click', onInvite);
  el.querySelectorAll('[data-user-edit]').forEach(b => b.addEventListener('click', () => onEdit(b.dataset.userEdit)));
  el.querySelectorAll('[data-user-toggle]').forEach(b => b.addEventListener('click', () => onToggle(b.dataset.userToggle)));
  el.querySelectorAll('[data-user-delete]').forEach(b => b.addEventListener('click', () => onDelete(b.dataset.userDelete)));
  el.querySelectorAll('[data-user-link]').forEach(b => b.addEventListener('click', () => onShowLink(b.dataset.userLink)));
}

// ─── Invite / edit form ────────────────────────────────────────────────────
export function renderUserForm(user, { onSave }) {
  const editing = !!user;
  const granted = new Set(user?.pages || []);
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');

  box.innerHTML = `
    <div class="modal-header">
      <h3>${editing ? 'Edit access' : 'Invite user'}</h3>
      <button class="btn btn-sm btn-ghost" id="usrClose">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="form-row"><label>Email</label>
          <input id="usr_email" type="email" value="${esc(user?.email || '')}" placeholder="name@${esc(ALLOWED_DOMAIN)}" ${editing ? 'disabled' : ''}></div>
        <div class="form-row"><label>Name</label><input id="usr_name" value="${esc(user?.full_name || '')}" placeholder="Full name"></div>
      </div>
      <div class="form-row"><label>Role</label>
        <select id="usr_role">
          <option value="member" ${user?.role !== 'admin' ? 'selected' : ''}>Member — only the pages selected below</option>
          <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin — all pages + user management</option>
        </select>
      </div>
      <div id="usrPagesBox">
        <div class="section-divider" style="margin:.75rem 0">Page access</div>
        ${ACCESS_CATALOG.map((m, i) => `
          <div style="margin-bottom:12px">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;cursor:pointer">
              <input type="checkbox" data-module-toggle="${i}"> ${esc(m.module)}
            </label>
            <div style="display:flex;flex-wrap:wrap;gap:6px 18px;margin:6px 0 0 22px">
              ${m.pages.map(p => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer">
                <input type="checkbox" data-page="${p.id}" data-module="${i}" ${granted.has(p.id) ? 'checked' : ''}> ${esc(p.label)}</label>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div class="login-error" id="usrError" style="margin-top:8px"></div>
    </div>
    <div class="modal-footer">
      <button class="btn" id="usrCancel">Cancel</button>
      <button class="btn btn-accent" id="usrSave">${editing ? 'Save changes' : 'Create invite'}</button>
    </div>`;
  overlay.classList.remove('hidden');

  const roleSel = box.querySelector('#usr_role');
  const pagesBox = box.querySelector('#usrPagesBox');
  const syncRole = () => { pagesBox.style.display = roleSel.value === 'admin' ? 'none' : ''; };
  const syncModuleBoxes = () => box.querySelectorAll('[data-module-toggle]').forEach(t => {
    const pages = box.querySelectorAll(`[data-page][data-module="${t.dataset.moduleToggle}"]`);
    const on = Array.from(pages).filter(p => p.checked).length;
    t.checked = on === pages.length; t.indeterminate = on > 0 && on < pages.length;
  });
  roleSel.addEventListener('change', syncRole);
  box.querySelectorAll('[data-module-toggle]').forEach(t => t.addEventListener('change', () => {
    box.querySelectorAll(`[data-page][data-module="${t.dataset.moduleToggle}"]`).forEach(p => { p.checked = t.checked; });
    syncModuleBoxes();
  }));
  box.querySelectorAll('[data-page]').forEach(p => p.addEventListener('change', syncModuleBoxes));
  syncRole(); syncModuleBoxes();

  const close = () => overlay.classList.add('hidden');
  box.querySelector('#usrClose').addEventListener('click', close);
  box.querySelector('#usrCancel').addEventListener('click', close);
  box.querySelector('#usrSave').addEventListener('click', async () => {
    const err = box.querySelector('#usrError');
    const email = box.querySelector('#usr_email').value.trim().toLowerCase();
    if (!editing && !email.endsWith('@' + ALLOWED_DOMAIN.toLowerCase())) {
      err.textContent = `Email must be an @${ALLOWED_DOMAIN} address.`; return;
    }
    const role = roleSel.value;
    const pages = Array.from(box.querySelectorAll('[data-page]:checked')).map(p => p.dataset.page);
    if (role === 'member' && !pages.length) { err.textContent = 'Select at least one page, or make this user an admin.'; return; }
    err.textContent = '';
    await onSave({ email, full_name: box.querySelector('#usr_name').value, role, pages }, msg => { err.textContent = msg; });
  });
}

// ─── Invite link panel (copy / email) ─────────────────────────────────────
export function renderInviteLink(user) {
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  const link = inviteLink(user.invite_token);

  box.innerHTML = `
    <div class="modal-header"><h3>Invite link</h3><button class="btn btn-sm btn-ghost" id="lnkClose">✕</button></div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--text2);margin-bottom:10px">
        Send this link to <b>${esc(user.email)}</b>. They must sign in with that exact Google account to confirm access.
      </div>
      <div class="form-row"><input id="lnkInput" readonly value="${esc(link)}" style="font-family:var(--mono);font-size:11px"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-accent" id="lnkCopy">Copy link</button>
        <a class="btn" href="${inviteMailto(user)}">Send by email</a>
      </div>
      <div id="lnkMsg" style="font-size:12px;color:var(--green);margin-top:8px;min-height:16px"></div>
    </div>`;
  overlay.classList.remove('hidden');

  box.querySelector('#lnkClose').addEventListener('click', () => overlay.classList.add('hidden'));
  box.querySelector('#lnkCopy').addEventListener('click', async () => {
    const input = box.querySelector('#lnkInput');
    try { await navigator.clipboard.writeText(link); } catch { input.select(); document.execCommand('copy'); }
    box.querySelector('#lnkMsg').textContent = 'Link copied.';
  });
}
