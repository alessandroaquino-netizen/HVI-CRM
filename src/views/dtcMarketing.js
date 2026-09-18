export function renderDtcMarketing(marketing, products) {
  const el = document.getElementById('dtcMarketingView');
  if (!el) return;

  const active = marketing.filter(m => m.drop_date >= new Date().toISOString().slice(0,10));

  el.innerHTML = `
    <div style="margin-bottom:1.5rem">
      ${active.length === 0 && marketing.length === 0 ? '' : `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:2rem">
        <div class="kpi-card"><div class="kpi-label">Products in pre-marketing</div><div class="kpi-val">${marketing.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Upcoming drops</div><div class="kpi-val">${active.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Status</div><div class="kpi-val" style="font-size:16px;color:var(--accent)">Phase 2</div><div class="kpi-sub">Marketing phases TBD</div></div>
      </div>`}
    </div>

    <!-- Phase 2 notice -->
    <div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--purple);border-radius:var(--radius-lg);padding:1.5rem;margin-bottom:2rem">
      <div style="font-size:13px;font-weight:500;color:var(--purple);margin-bottom:8px">📋  Marketing Operations — Phase 2</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6">
        The detailed marketing phases (email sequences, social posts, influencer drops, etc.) will be added here once Adriana documents the full workflow from Notion. 
        For now, this page tracks which products have entered pre-marketing and their scheduled drop dates.
      </div>
    </div>

    <!-- Products in pre-marketing -->
    <div class="section-divider" style="margin-bottom:1rem">Products in Pre-Marketing</div>
    ${marketing.length ? `
    <table class="list-table">
      <thead><tr>
        <th>Product</th>
        <th>Pre-marketing started</th>
        <th>Drop date</th>
        <th>Weeks until drop</th>
        <th>Notes</th>
      </tr></thead>
      <tbody>
        ${marketing.sort((a,b) => (a.drop_date||'').localeCompare(b.drop_date||'')).map(m => {
          const weeks = m.drop_date ? Math.round((new Date(m.drop_date) - new Date()) / (7*24*3600*1000)) : null;
          return `<tr>
            <td>${m.product_name||'—'}</td>
            <td style="font-family:var(--mono);font-size:12px">${m.premarketing_start||'—'}</td>
            <td style="font-family:var(--mono);font-size:12px;color:var(--accent)">${m.drop_date||'—'}</td>
            <td style="color:${weeks!==null&&weeks<2?'var(--red)':weeks!==null&&weeks<4?'var(--accent)':'var(--text2)'}">${weeks!==null?weeks+'w':'—'}</td>
            <td style="font-size:11px;color:var(--text3)">${m.notes||'—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : `
    <div style="text-align:center;color:var(--text3);padding:3rem;font-size:13px">
      No products in pre-marketing yet.<br>
      Open a product and click "▶ Start Pre-marketing" to add it here.
    </div>`}`;
}
