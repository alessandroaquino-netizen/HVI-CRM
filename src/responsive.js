// Mobile navigation drawer and card-style tables on small screens.
const NAV_CLASS = 'nav-open';

export function initResponsive() {
  const shell = document.getElementById('appShell');
  const toggle = open => {
    shell.classList.toggle(NAV_CLASS, open);
    document.getElementById('menuBtn')?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  document.getElementById('menuBtn')?.addEventListener('click', () => toggle(!shell.classList.contains(NAV_CLASS)));
  document.getElementById('navScrim')?.addEventListener('click', () => toggle(false));
  document.getElementById('sidebarNav')?.addEventListener('click', e => { if (e.target.closest('.nav-item')) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  window.matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) toggle(false); });

  // Every table cell learns its column title so the mobile "card" layout can show it.
  const enhance = root => {
    root.querySelectorAll('table.list-table').forEach(table => {
      if (!table.parentElement.classList.contains('table-scroll')) {
        const wrap = document.createElement('div');
        wrap.className = 'table-scroll';
        table.parentElement.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (!heads.length) return;
      table.querySelectorAll('tbody tr').forEach(tr => {
        if (tr.dataset.enhanced) return;
        [...tr.children].forEach((td, i) => { if (!td.dataset.label && heads[i]) td.dataset.label = heads[i]; });
        tr.dataset.enhanced = '1';
      });
    });
  };
  let queued = false;
  const schedule = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; enhance(document); }, 0); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  enhance(document);
}
