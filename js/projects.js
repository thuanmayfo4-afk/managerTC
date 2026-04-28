const supabaseClient = window.supabaseClient;

// ── STATE ──
let currentUser = null;
let currentProfile = null;
let projects = [];
let ctxTargetId = null;
let confirmCallback = null;
let editingProjectId = null;

// ── INIT ──
async function init() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = data.session.user;
  await loadProfile();
  await loadProjects();
  renderHeader();
  renderGrid();
}

// ── AUTH ──
async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

// ── PROFILE ──
async function loadProfile() {
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) { console.error(error); return; }
  currentProfile = data;
}

function isSuperAdmin() {
  return currentProfile?.role === 'super_admin';
}

// ── LOAD PROJECTS ──
async function loadProjects() {
  if (isSuperAdmin()) {
    // Super admin sees all projects
    const { data, error } = await supabaseClient
      .from('projects')
      .select('*')
      .order('created_at');
    if (error) { console.error(error); return; }
    projects = data || [];
  } else {
    // Regular user: only assigned projects
    const { data, error } = await supabaseClient
      .from('project_members')
      .select('role, projects(*)')
      .eq('user_id', currentUser.id);
    if (error) { console.error(error); return; }
    projects = (data || []).map(row => ({
      ...row.projects,
      memberRole: row.role   // 'admin' or 'viewer'
    }));
  }
}

// ── RENDER HEADER ──
function renderHeader() {
  const email = currentProfile?.email || currentUser.email || '';
  const initials = email.slice(0, 2).toUpperCase();
  document.getElementById('userAvatar').textContent = initials;
  document.getElementById('userEmail').textContent = email;

  const badge = document.getElementById('roleBadge');
  if (isSuperAdmin()) {
    badge.textContent = 'Super Admin';
    badge.className = 'role-badge role-super';
  } else {
    badge.textContent = 'User';
    badge.className = 'role-badge role-viewer';
  }

  // Show create button only for super admin
  if (isSuperAdmin()) {
    document.getElementById('btnCreateProject').style.display = 'flex';
  }
}

// ── RENDER GRID ──
function renderGrid() {
  const grid = document.getElementById('projectsGrid');
  const empty = document.getElementById('projectsEmpty');

  if (!projects.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = projects.map(p => renderCard(p)).join('');
}

function renderCard(p) {
  const icon = p.icon || '📁';
  const desc = p.description || 'No description';
  const date = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Member role badge (for non-super-admin)
  let memberBadge = '';
  if (!isSuperAdmin() && p.memberRole) {
    const isAdmin = p.memberRole === 'admin';
    memberBadge = `<span class="member-role-badge ${isAdmin ? 'role-admin' : 'role-viewer'}">
      ${isAdmin ? 'Admin' : 'Viewer'}
    </span>`;
  }

  // Right-click only for super admin
  const ctxAttr = isSuperAdmin()
    ? `oncontextmenu="showProjectCtx(event, '${p.id}')"` : '';

  return `
    <div class="project-card" ${ctxAttr} onclick="openProject('${p.id}')">
      <div class="project-card-top">
        <div class="project-icon">${icon}</div>
        ${memberBadge}
      </div>
      <div class="project-name">${p.name}</div>
      <div class="project-desc">${desc}</div>
      <div class="project-meta">
        <span class="project-date">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="3" width="12" height="11" rx="2"/>
            <line x1="2" y1="7" x2="14" y2="7"/>
            <line x1="5" y1="1" x2="5" y2="5"/>
            <line x1="11" y1="1" x2="11" y2="5"/>
          </svg>
          ${date}
        </span>
      </div>
    </div>`;
}

// ── NAVIGATE TO PROJECT ──
function openProject(projectId) {
  window.location.href = `index.html?project_id=${projectId}`;
}

// ── CONTEXT MENU ──
function showProjectCtx(e, id) {
  e.preventDefault();
  e.stopPropagation();
  ctxTargetId = id;

  const menu = document.getElementById('projectCtxMenu');
  menu.style.display = 'block';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  // Reposition if overflow
  setTimeout(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + 'px';
  }, 0);
}

