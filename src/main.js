import { supabase } from './supabase.js';
import { signInWithGoogle, signOut, authorizeSignedInUser, onAuthChange } from './auth.js';
import { setMyAccess, setMyEmailAddr, getMyAccess, isAdmin, canView, firstAllowedView } from './access.js';
import {
  fetchAppUsers, inviteUser, updateAppUser, setAppUserStatus, deleteAppUser,
  captureInviteTokenFromUrl, getPendingInviteToken,
} from './controllers/users.js';
import { fetchLeads, saveLead, updateStage, deleteLead, subscribeToLeads } from './controllers/leads.js';
import { fetchProjects, saveProject, updateProjectStage, deleteProject, subscribeToProjects } from './controllers/projects.js';
import {
  fetchStageDates, saveStageDates, stageDatesForProject, subscribeToStageDates,
  fetchActivity, addActivity, logStageChange, activityForProject, subscribeToActivity,
} from './controllers/projectTracking.js';
import {
  fetchActivity as fetchLeadActivity,
  addActivity as addLeadActivity,
  logStageChange as logLeadStageChange,
  activityForLead,
  subscribeToActivity as subscribeToLeadActivity,
} from './controllers/leadActivity.js';
import {
  fetchDtcProducts, saveDtcProduct, saveRelevantLinks, saveDtcShipping, updateDtcPhase, deleteDtcProduct, startPremarketing,
  fetchDtcFinancials, saveDtcFinancial, deleteDtcFinancial,
  fetchDtcMarketing, subscribeToDtc, updateDtcDropDate, saveProductionTimes,
  fetchDtcVariants, saveDtcVariants, variantsForProduct, copyDtcVariants, upsertVariantsBySku,
} from './controllers/dtc.js';
import {
  fetchDtcPhaseDates, saveDtcPhaseDates, clearDtcPhaseDates, phaseDatesForDtcProduct, subscribeToDtcPhaseDates,
} from './controllers/dtcPhaseDates.js';
import { renderKPIs } from './views/kpi.js';
import { renderPipeline } from './views/pipeline.js';
import { renderList } from './views/list.js';
import { renderFollowups, updateFollowupBadge } from './views/followups.js';
import { renderDisc } from './views/disc.js';
import { renderDetail, renderForm, closeModal } from './views/modal.js';
import { renderProjects, renderProjectDetail, renderProjectForm } from './views/projects.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProjectsDashboard } from './views/projectsDashboard.js';
import { renderDtcProducts, renderDtcProductDetail, renderDtcProductForm } from './views/dtcProducts.js';
import { renderDtcCalendar } from './views/dtcCalendar.js';
import { renderDtcFinancials, renderDtcFinancialForm } from './views/dtcFinancials.js';
import { renderDtcDashboard } from './views/dtcDashboard.js';
import { initDropflow, renderMarketingOps, dropForProduct, openDropModal, openCreateDropFor } from './views/dropflow.js';
import { fetchDropflow, subscribeToDropflow, moveLaunchDate } from './controllers/dropflow.js';
import { initInventory, renderDtcInventory } from './views/dtcInventory.js';
import { initTeam, renderTeamScorecard } from './views/teamScorecard.js';
import { fetchKpiData } from './controllers/kpi.js';
import { fetchInventory, upsertOrdered } from './controllers/inventory.js';
import { fetchCalendarEvents, saveCalendarEvent, deleteCalendarEvent } from './controllers/calendarEvents.js';
import { refreshTracking } from './controllers/tracking.js';
import { needsRefresh } from './tracking/status.js';
import { openEmailDatesModal } from './views/emailDates.js';
import { costPerUnit } from './inventory/reconcile.js';
import { renderSettings, renderUserForm, renderInviteLink } from './views/settings.js';
import {
  fetchNecaLeads, updateNecaLead, deleteNecaLead, linkNecaToLead, unlinkNecaFromLead, dismissNecaSuggestion, runNecaCrosslink,
  createPotentialLead, markNecaContacted,
} from './controllers/neca.js';
import { renderNecaLeads, renderNecaLeadDetail, renderAddPotentialLead } from './views/necaLeads.js';
import { renderDraftModal } from './views/draft.js';
import { renderSummary } from './views/summary.js';
import { renderSkuImport } from './views/skuImport.js';
import { initTheme, toggleTheme } from './theme.js';
import { initResponsive } from './responsive.js';
import { fetchInvoices, fetchAliases, saveInvoicePlan, deleteInvoice, invoiceFileUrl, attachOriginalFile, saveInvoiceSourceUrl } from './controllers/invoices.js';
import { readInvoiceFile, makeAiExtractor, sha256 } from './invoices/readFile.js';
import { renderDtcInvoices, renderInvoiceReview, renderInvoiceDetail } from './views/dtcInvoices.js';
import { productCosts } from './invoices/cost.js';

// ---------- state ----------
let leads             = [];
let projects          = [];
let projectStageDates = [];
let projectActivity   = [];
let leadActivity      = [];
let dtcProducts       = [];
let dtcFinancials     = [];
let dtcMarketing      = [];
let dtcVariants       = [];
let dtcPhaseDates     = [];
let appUsers          = [];
let necaLeads         = [];
let dtcInvoices       = [];
let dtcAliases        = [];
let dtcInventory      = [];
let kpiData           = { kpis: [], values: [], rocks: [], rockKpis: [] };
let calendarEvents    = [];
let dropflow          = { loaded: false, error: '', drops: [], tasks: [], templates: [], roles: [], events: [] };
let necaLoaded        = false;
let myEmail           = '';
let currentView = 'pipeline';
let editingId   = null;
let editingProjectId = null;
let editingDtcProductId   = null;
let editingDtcFinancialId = null;
let realtimeLeads         = null;
let realtimeProjects      = null;
let realtimeStageDates    = null;
let realtimeActivity      = null;
let realtimeLeadActivity  = null;
let realtimeDtc           = null;
let realtimeDtcPhaseDates = null;
let realtimeDropflow      = null;

