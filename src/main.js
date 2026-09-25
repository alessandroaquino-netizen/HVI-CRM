import { supabase } from './supabase.js';
import { signInWithGoogle, signOut, isAllowedUser, onAuthChange } from './auth.js';
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
  fetchDtcProducts, saveDtcProduct, updateDtcPhase, deleteDtcProduct, startPremarketing,
  fetchDtcFinancials, saveDtcFinancial, deleteDtcFinancial,
  fetchDtcMarketing, subscribeToDtc,
  fetchDtcVariants, saveDtcVariants, variantsForProduct, copyDtcVariants,
} from './controllers/dtc.js';
import {
  fetchDtcPhaseDates, saveDtcPhaseDates, phaseDatesForDtcProduct, subscribeToDtcPhaseDates,
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
import { renderDtcMarketing } from './views/dtcMarketing.js';

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
  'dtcProducts', 'dtcCalendar', 'dtcFinancials', 'dtcDashboard', 'dtcMarketing',
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
  if (currentView === 'dtcProducts')       renderDtcProducts(dtcProducts);
  if (currentView === 'dtcCalendar')       renderDtcCalendar(dtcProducts);
  if (currentView === 'dtcFinancials')     renderDtcFinancials(dtcFinancials, dtcProducts);
  if (currentView === 'dtcDashboard')      renderDtcDashboard(dtcProducts, dtcFinancials);
  if (currentView === 'dtcMarketing')      renderDtcMarketing(dtcMarketing, dtcProducts);
}

async function refresh() {
  // Stage-tracking / DTC tables are newer, optional migrations — don't let a not-yet-migrated
  // Supabase project take down leads/projects loading if they're missing.
  const [leadsRes, projectsRes, stageDatesRes, activityRes, leadActivityRes, dtcProductsRes, dtcFinancialsRes, dtcMarketingRes, dtcVariantsRes, dtcPhaseDatesRes] = await Promise.all([
    fetchLeads(), fetchProjects(),
    fetchStageDates().catch(() => []),
    fetchActivity().catch(() => []),
    fetchLeadActivity().catch(() => []),
    fetchDtcProducts().catch(() => []),
    fetchDtcFinancials().catch(() => []),
    fetchDtcMarketing().catch(() => []),
    fetchDtcVariants().catch(() => []),
    fetchDtcPhaseDates().catch(() => []),
  ]);
  leads = leadsRes; projects = projectsRes;
  projectStageDates = stageDatesRes; projectActivity = activityRes;
  leadActivity = leadActivityRes;
  dtcProducts = dtcProductsRes; dtcFinancials = dtcFinancialsRes; dtcMarketing = dtcMarketingRes;
  dtcVariants = dtcVariantsRes; dtcPhaseDates = dtcPhaseDatesRes;
  render();
}

// ---------- navigation ----------
function setView(view) {
  currentView = view;
  const titles = {
    pipeline: 'Pipeline', list: 'All Leads', disc: 'DISC Guide', followups: 'Follow-ups',
    projects: 'B2B Projects', leadDashboard: 'Dashboard Lead Management',
    projectsDashboard: 'Dashboard B2B Projects',
    dtcProducts: 'DTC Products', dtcCalendar: 'DTC Calendar', dtcFinancials: 'DTC Financials',
    dtcDashboard: 'DTC Dashboard', dtcMarketing: 'Marketing Operations',
  };
  document.getElementById('viewTitle').textContent = titles[view] || view;
  ALL_VIEWS.forEach(v => {
    document.getElementById(`${v}View`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const nonLeadViews = ['projects', 'leadDashboard', 'projectsDashboard', 'dtcProducts', 'dtcCalendar', 'dtcFinancials', 'dtcDashboard', 'dtcMarketing'];
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
  renderDtcProductDetail(
    p,
    phaseDatesForDtcProduct(dtcPhaseDates, id),
    variantsForProduct(dtcVariants, id),
    {
      onEdit:              openDtcProductEdit,
      onDelete:            handleDtcProductDelete,
      onDuplicate:         handleDuplicateDtcProduct,
      onPhaseChange:       handleDtcPhaseChange,
      onStartPremarketing: handleStartPremarketing,
      onSaveTimeline:      handleSaveDtcPhaseTimeline,
      onSaveVariants:      handleSaveDtcVariants,
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
    const id = await saveDtcProduct(d, editingDtcProductId);
    if (wasNew) {
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

async function handleStartPremarketing(id) {
  try { await startPremarketing(id); await refresh(); openDtcProductDetail(id); }
  catch (err) { alert('Could not start pre-marketing: ' + err.message); }
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
  if (!realtimeLeads)      realtimeLeads      = subscribeToLeads(supabase, refresh);
  if (!realtimeProjects)   realtimeProjects   = subscribeToProjects(refresh);
  if (!realtimeStageDates) realtimeStageDates = subscribeToStageDates(refresh);
  if (!realtimeActivity)   realtimeActivity   = subscribeToActivity(refresh);
  if (!realtimeLeadActivity) realtimeLeadActivity = subscribeToLeadActivity(refresh);
  if (!realtimeDtc)        realtimeDtc        = subscribeToDtc(supabase, refresh);
  if (!realtimeDtcPhaseDates) realtimeDtcPhaseDates = subscribeToDtcPhaseDates(refresh);
}

function unsubscribeRealtime() {
  if (realtimeLeads)      { supabase.removeChannel(realtimeLeads);      realtimeLeads      = null; }
  if (realtimeProjects)   { supabase.removeChannel(realtimeProjects);   realtimeProjects   = null; }
  if (realtimeStageDates) { supabase.removeChannel(realtimeStageDates); realtimeStageDates = null; }
  if (realtimeActivity)   { supabase.removeChannel(realtimeActivity);   realtimeActivity   = null; }
  if (realtimeLeadActivity) { supabase.removeChannel(realtimeLeadActivity); realtimeLeadActivity = null; }
  if (realtimeDtc)        { supabase.removeChannel(realtimeDtc);        realtimeDtc        = null; }
  if (realtimeDtcPhaseDates) { supabase.removeChannel(realtimeDtcPhaseDates); realtimeDtcPhaseDates = null; }
}

// ---------- auth ----------
function showApp(user) {
  document.getElementById('loginShell').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('topUserEmail').textContent = user.email;
  const isTestEnv = (import.meta.env.VITE_SUPABASE_URL || '').includes('ymzeklhdzpmaakvlxrkx');
  const banner = document.getElementById('testEnvBanner');
  if (banner) banner.classList.toggle('hidden', !isTestEnv);
  subscribeRealtime();
  refresh();
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

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Delegated clicks for lead cards, project cards, backlog "Start project", and DTC records
  document.addEventListener('click', e => {
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
  wireEvents();
  onAuthChange(showApp, showLogin);

  const { data: { session } } = await supabase.auth.getSession();
  if (session && await isAllowedUser()) {
    const { data: { user } } = await supabase.auth.getUser();
    showApp(user);
  } else {
    if (session) await signOut();
    showLogin();
  }
}

bootstrap();