function hideCtx() {
  document.getElementById('projectCtxMenu').style.display = 'none';
  // Delay reset so handleCtxEdit/Delete can still read ctxTargetId
  setTimeout(() => { ctxTargetId = null; }, 0);
}

function handleCtxEdit() {
  const id = ctxTargetId;
  hideCtx();
  if (id) openEditProjectModal(id);
}

function handleCtxDelete() {
  const id = ctxTargetId;
  hideCtx();
  if (id) confirmDeleteProject(id);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#projectCtxMenu')) hideCtx();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    hideCtx();
    closeModal('projectModal');
    closeModal('confirmModal');
  }
});

// ── CREATE PROJECT ──
function openCreateProjectModal() {
  editingProjectId = null;
  document.getElementById('projectModalTitle').textContent = 'New Project';
  document.getElementById('projectSaveBtn').textContent = 'Create Project';
  document.getElementById('p-name').value = '';
  document.getElementById('p-icon').value = '';
  document.getElementById('p-desc').value = '';
  openModal('projectModal');
  setTimeout(() => document.getElementById('p-name').focus(), 100);
}

// ── EDIT PROJECT ──
function openEditProjectModal(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  editingProjectId = id;
  document.getElementById('projectModalTitle').textContent = 'Edit Project';
  document.getElementById('projectSaveBtn').textContent = 'Save Changes';
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-icon').value = p.icon || '';
  document.getElementById('p-desc').value = p.description || '';
  openModal('projectModal');
  setTimeout(() => document.getElementById('p-name').focus(), 100);
}

// ── SAVE PROJECT ──
async function saveProject() {
  const name = document.getElementById('p-name').value.trim();
  const icon = document.getElementById('p-icon').value.trim() || '📁';
  const description = document.getElementById('p-desc').value.trim();

  if (!name) { alert('Project name is required'); return; }

  const btn = document.getElementById('projectSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  if (editingProjectId) {
    const { error } = await supabaseClient
      .from('projects')
      .update({ name, icon, description })
      .eq('id', editingProjectId);

    if (error) {
      console.error(error);
      toast('Error updating project', 'danger');
      btn.disabled = false;
      btn.textContent = 'Save Changes';
      return;
    }

    const p = projects.find(x => x.id === editingProjectId);
    if (p) { p.name = name; p.icon = icon; p.description = description; }
    toast('Project updated: ' + name);
  } else {
    const { data, error } = await supabaseClient
      .from('projects')
      .insert({ name, icon, description })
      .select()
      .single();

    if (error) {
      console.error(error);
      toast('Error creating project', 'danger');
      btn.disabled = false;
      btn.textContent = 'Create Project';
      return;
    }

    projects.push(data);
    toast('Project created: ' + name);
  }

  closeModal('projectModal');
  renderGrid();
  btn.disabled = false;
}

// ── DELETE PROJECT ──
function confirmDeleteProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  confirmCallback = async () => {
    const { error } = await supabaseClient
      .from('projects')
      .delete()
      .eq('id', id);
    if (error) { console.error(error); toast('Error deleting project', 'danger'); return; }
    projects = projects.filter(x => x.id !== id);
    renderGrid();
    toast('Project deleted');
  };
  document.getElementById('confirmModalTitle').textContent = 'Delete Project';
  document.getElementById('confirmModalMessage').textContent =
    `Delete project "${p.name}"? This will also delete all modules, groups and test cases inside.`;
  openModal('confirmModal');
}

function confirmAction() {
  if (typeof confirmCallback === 'function') confirmCallback();
  confirmCallback = null;
  closeModal('confirmModal');
}

// ── MODAL HELPERS ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('click', e => {
  ['projectModal', 'confirmModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && e.target === el) closeModal(id);
  });
});

document.getElementById('p-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveProject();
});

// ── TOAST ──
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot" style="${type === 'danger' ? 'background:var(--danger)' : ''}"></div>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    t.style.transition = 'all .3s';
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

// ── BOOT ──
init();