// ---------- helpers ----------
function getFiltered() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  if (!q) return leads;
  return leads.filter(l =>
    (l.company || '').toLowerCase().includes(q) ||
    (l.contact || '').toLowerCase().includes(q) ||
    (l.stage   || '').toLowerCase().includes(q)
  );
}

const ALL_VIEWS = [
  'pipeline', 'list', 'disc', 'followups', 'projects', 'leadDashboard', 'projectsDashboard',
  'dtcProducts', 'dtcCalendar', 'dtcFinancials', 'dtcDashboard', 'dtcMarketing', 'dtcInventory', 'settings', 'necaLeads', 'dtcInvoices', 'summary', 'teamScorecard',
];

// ---------- render ----------
function render() {
  renderKPIs(leads);
  updateFollowupBadge(leads);
  if (currentView === 'pipeline')          renderPipeline(leads, getFiltered());
  if (currentView === 'list')              renderList(getFiltered());
  if (currentView === 'disc')              renderDisc();
  if (currentView === 'followups')         renderFollowups(leads);
  if (currentView === 'projects')          renderProjects(projects, leads);
  if (currentView === 'leadDashboard')     renderDashboard(leads, projects);
  if (currentView === 'projectsDashboard') renderProjectsDashboard(projects, projectActivity, projectStageDates);
  if (currentView === 'dtcProducts')       renderDtcProducts(dtcProducts, { onRefreshTracking: refreshAllTracking });
  if (currentView === 'dtcCalendar')       renderDtcCalendar(dtcProducts, dtcPhaseDates, { onMoveDrop: handleMoveDrop, onPreview: previewDropMove, onAddToPipeline: handleAddToPipeline, events: calendarEvents, onSaveEvent: async (e, id) => { await saveCalendarEvent(e, id); await refresh(); }, onDeleteEvent: async id => { await deleteCalendarEvent(id); await refresh(); } });
  if (currentView === 'dtcFinancials')     renderDtcFinancials(dtcFinancials, dtcProducts, productCosts(dtcInvoices));
  if (currentView === 'dtcDashboard')      renderDtcDashboard(dtcProducts, dtcFinancials);
  if (currentView === 'dtcMarketing')      renderMarketingOps();
  if (currentView === 'dtcInventory')      renderDtcInventory();
  if (currentView === 'teamScorecard')     renderTeamScorecard();
  if (currentView === 'settings')          renderSettings(appUsers, myEmail, settingsHandlers);
  if (currentView === 'necaLeads')         renderNecaLeads(necaLeads, { onOpen: openNecaDetail, onMatch: handleNecaMatch, onAdd: openAddPotentialLead });
  if (currentView === 'summary')           renderSummary({ leads, necaLeads, products: dtcProducts, financials: dtcFinancials, invoices: dtcInvoices, dropflow, inventory: dtcInventory, can: canView, email: myEmail, isAdmin: isAdmin() });
  if (currentView === 'dtcInvoices')       renderDtcInvoices(dtcInvoices, dtcProducts, { onUpload: handleInvoiceUpload, onOpen: openInvoiceDetail, costs: productCosts(dtcInvoices), rerender: render });
}

const MOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');
async function applyMock() {
  const m = await import('./dev/mockData.js');
  leads = m.mockLeads(); projects = m.mockProjects(leads); dtcProducts = m.mockDtcProducts(); dtcFinancials = m.mockDtcFinancials(dtcProducts);
  dtcInvoices = m.mockInvoices(dtcProducts); necaLeads = m.mockNeca(leads); necaLoaded = true;
  projectStageDates = []; projectActivity = []; leadActivity = []; dtcMarketing = []; dtcVariants = []; dtcPhaseDates = []; dtcAliases = []; appUsers = [];
  dtcInventory = m.mockInventory(dtcProducts); dropflow = await m.mockDropflow(dtcProducts); kpiData = await m.mockKpis(); appUsers = [{ email: 'demo@highvoltageindustries.com', full_name: 'Demo Admin', role: 'admin', status: 'active', pages: [] }, { email: 'aira.viray@highvoltageindustries.com', full_name: 'Aira Viray', role: 'member', status: 'active', pages: [] }];
  render();
}

async function refresh() {
  if (MOCK) return applyMock();
  // Stage-tracking / DTC tables are newer, optional migrations — don't let a not-yet-migrated
  // Supabase project take down leads/projects loading if they're missing.
  const [leadsRes, projectsRes, stageDatesRes, activityRes, leadActivityRes, dtcProductsRes, dtcFinancialsRes, dtcMarketingRes, dtcVariantsRes, dtcPhaseDatesRes, appUsersRes, invoicesRes, aliasesRes, inventoryRes, eventsRes, dropflowRes, kpiRes] = await Promise.all([
    fetchLeads(), fetchProjects(),
    fetchStageDates().catch(() => []),
    fetchActivity().catch(() => []),
    fetchLeadActivity().catch(() => []),
    fetchDtcProducts().catch(() => []),
    fetchDtcFinancials().catch(() => []),
    fetchDtcMarketing().catch(() => []),
    fetchDtcVariants().catch(() => []),
    fetchDtcPhaseDates().catch(() => []),
    isAdmin() ? fetchAppUsers().catch(() => []) : Promise.resolve([]),
    fetchInvoices().catch(() => []),
    fetchAliases().catch(() => []),
    fetchInventory().catch(() => []),
    fetchCalendarEvents().catch(() => []),
    fetchDropflow().then(d => ({ loaded: true, error: '', ...d })).catch(e => ({ loaded: false, error: e.message || String(e), drops: [], tasks: [], templates: [], roles: [], events: [] })),
    fetchKpiData().catch(() => ({ kpis: [], values: [], rocks: [], rockKpis: [] })),
  ]);
  leads = leadsRes; projects = projectsRes;
  projectStageDates = stageDatesRes; projectActivity = activityRes;
  leadActivity = leadActivityRes;
  dtcProducts = dtcProductsRes; dtcFinancials = dtcFinancialsRes; dtcMarketing = dtcMarketingRes;
  dtcVariants = dtcVariantsRes; dtcPhaseDates = dtcPhaseDatesRes;
  appUsers = appUsersRes;
  dtcInvoices = invoicesRes; dtcAliases = aliasesRes; dtcInventory = inventoryRes; calendarEvents = eventsRes; dropflow = dropflowRes; kpiData = kpiRes;
  render();
}

