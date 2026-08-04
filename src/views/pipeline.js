import { PIPELINE_STAGES } from '../constants.js';
import { followupStatus } from '../controllers/leads.js';

function cardHtml(l) {
  const disc   = l.disc    ? `<span class="badge badge-${l.disc}">${l.disc}</span>` : '';
  const seg    = l.segment ? `<span class="badge badge-seg">${l.segment.split(' ')[0]}</span>` : '';
  const est    = l.est     ? `<span class="est-tag">$${parseFloat(l.est).toLocaleString()}</span>` : '';
  const status = followupStatus(l);
  const borderClass = status === 'overdue' ? ' lead-card-overdue' : status === 'today' ? ' lead-card-today' : '';
  const fuTag = status === 'overdue'
    ? `<span class="tag-overdue" style="font-size:9px;padding:1px 5px">Overdue</span>`
    : status === 'today'
    ? `<span class="tag-today" style="font-size:9px;padding:1px 5px">Today</span>`
    : '';

  return `<div class="lead-card${borderClass}" data-open-lead="${l.id}">
    <div class="lead-name">${l.contact || '—'}</div>
    <div class="lead-co">${l.company || '—'}</div>
    <div class="lead-meta">${disc}${seg}${est}${fuTag}</div>
  </div>`;
}

export function renderPipeline(leads, filtered) {
  // Follow-up urgency banner
  const urgent = leads.filter(l => {
    const s = followupStatus(l);
    return s === 'overdue' || s === 'today';
  });
  const banner = document.getElementById('pipelineFuBanner');
  if (urgent.length && banner) {
    const items = urgent.slice(0, 5).map(l => {
      const s = followupStatus(l);
      const tag = s === 'overdue'
        ? `<span class="tag-overdue" style="font-size:10px">Overdue</span>`
        : `<span class="tag-today" style="font-size:10px">Today</span>`;
      return `<span data-open-lead="${l.id}" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:4px 10px;font-size:12px;color:var(--text2)">${l.contact || l.company} ${tag}</span>`;
    }).join('');
    const more = urgent.length > 5 ? `<span style="font-size:11px;color:var(--text3)">+${urgent.length - 5} more</span>` : '';
    banner.innerHTML = `<div style="margin-bottom:1.5rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:11px;font-family:var(--mono);color:var(--text3);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">Follow-ups due</span>
      ${items}${more}
    </div>`;
  } else if (banner) {
    banner.innerHTML = '';
  }

  // Kanban columns
  document.getElementById('pipelineGrid').innerHTML = PIPELINE_STAGES.map(stage => {
    const stageleads = filtered.filter(l => l.stage === stage);
    const cards = stageleads.length
      ? stageleads.map(cardHtml).join('')
      : '<div class="empty-col">—</div>';
    return `<div class="stage-col">
      <div class="stage-header">${stage}<span class="stage-count">${stageleads.length}</span></div>
      ${cards}
    </div>`;
  }).join('');
}
