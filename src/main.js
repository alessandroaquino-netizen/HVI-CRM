import { supabase } from './supabase.js';
import { signInWithGoogle, signOut, isAllowedUser, onAuthChange } from './auth.js';
import { fetchLeads, saveLead, updateStage, deleteLead, subscribeToLeads } from './controllers/leads.js';
import { renderKPIs } from './views/kpi.js';
import { renderPipeline } from './views/pipeline.js';
import { renderList } from './views/list.js';
import { renderFollowups, updateFollowupBadge } from './views/followups.js';
import { renderDisc } from './views/disc.js';
import { renderDetail, renderForm, closeModal } from './views/modal.js';

// ---------- state ----------
let leads       = [];
let currentView = 'pipeline';
let editingId   = null;
let realtimeChannel = null;

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

// ---------- render ----------
function render() {
  renderKPIs(leads);
  updateFollowupBadge(leads);
  if (currentView === 'pipeline')  renderPipeline(leads, getFiltered());
  if (currentView === 'list')      renderList(getFiltered());
  if (currentView === 'disc')      renderDisc();
  if (currentView === 'followups') renderFollowups(leads);
}

async function refresh() {
  leads = await fetchLeads();
  render();
}

// ---------- navigation ----------
function setView(view) {
  currentView = view;
  const titles = { pipeline: 'Pipeline', list: 'All Leads', disc: 'DISC Guide', followups: 'Follow-ups' };
  document.getElementById('viewTitle').textContent = titles[view] || view;
  ['pipeline', 'list', 'disc', 'followups'].forEach(v => {
    document.getElementById(`${v}View`).classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  render();
}

// ---------- lead actions ----------
function openDetail(id) {
  const lead = leads.find(l => l.id === id);
  if (!lead) return;
  renderDetail(lead, {
    onEdit:        openEdit,
    onDelete:      handleDelete,
    onStageChange: handleStageChange,
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
  try {
    await saveLead(formData, editingId);
    closeModal();
    await refresh();
  } catch (err) {
    alert('Could not save lead: ' + err.message);
  }
}

async function handleDelete(id) {
  if (!confirm('Delete this lead?')) return;
  try {
    await deleteLead(id);
    closeModal();
    await refresh();
  } catch (err) {
    alert('Could not delete lead: ' + err.message);
  }
}

async function handleStageChange(id, stage) {
  try {
    await updateStage(id, stage);
    await refresh();
    openDetail(id);
  } catch (err) {
    alert('Could not update stage: ' + err.message);
  }
}

// ---------- realtime ----------
function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = subscribeToLeads(supabase, refresh);
}

function unsubscribeRealtime() {
  if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; }
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
  // Auth
  document.getElementById('googleLoginBtn').addEventListener('click', async () => {
    const error = await signInWithGoogle();
    if (error) document.getElementById('loginError').textContent = error.message;
  });
  document.getElementById('logoutBtn').addEventListener('click', signOut);

  // Navigation
  document.querySelectorAll('#sidebarNav .nav-item').forEach(el => {
    el.addEventListener('click', () => setView(el.dataset.view));
  });

  // Add lead
  document.getElementById('addLeadBtn').addEventListener('click', openAdd);

  // Search
  document.getElementById('searchInput').addEventListener('input', render);

  // Modal backdrop
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  // Lead card / row clicks (delegated — works for dynamically rendered cards)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-open-lead]');
    if (el) openDetail(el.dataset.openLead);
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