// T-minus planner → DTC pipeline: creates the product at the first stage that is not done, with the planned phase dates.
async function handleAddToPipeline({ product, phases }) {
  const id = await saveDtcProduct(product, null);
  if (phases.length) await saveDtcPhaseDates(id, phases);
  await refresh();
}

// ---------- navigation ----------
function setView(view) {
  if (!canView(view)) return;
  currentView = view;
  if ((view === 'necaLeads' || view === 'summary') && canView('necaLeads') && !necaLoaded) loadNecaLeads();
  const titles = {
    pipeline: 'Pipeline', list: 'All Leads', disc: 'DISC Guide', followups: 'Follow-ups',
    projects: 'B2B Projects', leadDashboard: 'Dashboard Lead Management',
    projectsDashboard: 'Dashboard B2B Projects',
    dtcProducts: 'DTC Products', dtcCalendar: 'DTC Calendar', dtcFinancials: 'DTC Financials',
    dtcDashboard: 'DTC Dashboard', dtcMarketing: 'Marketing Operations', dtcInventory: 'Inventory', dtcInvoices: 'DTC Invoices', summary: 'Action Summary', teamScorecard: 'Scorecard & Rocks',
    settings: 'User Management', necaLeads: 'Potential Leads',
  };
  document.getElementById('viewTitle').textContent = titles[view] || view;
  ALL_VIEWS.forEach(v => {
    document.getElementById(`${v}View`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const nonLeadViews = ['projects', 'leadDashboard', 'projectsDashboard', 'dtcProducts', 'dtcCalendar', 'dtcFinancials', 'dtcDashboard', 'dtcMarketing', 'dtcInventory', 'settings', 'necaLeads', 'dtcInvoices', 'summary', 'teamScorecard'];
  const searchWrap = document.querySelector('.search-bar');
  if (searchWrap) searchWrap.style.display = ['pipeline', 'list'].includes(view) ? '' : 'none';
  // Show/hide Add Lead button — not relevant outside the leads views
  const addBtn = document.getElementById('addLeadBtn');
  if (addBtn) addBtn.style.display = nonLeadViews.includes(view) ? 'none' : '';
  // Show Add Project button only on projects view
  const addProjBtn = document.getElementById('addProjectBtn');
  if (addProjBtn) addProjBtn.style.display = view === 'projects' ? '' : 'none';
  // Show Add DTC Product button only on dtcProducts view
  const addDtcProdBtn = document.getElementById('addDtcProductBtn');
  if (addDtcProdBtn) addDtcProdBtn.style.display = view === 'dtcProducts' ? '' : 'none';
  // Show Add DTC Transaction button only on dtcFinancials view
  const addDtcFinBtn = document.getElementById('addDtcFinancialBtn');
  if (addDtcFinBtn) addDtcFinBtn.style.display = view === 'dtcFinancials' ? '' : 'none';
  render();
}

// ---------- lead actions ----------
function openDetail(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  renderDetail(lead, activityForLead(leadActivity, id), {
    onEdit:        openEdit,
    onDelete:      handleDelete,
    onStageChange: handleStageChange,
    onAddComment:  handleAddLeadComment,
    onDuplicate:   handleDuplicateLead,
    onDraft:       openLeadDraft,
  });
}

function openAdd() {
  editingId = null;
  renderForm({}, null, { onSave: handleSave });
}

function openEdit(id) {
  editingId = id;
  const lead = leads.find(l => l.id === id) || {};
  renderForm(lead, id, { onSave: handleSave });
}

async function handleSave(formData) {
  try { await saveLead(formData, editingId); closeModal(); await refresh(); }
  catch (err) { alert('Could not save lead: ' + err.message); }
}

async function handleDelete(id) {
  if (!confirm('Delete this lead?')) return;
  try { await deleteLead(id); closeModal(); await refresh(); }
  catch (err) { alert('Could not delete lead: ' + err.message); }
}

async function handleStageChange(id, stage) {
  try {
    await updateStage(id, stage);
    await logLeadStageChange(id, stage);
    await refresh();
    openDetail(id);
  }
  catch (err) { alert('Could not update stage: ' + err.message); }
}

async function handleAddLeadComment(id, { comment, touch_number }) {
  try { await addLeadActivity(id, { comment, touch_number }); await refresh(); openDetail(id); }
  catch (err) { alert('Could not add comment: ' + err.message); }
}

async function handleDuplicateLead(id) {
  const src = leads.find(l => l.id === id);
  if (!src) return;
  try {
    const newId = await saveLead({
      company: src.company, contact: src.contact, title: src.title,
      phone: src.phone, email: src.email, segment: src.segment, disc: src.disc,
      stage: 'Prospect',
      est: '', units: '', proposalDate: '', followupDate: '', followupNote: '',
      notes: '', collected: '', cadenceTotal: '',
    }, null);
    const label = src.stage + (src.est ? ` ($${Number(src.est).toLocaleString()})` : '') + (src.lastActivity ? ` on ${src.lastActivity}` : '');
    await addLeadActivity(newId, { comment: `New opportunity — linked to previous ${label} lead "${src.company}".` });
    await addLeadActivity(id, { comment: 'Repeat business — new opportunity opened for this contact.' });
    await refresh();
    openDetail(newId);
  } catch (err) { alert('Could not create new opportunity: ' + err.message); }
}

// ---------- project actions ----------
function openProjectDetail(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return;
  renderProjectDetail(
    project, leads,
    stageDatesForProject(projectStageDates, id),
    activityForProject(projectActivity, id),
    {
      onEdit:         openProjectEdit,
      onDelete:       handleProjectDelete,
      onStageChange:  handleProjectStageChange,
      onSaveTimeline: handleSaveTimeline,
      onAddComment:   handleAddComment,
    },
  );
}

function openProjectFromLead(leadId) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  editingProjectId = null;
  renderProjectForm({
    company: lead.company, contact: lead.contact, lead_id: lead.id, est_value: lead.est,
  }, null, leads, { onSave: handleProjectSave });
}

function openProjectAdd() {
  editingProjectId = null;
  renderProjectForm({}, null, leads, { onSave: handleProjectSave });
}

function openProjectEdit(id) {
  editingProjectId = id;
  const project = projects.find(p => p.id === id) || {};
  renderProjectForm(project, id, leads, { onSave: handleProjectSave });
}

async function handleProjectSave(formData) {
  try { await saveProject(formData, editingProjectId); closeModal(); await refresh(); }
  catch (err) { alert('Could not save project: ' + err.message); }
}

async function handleProjectDelete(id) {
  if (!confirm('Delete this project?')) return;
  try { await deleteProject(id); closeModal(); await refresh(); }
  catch (err) { alert('Could not delete project: ' + err.message); }
}

async function handleProjectStageChange(id, stage) {
  try {
    await updateProjectStage(id, stage);
    await logStageChange(id, stage);
    await refresh();
    openProjectDetail(id);
  }
  catch (err) { alert('Could not update project stage: ' + err.message); }
}

async function handleSaveTimeline(id, rows) {
  try { await saveStageDates(id, rows); await refresh(); openProjectDetail(id); }
  catch (err) { alert('Could not save stage timeline: ' + err.message); }
}

async function handleAddComment(id, { stage, comment }) {
  try { await addActivity(id, { stage, comment }); await refresh(); openProjectDetail(id); }
  catch (err) { alert('Could not add comment: ' + err.message); }
}

// ---------- DTC product actions ----------
function openDtcProductDetail(id) {
  const p = dtcProducts.find(x => x.id === id);
  if (!p) return;
  if (!MOCK && p.phase === 'shipping' && needsRefresh(p)) {
    refreshTracking(p).then(refresh).then(() => {
      const box = document.getElementById('modalBox'); const busy = box.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      if (!busy && !document.getElementById('modalOverlay').classList.contains('hidden') && box.querySelector('#dtcCloseBtn')) openDtcProductDetail(id);
    }).catch(() => {});
  }
  renderDtcProductDetail(
    p,
    phaseDatesForDtcProduct(dtcPhaseDates, id),
    variantsForProduct(dtcVariants, id),
    {
      cost:                productCosts(dtcInvoices).get(id) || null,
      onEdit:              openDtcProductEdit,
      onDelete:            handleDtcProductDelete,
      onDuplicate:         handleDuplicateDtcProduct,
      onPhaseChange:       handleDtcPhaseChange,
      onStartPremarketing: handleStartPremarketing,
      onSaveTimeline:      handleSaveDtcPhaseTimeline,
      onSaveVariants:      handleSaveDtcVariants,
      onSaveShipping:      handleSaveDtcShipping,
      onRefreshTracking:   handleRefreshTracking,
      onImportEmail:       handleImportEmail,
      onOpenMarketing:     handleOpenMarketing,
      onSaveLinks:         async (id, links) => { try { await saveRelevantLinks(id, links); await refresh(); openDtcProductDetail(id); } catch (e) { alert('Could not save the links (has migration_round4.sql been run?): ' + e.message); } },
      onSaveProduction:    async (id, f) => { try { await saveProductionTimes(id, f); await refresh(); openDtcProductDetail(id); } catch (e) { alert('Could not save: ' + e.message); } },
      drop:                dropForProduct(dropflow.drops, id),
      inventoryRows:       dtcInventory.filter(r => r.dtc_product_id === id),
    },
  );
}

function openDtcProductAdd() {
  editingDtcProductId = null;
  renderDtcProductForm({}, null, { onSave: handleDtcProductSave });
}

function openDtcProductEdit(id) {
  editingDtcProductId = id;
  renderDtcProductForm(dtcProducts.find(p => p.id === id) || {}, id, { onSave: handleDtcProductSave });
}

async function handleDtcProductSave(d) {
  try {
    const wasNew = !editingDtcProductId;
    // The form only holds some fields; merge with the stored product so edits do not blank the rest (shipping, pre-marketing start).
    const existing = editingDtcProductId ? dtcProducts.find(x => x.id === editingDtcProductId) : null;
    const id = await saveDtcProduct(existing ? { ...existing, ...d } : d, editingDtcProductId);
    if (wasNew && d.fulfillment !== 'dropship') {
      // Seed the financials tab automatically so it doesn't require a separate manual step.
      await saveDtcFinancial({ dtc_product_id: id, product_name: d.name, manufacturer: d.manufacturer }, null);
    }
    closeModal();
    await refresh();
  }
  catch (err) { alert('Could not save product: ' + err.message); }
}

async function handleDtcProductDelete(id) {
  if (!confirm('Delete this DTC product?')) return;
  try { await deleteDtcProduct(id); closeModal(); await refresh(); }
  catch (err) { alert('Could not delete product: ' + err.message); }
}

async function handleDtcPhaseChange(id, phase) {
  try { await updateDtcPhase(id, phase); await refresh(); openDtcProductDetail(id); }
  catch (err) { alert('Could not update phase: ' + err.message); }
}

async function handleSaveDtcShipping(id, fields, phase) {
  try { await saveDtcShipping(id, fields, phase); await refresh(); openDtcProductDetail(id); }
  catch (err) { alert('Could not save shipping details: ' + err.message); }
}

async function handleStartPremarketing(id) {
  try { await startPremarketing(id); await refresh(); handleOpenMarketing(id); }
  catch (err) { alert('Could not start pre-marketing: ' + err.message); }
}

// Marketing Ops: open the drop plan of a product, or offer to create it.
function handleOpenMarketing(productId) {
  if (!canView('dtcMarketing')) return alert('You do not have access to Marketing Ops.');
  closeModal(); setView('dtcMarketing');
  const d = dropForProduct(dropflow.drops, productId);
  if (d) openDropModal(d.id); else openCreateDropFor(productId);
}

// Calendar: move a drop date (and the marketing plan that follows it).
function previewDropMove(p) {
  const d = dropForProduct(dropflow.drops, p.id); if (!d) return null;
  const open = dropflow.tasks.filter(t => t.drop_id === d.id && t.status !== 'complete' && t.status !== 'na' && !t.due_locked);
  return { count: open.length };
}
async function handleMoveDrop(productId, newDate, { resetPhaseDates = false } = {}) {
  const p = dtcProducts.find(x => x.id === productId); if (!p) return;
  const d = dropForProduct(dropflow.drops, productId);
  await updateDtcDropDate(productId, newDate);
  if (resetPhaseDates) await clearDtcPhaseDates(productId);
  if (d && d.launch_date !== newDate) await moveLaunchDate(d, dropflow.tasks.filter(t => t.drop_id === d.id), newDate, dropflow.templates, p.name);
  await refresh();
}

async function handleRefreshTracking(p) {
  await refreshTracking(p); await refresh(); openDtcProductDetail(p.id);
}
async function refreshAllTracking() {
  const list = dtcProducts.filter(p => p.phase === 'shipping' && needsRefresh(p, 0));
  let ok = 0, failed = '';
  for (const p of list) { try { await refreshTracking(p); ok++; } catch (e) { failed = e.message; break; } }
  await refresh();
  if (failed) alert(failed); else if (!list.length) alert('No shipments with a tracking number to update.'); 
}

function handleImportEmail(p) {
  openEmailDatesModal(p, phaseDatesForDtcProduct(dtcPhaseDates, p.id), {
    onApply: async plan => {
      const base = dtcProducts.find(x => x.id === p.id) || p;
      if (Object.keys(plan.fields).length || plan.phaseTo) await saveDtcProduct({ ...base, ...plan.fields, ...(plan.phaseTo ? { phase: plan.phaseTo, phase_changed_at: new Date().toISOString().slice(0, 10) } : {}) }, p.id);
      if (plan.phaseRows.length) await saveDtcPhaseDates(p.id, plan.phaseRows);
      if (plan.inventoryRows?.length) await upsertOrdered(p.id, plan.inventoryRows);
      await refresh(); openDtcProductDetail(p.id);
    },
  });
}

async function handleDuplicateDtcProduct(id) {
  const src = dtcProducts.find(p => p.id === id);
  if (!src) return;
  try {
    const newName = `${src.name} (Reorder)`;
    const newId = await saveDtcProduct({
      name: newName, product_type: src.product_type, category: src.category,
      manufacturer: src.manufacturer, phase: 'idea', est_cost: src.est_cost, units: src.units,
      figma_link: src.figma_link, tech_pack_link: src.tech_pack_link,
    }, null);
    await copyDtcVariants(id, newId);
    // Seed financials the same way a normal new product does.
    await saveDtcFinancial({ dtc_product_id: newId, product_name: newName, manufacturer: src.manufacturer }, null);
    await refresh();
    openDtcProductDetail(newId);
  } catch (err) { alert('Could not duplicate product: ' + err.message); }
}

async function handleSaveDtcPhaseTimeline(id, rows) {
  try { await saveDtcPhaseDates(id, rows); await refresh(); openDtcProductDetail(id); }
  catch (err) { alert('Could not save phase timeline: ' + err.message); }
}

async function handleSaveDtcVariants(id, rows) {
  try { await saveDtcVariants(id, rows); await refresh(); openDtcProductDetail(id); }
  catch (err) { alert('Could not save sizes & SKUs: ' + err.message); }
}

// ---------- DTC financial actions ----------
function openDtcFinancialAdd() {
  editingDtcFinancialId = null;
  renderDtcFinancialForm({}, null, dtcProducts, { onSave: handleDtcFinancialSave });
}

function openDtcFinancialEdit(id) {
  editingDtcFinancialId = id;
  renderDtcFinancialForm(dtcFinancials.find(f => f.id === id) || {}, id, dtcProducts, { onSave: handleDtcFinancialSave });
}

async function handleDtcFinancialSave(d) {
  try { await saveDtcFinancial(d, editingDtcFinancialId); closeModal(); await refresh(); }
  catch (err) { alert('Could not save transaction: ' + err.message); }
}

async function handleDtcFinancialDelete(id) {
  if (!confirm('Delete this transaction?')) return;
  try { await deleteDtcFinancial(id); await refresh(); }
  catch (err) { alert('Could not delete transaction: ' + err.message); }
}

// ---------- realtime ----------
function subscribeRealtime() {
  if (MOCK) return;
  if (!realtimeLeads)      realtimeLeads      = subscribeToLeads(supabase, refresh);
  if (!realtimeProjects)   realtimeProjects   = subscribeToProjects(refresh);
  if (!realtimeStageDates) realtimeStageDates = subscribeToStageDates(refresh);
  if (!realtimeActivity)   realtimeActivity   = subscribeToActivity(refresh);
  if (!realtimeLeadActivity) realtimeLeadActivity = subscribeToLeadActivity(refresh);
  if (!realtimeDtc)        realtimeDtc        = subscribeToDtc(supabase, refresh);
  if (!realtimeDtcPhaseDates) realtimeDtcPhaseDates = subscribeToDtcPhaseDates(refresh);
  if (!realtimeDropflow)   realtimeDropflow   = subscribeToDropflow(refresh);
}

function unsubscribeRealtime() {
  if (realtimeLeads)      { supabase.removeChannel(realtimeLeads);      realtimeLeads      = null; }
  if (realtimeProjects)   { supabase.removeChannel(realtimeProjects);   realtimeProjects   = null; }
  if (realtimeStageDates) { supabase.removeChannel(realtimeStageDates); realtimeStageDates = null; }
  if (realtimeActivity)   { supabase.removeChannel(realtimeActivity);   realtimeActivity   = null; }
  if (realtimeLeadActivity) { supabase.removeChannel(realtimeLeadActivity); realtimeLeadActivity = null; }
  if (realtimeDtc)        { supabase.removeChannel(realtimeDtc);        realtimeDtc        = null; }
  if (realtimeDtcPhaseDates) { supabase.removeChannel(realtimeDtcPhaseDates); realtimeDtcPhaseDates = null; }
  if (realtimeDropflow)   { supabase.removeChannel(realtimeDropflow);   realtimeDropflow   = null; }
}

// ---------- NECA potential leads (separate table, loaded on demand) ----------
async function loadNecaLeads() {
  if (MOCK) { if (currentView === 'necaLeads') render(); return; }
  try { necaLeads = await fetchNecaLeads(); necaLoaded = true; }
  catch (err) { necaLeads = []; alert('Could not load NECA leads (has migration_neca_leads.sql been run?): ' + err.message); }
  if (currentView === 'necaLeads') render();
}

function openNecaDetail(id) {
  const l = necaLeads.find(x => x.id === id);
  if (!l) return;
  const after = async () => { await refresh(); await loadNecaLeads(); };
  renderNecaLeadDetail(l, {
    linkedLead: l.linked_lead_id ? leads.find(x => x.id === l.linked_lead_id) : null,
    suggestedLead: l.suggested_lead_id ? leads.find(x => x.id === l.suggested_lead_id) : null,
    onSave: async (leadId, data) => {
      try { await updateNecaLead(leadId, data); closeModal(); await loadNecaLeads(); }
      catch (err) { alert('Could not save: ' + err.message); }
    },
    onDelete: async leadId => {
      if (!confirm('Delete this NECA lead?')) return;
      try { await deleteNecaLead(leadId); closeModal(); await loadNecaLeads(); }
      catch (err) { alert('Could not delete: ' + err.message); }
    },
    onAddToPipeline: handleAddNecaToPipeline,
    onDraft: openNecaDraft,
    onOpenLead: leadId => { closeModal(); setView('pipeline'); openDetail(leadId); },
    onLink: async n => {
      try { await linkNecaToLead(n.id, n.suggested_lead_id); await after(); openNecaDetail(n.id); }
      catch (err) { alert('Could not link: ' + err.message); }
    },
    onDismiss: async n => {
      try { await dismissNecaSuggestion(n.id); await loadNecaLeads(); openNecaDetail(n.id); }
      catch (err) { alert('Could not dismiss: ' + err.message); }
    },
    onUnlink: async n => {
      if (!confirm('Unlink this company from the pipeline lead? Both records are kept.')) return;
      try { await unlinkNecaFromLead(n.id, n.linked_lead_id); await after(); openNecaDetail(n.id); }
      catch (err) { alert('Could not unlink: ' + err.message); }
    },
  });
}

// Copies a NECA company into the pipeline as a new lead. The NECA record is never moved or removed.
async function handleAddNecaToPipeline(n) {
  if (!confirm(`Copy "${n.company}" to the sales pipeline as a new lead?\nIt will also stay on the NECA list.`)) return;
  const c = (n.contacts || []).find(x => x.name) || {};
  const notes = [
    `From NECA Potential Leads — ${n.tier ? 'Tier ' + n.tier + ', ' : ''}${n.score != null ? n.score + '/100' : 'not scored'}.`,
    n.score_rationale && 'Why pursue: ' + n.score_rationale,
    n.buying_signals && 'Buying signals: ' + n.buying_signals,
    n.suggested_angle && 'Suggested angle: ' + n.suggested_angle,
    n.top_executive_name && `Executive: ${n.top_executive_name}${n.top_executive_title ? ' (' + n.top_executive_title + ')' : ''}`,
    n.website && 'Website: ' + n.website,
  ].filter(Boolean).join('\n');
  try {
    const newId = await saveLead({
      company: n.company, contact: c.name || '', title: c.title || '', phone: c.phone || '', email: c.email || '',
      segment: 'High voltage contractor', source: n.source || 'NECA', disc: '', stage: 'Prospect',
      est: '', units: '', proposalDate: '', followupDate: '', followupNote: '', notes, collected: '', cadenceTotal: '',
    }, null);
    await linkNecaToLead(n.id, newId);
    await addLeadActivity(newId, { comment: 'Added to the pipeline from NECA Potential Leads.' });
    await refresh();
    await loadNecaLeads();
    openNecaDetail(n.id);
  } catch (err) { alert('Could not add to pipeline: ' + err.message); }
}

// ---------- outreach drafts: text only, copied by hand — no email integration ----------
function senderName() {
  const a = getMyAccess();
  const n = (a?.full_name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}
const firstSentence = t => String(t || '').split(/(?<=[.!?])\s/)[0].slice(0, 160);

function openNecaDraft(l) {
  const people = [
    ...(l.top_executive_name ? [{ name: l.top_executive_name, title: l.top_executive_title }] : []),
    ...(l.contacts || []).map(c => ({ name: c.name, title: c.title })),
  ];
  renderDraftModal({
    company: l.company, contacts: people, angle: l.suggested_angle, signal: firstSentence(l.buying_signals),
    executiveName: l.top_executive_name, sender: senderName(),
    onMarkContacted: async () => { await markNecaContacted(l.id); await loadNecaLeads(); },
  });
}

function openLeadDraft(lead) {
  renderDraftModal({
    company: lead.company, contacts: [{ name: lead.contact, title: lead.title }], angle: '', signal: '', executiveName: '', sender: senderName(),
  });
}

function openAddPotentialLead() {
  renderAddPotentialLead({
    onSave: async (data, showError) => {
      try { const id = await createPotentialLead(data); closeModal(); await loadNecaLeads(); openNecaDetail(id); }
      catch (err) { showError('Could not add: ' + err.message); }
    },
  });
}

async function handleNecaMatch() {
  try {
    const r = await runNecaCrosslink();
    await refresh();
    await loadNecaLeads();
    alert(`Matching done.\n${r.auto_linked} new exact match(es) linked automatically.\n${r.suggestions} possible match(es) to review (open a company marked "Possible match").`);
  } catch (err) { alert('Could not match (has migration_neca_v2.sql been run?): ' + err.message); }
}

async function openNecaFromLead(necaId) {
  closeModal();
  if (!necaLoaded) await loadNecaLeads();
  setView('necaLeads');
  openNecaDetail(necaId);
}

// ---------- SKU sheet import (sizes and quantities per product) ----------
function openSkuImport() {
  renderSkuImport({
    products: [...dtcProducts],
    onSave: async items => {
      let created = 0, added = 0, updated = 0;
      for (const it of items) {
        let id = it.productId;
        if (!id) {
          id = await saveDtcProduct({ name: it.productName, product_type: it.type, category: 'restock', phase: 'warehouse', manufacturer: 'print-theory',
            units_ordered: it.variants.reduce((a, v) => a + (v.units_ordered || 0), 0) }, null);
          await saveDtcFinancial({ dtc_product_id: id, product_name: it.productName, manufacturer: 'print-theory' }, null);
          created++;
        }
        const r = await upsertVariantsBySku(id, it.variants);
        added += r.added; updated += r.updated;
      }
      await refresh();
      return `Done: ${items.length} products (${created} created), ${added} sizes added, ${updated} updated.`;
    },
  });
}

// ---------- DTC invoices (upload → extract → review → save) ----------
async function handleInvoiceUpload(files) {
  const items = [], failed = [];
  const aiExtract = makeAiExtractor(supabase);
  for (const file of files) {
    try { items.push({ file, ...(await readInvoiceFile(file, { aiExtract })) }); }
    catch (err) { failed.push(`${file.name}: ${err.message}`); }
  }
  if (failed.length) alert('Some files could not be read:\n\n' + failed.join('\n'));
  if (!items.length) return;
  renderInvoiceReview(items, {
    products: [...dtcProducts], aliases: dtcAliases, invoices: dtcInvoices, financials: dtcFinancials,
    onCreateProduct: async (name, manufacturer) => {
      try {
        const id = await saveDtcProduct({ name, manufacturer, phase: 'production', category: 'new-design' }, null);
        await saveDtcFinancial({ dtc_product_id: id, product_name: name, manufacturer }, null);
        return { id, name, order_ref: '' };
      } catch (err) { alert('Could not create product: ' + err.message); return null; }
    },
    onSave: async ({ plan, parsed, file, hash, method, applyFin, depositPaidDates }) => {
      await saveInvoicePlan({ plan, parsed, file, hash, method, createdBy: myEmail, products: dtcProducts, depositPaidDates, applyFin });
      await refresh();
    },
    onDone: () => refresh(),
  });
}

function openInvoiceDetail(id) {
  const inv = dtcInvoices.find(i => i.id === id);
  if (!inv) return;
  renderInvoiceDetail(inv, dtcProducts, {
    onDelete: async i => {
      if (!confirm(`Delete ${i.doc_type} ${i.invoice_number}? Its lines and stored file are removed.`)) return;
      try { await deleteInvoice(i); closeModal(); await refresh(); } catch (err) { alert('Could not delete: ' + err.message); }
    },
    onOpenFile: async i => {
      try { window.open(await invoiceFileUrl(i.file_path), '_blank', 'noopener'); } catch (err) { alert('Could not open the file: ' + err.message); }
    },
    onSaveSource: async (i, url) => {
      try { await saveInvoiceSourceUrl(i.id, url); await refresh(); openInvoiceDetail(i.id); } catch (err) { alert('Could not save the link: ' + err.message); }
    },
    onAttach: async (i, file) => {
      try { await attachOriginalFile(i, file, await sha256(await file.arrayBuffer())); await refresh(); openInvoiceDetail(i.id); }
      catch (err) { alert('Could not attach the file: ' + err.message); }
    },
  });
}

// ---------- user management (admin) ----------
const settingsHandlers = {
  onInvite: () => renderUserForm(null, {
    onSave: async (data, showError) => {
      try {
        await inviteUser(data, myEmail);
        await refresh();
        const created = appUsers.find(u => u.email === data.email);
        if (created) renderInviteLink(created); else closeModal();
      } catch (err) {
        showError(/duplicate|unique/i.test(err.message) ? 'That email already has an account or pending invite.' : err.message);
      }
    },
  }),
  onEdit: id => {
    const u = appUsers.find(x => x.id === id);
    if (!u) return;
    renderUserForm(u, {
      onSave: async (data, showError) => {
        try { await updateAppUser(id, data); closeModal(); await refresh(); }
        catch (err) { showError(err.message); }
      },
    });
  },
  onToggle: async id => {
    const u = appUsers.find(x => x.id === id);
    if (!u) return;
    const next = u.status === 'disabled' ? (u.accepted_at ? 'active' : 'invited') : 'disabled';
    if (next === 'disabled' && !confirm(`Disable access for ${u.email}?`)) return;
    try { await setAppUserStatus(id, next); await refresh(); }
    catch (err) { alert('Could not update user: ' + err.message); }
  },
  onDelete: async id => {
    const u = appUsers.find(x => x.id === id);
    if (!u || !confirm(`Remove ${u.email}? They will lose access immediately.`)) return;
    try { await deleteAppUser(id); await refresh(); }
    catch (err) { alert('Could not remove user: ' + err.message); }
  },
  onShowLink: id => {
    const u = appUsers.find(x => x.id === id);
    if (u) renderInviteLink(u);
  },
};

function applyNavAccess() {
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.style.display = canView(el.dataset.view) ? '' : 'none';
  });
  // Hide section labels whose items are all hidden
  document.querySelectorAll('#sidebarNav .nav-section-label').forEach(label => {
    let n = label.nextElementSibling, any = false;
    while (n && !n.classList.contains('nav-section-label')) {
      if (n.classList.contains('nav-item') && n.style.display !== 'none') any = true;
      n = n.nextElementSibling;
    }
    label.style.display = any ? '' : 'none';
  });
  const searchBar = document.querySelector('.search-bar');
  if (searchBar) searchBar.style.visibility = canView('pipeline') || canView('list') ? '' : 'hidden';
}

// ---------- auth ----------
function showApp(user, access) {
  setMyAccess(access);
  myEmail = (user.email || '').toLowerCase();
  setMyEmailAddr(myEmail);
  document.getElementById('loginShell').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('topUserEmail').textContent = user.email;
  const nameSource = (access?.full_name || user.email.split('@')[0]).replace(/[._]/g, ' ');
  document.getElementById('userAvatar').textContent = nameSource.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '·';
  document.getElementById('userRole').textContent = access?.role === 'admin' ? 'Administrator' : 'Team member';
  const isTestEnv = (import.meta.env.VITE_SUPABASE_URL || '').includes('ymzeklhdzpmaakvlxrkx');
  const banner = document.getElementById('testEnvBanner');
  if (banner) banner.classList.toggle('hidden', !isTestEnv);
  applyNavAccess();
  const startView = canView(currentView) ? currentView : firstAllowedView();
  subscribeRealtime();
  refresh();
  if (startView) setView(startView);
}

function showLogin(message = '') {
  unsubscribeRealtime();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginShell').classList.remove('hidden');
  document.getElementById('loginError').textContent = message;
}

// ---------- event wiring ----------
function wireEvents() {
  document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    const error = await signInWithGoogle();
    if (error) document.getElementById('loginError').textContent = error.message;
  });
  document.getElementById('logoutBtn').addEventListener('click', signOut);

  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.addEventListener('click', () => { if (el.dataset.view) setView(el.dataset.view); });
  });

  document.getElementById('addLeadBtn').addEventListener('click', openAdd);
  document.getElementById('addProjectBtn').addEventListener('click', openProjectAdd);
  document.getElementById('addDtcProductBtn').addEventListener('click', openDtcProductAdd);
  document.getElementById('addDtcFinancialBtn').addEventListener('click', openDtcFinancialAdd);
  document.getElementById('searchInput').addEventListener('input', render);

  { // wide modals (invoice review) must not leak their width into the next modal
    const ov = document.getElementById('modalOverlay');
    new MutationObserver(() => { if (ov.classList.contains('hidden')) document.getElementById('modalBox').removeAttribute('data-wide'); })
      .observe(ov, { attributes: true, attributeFilter: ['class'] });
  }
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Delegated clicks for lead cards, project cards, backlog "Start project", and DTC records
  document.addEventListener('click', e => {
    if (e.target.closest('#importSkuBtn')) { openSkuImport(); return; }
    const goEl = e.target.closest('[data-go-view]');
    if (goEl) { setView(goEl.dataset.goView); return; }
    const necaEl = e.target.closest('[data-open-neca-lead]');
    if (necaEl) { openNecaFromLead(necaEl.dataset.openNecaLead); return; }
    const startEl = e.target.closest('[data-start-project]');
    if (startEl) { openProjectFromLead(startEl.dataset.startProject); return; }
    const leadEl = e.target.closest('[data-open-lead]');
    if (leadEl) { openDetail(leadEl.dataset.openLead); return; }
    const projEl = e.target.closest('[data-open-project]');
    if (projEl) { openProjectDetail(projEl.dataset.openProject); return; }
    const dtcEl = e.target.closest('[data-open-dtc]');
    if (dtcEl) { openDtcProductDetail(dtcEl.dataset.openDtc); return; }
    const efEl = e.target.closest('[data-edit-fin]');
    if (efEl) { openDtcFinancialEdit(efEl.dataset.editFin); return; }
    const dfEl = e.target.closest('[data-del-fin]');
    if (dfEl) { handleDtcFinancialDelete(dfEl.dataset.delFin); return; }
    const afEl = e.target.closest('#addFinancialBtn');
    if (afEl) openDtcFinancialAdd();
  });
}

