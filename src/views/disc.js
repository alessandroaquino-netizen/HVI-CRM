import { DISC } from '../constants.js';

export function renderDisc() {
  document.getElementById('discGuide').innerHTML = Object.entries(DISC).map(([k, d]) => `
    <div class="disc-card disc-${k}">
      <div class="disc-card-header">
        <div class="disc-initial">${k}</div>
        <div>
          <div class="disc-card-title">${d.label}</div>
          <div class="disc-card-sub">${d.desc}</div>
        </div>
      </div>
      <div class="disc-section-label">How to talk to them</div>
      <div class="disc-body">${d.talk}</div>
      <div class="disc-section-label">How to close</div>
      <div class="disc-body">${d.close}</div>
      <div class="disc-section-label">What kills the deal</div>
      <div class="disc-avoid">${d.avoid}</div>
    </div>`).join('');
}
