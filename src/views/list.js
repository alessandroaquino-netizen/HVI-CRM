export function renderList(filtered) {
  const table = document.getElementById('listTable');
  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="6" style="padding:2rem;color:var(--text3);text-align:center">No leads yet. Add your first one.</td></tr>';
    return;
  }
  table.innerHTML = `
    <thead><tr>
      <th>Company</th><th>Contact</th><th>Stage</th><th>DISC</th><th>Est. value</th><th>Segment</th>
    </tr></thead>
    <tbody>${filtered.map(l => `
      <tr data-open-lead="${l.id}">
        <td>${l.company  || '—'}</td>
        <td>${l.contact  || '—'}</td>
        <td>${l.stage}</td>
        <td>${l.disc ? `<span class="badge badge-${l.disc}">${l.disc}</span>` : '—'}</td>
        <td>${l.est  ? '$' + parseFloat(l.est).toLocaleString() : '—'}</td>
        <td>${l.segment  || '—'}</td>
      </tr>`).join('')}
    </tbody>`;
}