// ---------- bootstrap ----------
async function bootstrap() {
  initTheme();
  initDropflow({
    get: () => ({ ...dropflow, products: dtcProducts, inventory: dtcInventory, users: appUsers }),
    refresh, canEditSettings: () => isAdmin(), email: () => myEmail, syncProductDate: (productId, date) => updateDtcDropDate(productId, date), openProduct: id => { closeModal(); setView('dtcProducts'); openDtcProductDetail(id); },
  });
  initTeam({ get: () => kpiData, isAdmin, refresh, users: () => appUsers, email: () => myEmail });
  initInventory({ get: () => ({ products: dtcProducts, inventory: dtcInventory, variants: dtcVariants, costs: productCosts(dtcInvoices) }), refresh });
  wireEvents();
  initResponsive();
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  window.addEventListener('themechange', () => render());
  if (MOCK) { showApp({ email: 'demo@highvoltageindustries.com' }, { email: 'demo@highvoltageindustries.com', full_name: 'Demo Admin', role: 'admin', status: 'active', pages: [] }); return; }
  const inviteToken = captureInviteTokenFromUrl() || getPendingInviteToken();
  if (inviteToken) document.getElementById('loginInviteNote').classList.remove('hidden');
  onAuthChange(showApp, showLogin);

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const result = await authorizeSignedInUser();
    if (result.error) { await signOut(); showLogin(result.error); }
    else showApp(result.user, result.access);
  } else {
    showLogin();
  }
}

bootstrap();
