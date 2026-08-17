import { supabase } from './supabase.js';
import { signInWithGoogle, signOut, isAllowedUser, onAuthChange } from './auth.js';
import { fetchLeads, saveLead, updateStage, deleteLead, subscribeToLeads } from './controllers/leads.js';
import { fetchProjects, saveProject, updateProjectStage, deleteProject, subscribeToProjects } from './controllers/projects.js';
import { renderKPIs } from './views/kpi.js';
import { renderPipeline } from './views/pipeline.js';
import { renderList } from './views/list.js';
import { renderFollowups, updateFollowupBadge } from './views/followups.js';
import { renderDisc } from './views/disc.js';
import { renderDetail, renderForm, closeModal } from './views/modal.js';
import { renderProjects, renderProjectDetail, renderProjectForm } from './views/projects.js';
import { renderDashboard } from './views/dashboard.js';

// ---------- state ----------
let leads       = [];
let projects    = [];
let currentView = 'pipeline';
let editingId   = null;
let editingProjectId = null;
let realtimeLeads    = null;
let realtimeProjects = null;

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

const ALL_VIEWS = ['pipeline', 'list', 'disc', 'followups', 'projects', 'dashboard'];

// ---------- render ----------
function render() {
  renderKPIs(leads);
  updateFollowupBadge(leads);
  if (currentView === 'pipeline')  renderPipeline(leads, getFiltered());
  if (currentView === 'list')      renderList(getFiltered());
  if (currentView === 'disc')      renderDisc();
  if (currentView === 'followups') renderFollowups(leads);
  if (currentView === 'projects')  renderProjects(projects);
  if (currentView === 'dashboard') renderDashboard(leads, projects);
}

async function refresh() {
  [leads, projects] = await Promise.all([fetchLeads(), fetchProjects()]);
  render();
}

// ---------- navigation ----------
function setView(view) {
  currentView = view;
  const titles = {
    pipeline: 'Pipeline', list: 'All Leads', disc: 'DISC Guide',
    followups: 'Follow-ups', projects: 'B2B Projects', dashboard: 'Executive Dashboard',
  };
  document.getElementById('viewTitle').textContent = titles[view] || view;
  ALL_VIEWS.forEach(v => {
    document.getElementById(`${v}View`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  // Show/hide Add Lead button — not relevant on projects or dashboard
  const addBtn = document.getElementById('addLeadBtn');
  if (addBtn) addBtn.style.display = ['projects', 'dashboard'].includes(view) ? 'none' : '';
  // Show Add Project button only on projects view
  const addProjBtn = document.getElementById('addProjectBtn');
  if (addProjBtn) addProjBtn.style.display = view === 'projects' ? '' : 'none';
  render();
}

// ---------- lead actions ----------
function openDetail(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  renderDetail(lead, { onEdit: openEdit, onDelete: handleDelete, onStageChange: handleStageChange });
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
  try { await updateStage(id, stage); await refresh(); openDetail(id); }
  catch (err) { alert('Could not update stage: ' + err.message); }
}

// ---------- project actions ----------
function openProjectDetail(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return;
  renderProjectDetail(project, leads, {
    onEdit:        openProjectEdit,
    onDelete:      handleProjectDelete,
    onStageChange: handleProjectStageChange,
  });
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
  try { await updateProjectStage(id, stage); await refresh(); openProjectDetail(id); }
  catch (err) { alert('Could not update project stage: ' + err.message); }
}

// ---------- realtime ----------
function subscribeRealtime() {
  if (!realtimeLeads)    realtimeLeads    = subscribeToLeads(supabase, refresh);
  if (!realtimeProjects) realtimeProjects = subscribeToProjects(refresh);
}

function unsubscribeRealtime() {
  if (realtimeLeads)    { supabase.removeChannel(realtimeLeads);    realtimeLeads    = null; }
  if (realtimeProjects) { supabase.removeChannel(realtimeProjects); realtimeProjects = null; }
}

// ---------- auth ----------
function showApp(user) {
  document.getElementById('loginShell').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('topUserEmail').textContent = user.email;
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
  document.getElementById('searchInput').addEventListener('input', render);

  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Delegated clicks for lead cards and project cards
  document.addEventListener('click', e => {
    const leadEl = e.target.closest('[data-open-lead]');
    if (leadEl) { openDetail(leadEl.dataset.openLead); return; }
    const projEl = e.target.closest('[data-open-project]');
    if (projEl) openProjectDetail(projEl.dataset.openProject);
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
