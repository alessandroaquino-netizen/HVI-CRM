// Catalog of grantable pages, grouped by module. `id` matches the sidebar `data-view` value.
export const ACCESS_CATALOG = [
  { module: 'Sales', pages: [
    { id: 'pipeline',          label: 'Pipeline' },
    { id: 'list',              label: 'All Leads' },
    { id: 'followups',         label: 'Follow-ups' },
    { id: 'leadDashboard',     label: 'Dashboard Lead Management' },
  ]},
  { module: 'Operations (B2B Projects)', pages: [
    { id: 'projects',          label: 'B2B Projects' },
    { id: 'projectsDashboard', label: 'Dashboard B2B Projects' },
  ]},
  { module: 'DTC Operations', pages: [
    { id: 'dtcProducts',       label: 'DTC Products' },
    { id: 'dtcCalendar',       label: 'DTC Calendar' },
    { id: 'dtcFinancials',     label: 'DTC Financials' },
    { id: 'dtcDashboard',      label: 'DTC Dashboard' },
    { id: 'dtcMarketing',      label: 'Marketing Ops' },
  ]},
  { module: 'Resources', pages: [
    { id: 'disc',              label: 'DISC Guide' },
  ]},
];

export const ALL_PAGE_IDS = ACCESS_CATALOG.flatMap(m => m.pages.map(p => p.id));

let myAccess = null;

export function setMyAccess(access) { myAccess = access; }
export function getMyAccess() { return myAccess; }
export function isAdmin() { return myAccess?.role === 'admin'; }

// Admins see every page plus Settings; members see only their granted pages.
export function canView(viewId) {
  if (!myAccess) return false;
  if (viewId === 'settings') return isAdmin();
  return isAdmin() || (myAccess.pages || []).includes(viewId);
}

export function firstAllowedView() {
  return ALL_PAGE_IDS.find(canView) || (isAdmin() ? 'settings' : null);
}
