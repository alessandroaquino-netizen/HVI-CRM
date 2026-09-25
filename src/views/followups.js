import { followupStatus } from '../controllers/leads.js';
import { formatDate } from '../utils.js';

function rowHtml(l, status) {
  const tag = status === 'overdue'
    ? `<span class="tag-overdue">Overdue · ${formatDate(l.followupDate)}</span>`
    : status === 'today'
    ? `<span class="tag-today">Today</span>`
    : `<span class="tag-upcoming">${formatDate(l.followupDate)}</span>`;

  return `<div class="followup-row" data-open-lead="${l.id}">
    <div>
      <div class="followup-name">${l.contact || '—'} <span style="font-size:11px;color:var(--text3);font-weight:400">· ${l.company || ''}</span></div>
      <div class="followup-co">${l.stage}${l.followupNote ? ' · ' + l.followupNote : ''}</div>
    </div>
    ${tag}
  </div>`;
}

export function renderFollowups(leads) {
  const overdue  = leads.filter(l => followupStatus(l) === 'overdue').sort((a, b) => a.followupDate.localeCompare(b.followupDate));
  const today    = leads.filter(l => followupStatus(l) === 'today');
  const upcoming = leads.filter(l => followupStatus(l) === 'upcoming').sort((a, b) => a.followupDate.localeCompare(b.followupDate)).slice(0, 10);

  let html = '';
  if (!overdue.length && !today.length && !upcoming.length) {
    html = '<div style="color:var(--text3);font-size:13px;padding:2rem 0">No follow-ups scheduled. Open a lead and set a follow-up date.</div>';
  } else {
    if (overdue.length)  html += `<div class="followup-banner"><div class="followup-banner-header" style="color:var(--red)">Overdue — ${overdue.length}</div>${overdue.map(l => rowHtml(l, 'overdue')).join('')}</div>`;
    if (today.length)    html += `<div class="followup-banner"><div class="followup-banner-header" style="color:var(--accent)">Due today — ${today.length}</div>${today.map(l => rowHtml(l, 'today')).join('')}</div>`;
    if (upcoming.length) html += `<div class="followup-banner"><div class="followup-banner-header">Upcoming</div>${upcoming.map(l => rowHtml(l, 'upcoming')).join('')}</div>`;
  }
  document.getElementById('followupsContent').innerHTML = html;
}

export function updateFollowupBadge(leads) {
  const urgent = leads.filter(l => { const s = followupStatus(l); return s === 'overdue' || s === 'today'; });
  const badge  = document.getElementById('followupBadge');
  if (!badge) return;
  if (urgent.length > 0) {
    badge.classList.remove('hidden');
    badge.textContent = urgent.length;
  } else {
    badge.classList.add('hidden');
  }
}
