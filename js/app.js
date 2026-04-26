const supabaseClient = window.supabaseClient;

// ── AUTH ──
async function checkAuth() {
  const { data, error } = await supabaseClient.auth.getSession();
if (error || !data.session) {
  window.location.href = "/login.html";
  }
}
checkAuth();

async function logout() {
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    console.error(e);
  }
  window.location.href = "login.html";
}

// ── VARS ──
let activeId = null;
let editingTC = null;
let editingModuleId = null;
let confirmCallback = null;
let sidebarCollapsed = false;
let modules = [];

// ── DB ──
async function loadFromDB() {
  const { data: mods, error: modErr } = await supabaseClient
    .from('modules').select('*').order('created_at');
  if (modErr) { console.error(modErr); modules = []; return; }

  const { data: grps, error: grpErr } = await supabaseClient
    .from('groups').select('*').order('position');
  if (grpErr) { console.error(grpErr); modules = []; return; }

  const { data: tcs, error: tcErr } = await supabaseClient
    .from('test_cases').select('*').order('position');
  if (tcErr) { console.error(tcErr); modules = []; return; }

  modules = (mods || []).map(m => ({
    ...m,
    desc: m.description,
    groups: (grps || [])
      .filter(g => g.module_id === m.id)
      .map(g => ({
        ...g,
        cases: (tcs || [])
          .filter(tc => tc.group_id === g.id)
          .map(tc => ({
  ...tc,
  dbId: tc.id,      
  code: tc.code,
  desc: tc.description
}))
      }))
  }));
}

// ── HELPERS ──
function getModule() { return modules.find(m => m.id === activeId); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
}

// ── SIDEBAR ──
function renderSidebar() {
  const list = document.getElementById('moduleList');
  if (!modules.length) {
    list.innerHTML = '<div style="padding:12px 10px;color:var(--text3);font-size:12px;text-align:center">No modules yet</div>';
    return;
  }
  list.innerHTML = modules.map(m => {
    const total = m.groups.reduce((a, g) => a + g.cases.length, 0);
    return `<div class="module-item ${m.id === activeId ? 'active' : ''}" onclick="selectModule('${m.id}')" oncontextmenu="showModuleCtx(event,'${m.id}')">
      <div class="module-icon">${m.icon || '📁'}</div>
      <div class="module-name">${m.name}</div>
      <div class="module-count">${total}</div>
    </div>`;
  }).join('');
}

function showModuleCtx(e, id) {
  e.preventDefault();
  showCtx(e.clientX, e.clientY, [
    { label: '✏️  Edit', action: `openEditModuleModal('${id}')` },
    { sep: true },
    { label: '🗑️  Delete Module', action: `deleteModule('${id}')`, danger: true }
  ]);
}

async function deleteModule(id) {
  openConfirmModal('Delete Module', 'Delete this module and all its test cases?', async () => {
    const { error } = await supabaseClient.from('modules').delete().eq('id', id);
    if (error) { console.error(error); toast('Error deleting module', 'danger'); return; }
    modules = modules.filter(m => m.id !== id);
    if (activeId === id) { activeId = null; renderMainEmpty(); }
    renderSidebar();
    toast('Module deleted');
  });
}

function openAddModuleModal() {
  editingModuleId = null;
  document.getElementById('addModuleModalTitle').textContent = 'Add New Module';
  document.getElementById('saveModuleBtn').textContent = 'Create Module';
  document.getElementById('m-name').value = '';
  document.getElementById('m-icon').value = '';
  document.getElementById('m-desc').value = '';
  openModal('addModuleModal');
}

function openEditModuleModal(id) {
  const m = modules.find(x => x.id === id);
  if (!m) return;
  editingModuleId = id;
  document.getElementById('addModuleModalTitle').textContent = 'Edit Module';
  document.getElementById('saveModuleBtn').textContent = 'Save Changes';
  document.getElementById('m-name').value = m.name;
  document.getElementById('m-icon').value = m.icon || '';
  document.getElementById('m-desc').value = m.desc || '';
  openModal('addModuleModal');
}

async function saveModule() {
  const name = document.getElementById('m-name').value.trim();
  const desc = document.getElementById('m-desc').value.trim();
  const icon = document.getElementById('m-icon').value.trim() || '📁';
  if (!name) { alert('Module name is required'); return; }

  if (editingModuleId) {
    const { error } = await supabaseClient
      .from('modules')
      .update({ name, icon, description: desc })
      .eq('id', editingModuleId);
    if (error) { console.error(error); toast('Error updating module', 'danger'); return; }
    const m = modules.find(x => x.id === editingModuleId);
    m.name = name; m.icon = icon; m.desc = desc;
    closeModal('addModuleModal');
    renderSidebar();
    selectModule(m.id);
    toast('Module updated: ' + name);
  } else {
    const { data, error } = await supabaseClient
      .from('modules')
      .insert({ name, icon, description: desc })
      .select().single();
    if (error) { console.error(error); toast('Error creating module', 'danger'); return; }
    const m = { ...data, desc: data.description, groups: [] };
    modules.push(m);
    closeModal('addModuleModal');
    renderSidebar();
    selectModule(m.id);
    toast('Module created: ' + name);
  }
}

function selectModule(id) {
  activeId = id;
  renderSidebar();
  renderTopbar();
  renderToolbar();
  renderContent();
}

// ── TOPBAR ──
function renderTopbar() {
  const m = getModule();
  const topbar = document.getElementById('topbarContent');
  if (!m) { topbar.innerHTML = '<span style="color:var(--text3);font-size:13px">Select a module from the sidebar</span>'; return; }
  const all = m.groups.reduce((a, g) => a.concat(g.cases), []);
  const pass = all.filter(c => c.status === 'Pass').length;
  const fail = all.filter(c => c.status === 'Fail').length;
  const blocked = all.filter(c => c.status === 'Blocked').length;
  const pct = all.length ? Math.round(pass / all.length * 100) : 0;
  topbar.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="module-title">${m.icon || '📁'} ${m.name}</span>
      ${m.desc ? `<span class="module-subtitle">${m.desc}</span>` : ''}
      <div style="display:flex;gap:6px;align-items:center">
        <div class="stat-pill s-total"><span>${all.length} total</span></div>
        <div class="stat-pill s-pass"><div class="dot d-pass"></div>${pass}</div>
        <div class="stat-pill s-fail"><div class="dot d-fail"></div>${fail}</div>
        <div class="stat-pill s-blocked"><div class="dot d-blocked"></div>${blocked}</div>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-label">${pct}%</div>
      </div>
    </div>`;
}

function renderToolbar() {
  const tb = document.getElementById('toolbar');
  tb.style.display = activeId ? 'flex' : 'none';
  updateGroupFilter();
}

function updateGroupFilter() {
  const m = getModule(); if (!m) return;
  const sel = document.getElementById('groupFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Groups</option>' +
    m.groups.map(g => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${g.title}</option>`).join('');
}

function renderMainEmpty() {
  document.getElementById('toolbar').style.display = 'none';
  document.getElementById('topbarContent').innerHTML = '<span style="color:var(--text3);font-size:13px">Select a module from the sidebar</span>';
  document.getElementById('content').innerHTML = `<div class="no-module"><div class="no-module-icon">📋</div><div class="no-module-title">No module selected</div><div class="no-module-sub">Choose a module from the sidebar<br>or create a new one to get started</div></div>`;
}

// ── CONTENT ──
function renderContent() {
  const m = getModule(); if (!m) return;
  const q = document.getElementById('searchInput').value.toLowerCase();
  const sf = document.getElementById('statusFilter').value;
  const gf = document.getElementById('groupFilter').value;
  const content = document.getElementById('content');

  let html = '';
  let anyVisible = false;

  m.groups.forEach(group => {
    if (gf && group.id !== gf) return;
    let cases = group.cases;
    if (q) cases = cases.filter(c =>
      (c.code + c.name + c.desc + c.data + c.steps + c.expected + c.actual).toLowerCase().includes(q));
    if (sf) cases = cases.filter(c => c.status === sf);
    if (!cases.length && (q || sf)) return;
    anyVisible = true;

    const isOpen = group.open !== false;
    html += `<div class="group" id="grp-${group.id}">
      <div class="group-header" onclick="toggleGroup('${group.id}')">
        <span class="group-chevron ${isOpen ? 'open' : ''}">▶</span>
        <span class="group-title-text" contenteditable="true" spellcheck="false"
          onclick="event.stopPropagation()"
          onblur="renameGroup('${group.id}',this.innerText)">${group.title}</span>
        <span class="group-count">${cases.length}</span>
        <div class="group-actions" onclick="event.stopPropagation()">
          <button class="group-action-btn" onclick="openAddTCModal('${group.id}')" title="Add TC">+</button>
          <button class="group-action-btn" onclick="deleteGroup('${group.id}')" title="Delete group" style="color:var(--red)">✕</button>
        </div>
      </div>
      ${isOpen ? `<div class="group-body"><div class="table-wrap">
        <table class="tc-table">
          <thead><tr>
            <th class="col-id">ID</th>
            <th class="col-name">Test Case Name</th>
            <th class="col-desc">Description</th>
            <th class="col-data">Test Data</th>
            <th class="col-steps">Steps</th>
            <th class="col-exp">Expected Result</th>
            <th class="col-actual">Actual Result</th>
            <th class="col-status">Status</th>
            <th class="col-actions"></th>
          </tr></thead>
          <tbody>${cases.map(c => renderRow(group.id, c)).join('')}</tbody>
        </table>
      </div></div>` : ''}
    </div>`;
  });

  if (!anyVisible) {
    html = `<div class="no-module"><div class="no-module-icon" style="font-size:32px">🔍</div><div class="no-module-title">No results</div><div class="no-module-sub">Try adjusting your search or filters</div></div>`;
  }
  content.innerHTML = html;
}

function renderRow(gid, c) {
  const stClass = { 'Not Run': 'st-notrun', 'Pass': 'st-pass', 'Fail': 'st-fail', 'Blocked': 'st-blocked' }[c.status] || 'st-notrun';
  const fmtSteps = (c.steps || '').split(/\n|\|/).filter(Boolean).map(s => `<li>${s.replace(/^\d+[\.\)]\s*/, '').trim()}</li>`).join('');
  const fmtExp = (c.expected || '').split(/\n|\|/).filter(Boolean).map(s => `<li>${s.replace(/^[-•]\s*/, '').trim()}</li>`).join('');
  return `<tr id="row-${c.code}">
    <td class="col-id"><span class="cell-mono editable" contenteditable="true" spellcheck="false" onblur="updateCell('${gid}','${c.code}','id',this.innerText)">${c.code}</span></td>
    <td class="col-name"><span class="editable" contenteditable="true" spellcheck="false" style="font-weight:500" onblur="updateCell('${gid}','${c.code}','name',this.innerText)">${c.name}</span></td>
    <td class="col-desc"><div class="editable" contenteditable="true" spellcheck="false" onblur="updateCell('${gid}','${c.code}','desc',this.innerText)" style="font-size:11.5px">${c.desc || ''}</div></td>
    <td class="col-data"><div class="editable cell-mono" contenteditable="true" spellcheck="false" onblur="updateCell('${gid}','${c.code}','data',this.innerText)" style="font-size:11px">${(c.data || '').replace(/\|/g, '<br>')}</div></td>
    <td class="col-steps"><div class="editable" contenteditable="true" spellcheck="false" onblur="updateCell('${gid}','${c.code}','steps',this.innerText)"><ol style="padding-left:14px;margin:0">${fmtSteps || c.steps || ''}</ol></div></td>
    <td class="col-exp"><div class="editable" contenteditable="true" spellcheck="false" onblur="updateCell('${gid}','${c.code}','expected',this.innerText)"><ul style="padding-left:14px;margin:0">${fmtExp || c.expected || ''}</ul></div></td>
    <td class="col-actual"><div class="editable" contenteditable="true" spellcheck="false" onblur="updateCell('${gid}','${c.code}','actual',this.innerText)" style="font-size:11.5px;min-height:28px">${c.actual || ''}</div></td>
    <td class="col-status">
      <select class="status-badge ${stClass}" onchange="updateStatus('${gid}','${c.code}',this.value)" onclick="event.stopPropagation()">
        <option ${c.status === 'Not Run' ? 'selected' : ''}>Not Run</option>
        <option ${c.status === 'Pass' ? 'selected' : ''}>Pass</option>
        <option ${c.status === 'Fail' ? 'selected' : ''}>Fail</option>
        <option ${c.status === 'Blocked' ? 'selected' : ''}>Blocked</option>
      </select>
    </td>
    <td class="col-actions">
      <div class="row-actions">
        <button class="row-btn" onclick="openEditTCModal('${gid}','${c.code}')" title="Edit">✏️</button>
        <button class="row-btn danger" onclick="deleteTC('${gid}','${c.code}')" title="Delete">🗑</button>
      </div>
    </td>
  </tr>`;
}

// ── INLINE EDIT ──
async function updateCell(gid, cid, field, val) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;
  const c = g.cases.find(c => c.code === cid); if (!c) return;

  const trimmed = val.trim();
  c[field] = trimmed;

  const dbField = field === 'desc' ? 'description' : field === 'id' ? 'code' : field;

  const { error } = await supabaseClient
    .from('test_cases')
    .update({ [dbField]: trimmed })
    .eq('id', c.dbId);

  if (error) console.error(error);

  if (field === 'id') {
    c.code = trimmed;
    renderContent();
  }
}

async function updateStatus(gid, cid, val) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;
  const c = g.cases.find(c => c.code === cid); if (!c) return;
  c.status = val;

  const { error } = await supabaseClient
    .from('test_cases').update({ status: val }).eq('id', c.dbId);
  if (error) { console.error(error); return; }

  const sel = document.querySelector(`#row-${cid} .status-badge`);
  if (sel) sel.className = 'status-badge ' + ({ 'Not Run': 'st-notrun', 'Pass': 'st-pass', 'Fail': 'st-fail', 'Blocked': 'st-blocked' }[val] || 'st-notrun');
  renderTopbar();
}

// ── GROUPS ──
async function toggleGroup(gid) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;
  g.open = g.open === false ? true : false;
  await supabaseClient.from('groups').update({ open: g.open }).eq('id', gid);
  renderContent();
}

async function renameGroup(gid, val) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;
  const title = val.trim() || g.title;
  g.title = title;
  await supabaseClient.from('groups').update({ title }).eq('id', gid);
  updateGroupFilter();
}

function openAddGroupModal() {
  const m = getModule(); if (!m) return;
  document.getElementById('addGroupModalTitle').textContent = 'Add Group';
  document.getElementById('group-name').value = `Group ${m.groups.length + 1} — New Feature`;
  document.getElementById('groupSaveBtn').textContent = 'Add Group';
  openModal('addGroupModal');
}

async function saveGroup() {
  const m = getModule(); if (!m) return;
  const title = document.getElementById('group-name').value.trim();
  if (!title) { alert('Group name is required'); return; }

  const { data, error } = await supabaseClient
    .from('groups')
    .insert({ module_id: m.id, title, open: true, position: m.groups.length })
    .select().single();
  if (error) { console.error(error); toast('Error creating group', 'danger'); return; }

  m.groups.push({ ...data, cases: [] });
  renderContent();
  updateGroupFilter();
  closeModal('addGroupModal');
  toast('Group added');
}

async function deleteGroup(gid) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid);
  openConfirmModal('Delete Group', `Delete group "${g.title}" and all its test cases?`, async () => {
    const { error } = await supabaseClient.from('groups').delete().eq('id', gid);
    if (error) { console.error(error); toast('Error deleting group', 'danger'); return; }
    m.groups = m.groups.filter(g => g.id !== gid);
    renderContent(); renderTopbar(); updateGroupFilter();
    toast('Group deleted');
  });
}

// ── ADD/EDIT TC ──
function openAddTCModal(gid = null) {
  const m = getModule(); if (!m) return;
  editingTC = null;
  document.getElementById('tcModalTitle').textContent = 'Add Test Case';
  document.getElementById('tcSaveBtn').textContent = 'Add Test Case';
  ['tc-id', 'tc-name', 'tc-desc', 'tc-data', 'tc-steps', 'tc-expected', 'tc-actual'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tc-status').value = 'Not Run';
  const grpSel = document.getElementById('tc-group');
  grpSel.innerHTML = '<option value="">Select Group</option>' + m.groups.map(g => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${g.title}</option>`).join('');
  openModal('tcModal');
}

function openEditTCModal(gid, cid) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;
  const c = g.cases.find(c => c.code === cid); if (!c) return;
  const index = g.cases.indexOf(c);
  editingTC = { gid, cid, index };
  document.getElementById('tcModalTitle').textContent = 'Edit Test Case';
  document.getElementById('tcSaveBtn').textContent = 'Save Changes';
  document.getElementById('tc-id').value = c.code;
  document.getElementById('tc-name').value = c.name;
  document.getElementById('tc-desc').value = c.desc || '';
  document.getElementById('tc-data').value = c.data || '';
  document.getElementById('tc-steps').value = c.steps || '';
  document.getElementById('tc-expected').value = c.expected || '';
  document.getElementById('tc-actual').value = c.actual || '';
  document.getElementById('tc-status').value = c.status;
  const grpSel = document.getElementById('tc-group');
  grpSel.innerHTML = m.groups.map(g => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${g.title}</option>`).join('');
  openModal('tcModal');
}

async function saveTC() {
  const id = document.getElementById('tc-id').value.trim();
  const name = document.getElementById('tc-name').value.trim();
  const gid = document.getElementById('tc-group').value;
  if (!id || !name || !gid) { alert('ID, Name, and Group are required'); return; }
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;

  const tc = {
    code: id, name,
    description: document.getElementById('tc-desc').value.trim(),
    data: document.getElementById('tc-data').value.trim(),
    steps: document.getElementById('tc-steps').value.trim(),
    expected: document.getElementById('tc-expected').value.trim(),
    actual: document.getElementById('tc-actual').value.trim(),
    status: document.getElementById('tc-status').value,
    group_id: gid,
    position: g.cases.length
  };

  if (editingTC) {
    const c = g.cases.find(cc => cc.code === editingTC.cid); 
    if (!c) return;

    const { error } = await supabaseClient
      .from('test_cases')
      .update({ ...tc, group_id: gid })
      .eq('id', c.dbId);
    if (error) { console.error(error); toast('Error updating test case', 'danger'); return; }

    const og = m.groups.find(g => g.id === editingTC.gid);
    if (og) og.cases = og.cases.filter(c => c.code !== editingTC.cid);
    const tcLocal = { ...tc, desc: tc.description, dbId: editingTC.dbId };
    if (gid === editingTC.gid) {
      g.cases.splice(editingTC.index, 0, tcLocal);
    } else {
      g.cases.push(tcLocal);
    }
    toast('Test case updated');
  } else {
    const dup = g.cases.some(c => c.code === id);
    if (dup) { alert('Test Case ID already exists'); return; }

    const { data, error } = await supabaseClient
      .from('test_cases').insert(tc).select().single();
    if (error) { console.error(error); toast('Error creating test case', 'danger'); return; }
    g.cases.push({ ...data, desc: data.description });
    toast('Test case added: ' + id);
  }

  closeModal('tcModal');
  renderContent(); renderTopbar(); renderSidebar(); updateGroupFilter();
}

async function deleteTC(gid, cid) {
  const m = getModule(); if (!m) return;
  const g = m.groups.find(g => g.id === gid); if (!g) return;
  const c = g.cases.find(c => c.code === cid); if (!c) return;

  openConfirmModal('Delete Test Case', 'Delete this test case?', async () => {
    const { error } = await supabaseClient
      .from('test_cases')
      .delete()
      .eq('id', c.dbId);

    if (error) { console.error(error); toast('Error deleting test case', 'danger'); return; }

    g.cases = g.cases.filter(tc => tc.code !== cid);
    renderContent(); renderTopbar(); renderSidebar();
    toast('Test case deleted');
  });
}

// ── EXPORT HTML ──
function exportHTML() {
  const m = getModule(); if (!m) return;
  let rows = '';
  m.groups.forEach(g => {
    rows += `<tr style="background:#E6F1FB"><td colspan="8" style="padding:6px 12px;font-weight:600;color:#0C447C;font-size:12px">${g.title}</td></tr>`;
    g.cases.forEach(c => {
      const stColor = { 'Pass': '#16a34a', 'Fail': '#dc2626', 'Blocked': '#d97706', 'Not Run': '#6b7280' }[c.status] || '#6b7280';
      rows += `<tr>
        <td style="font-family:monospace;font-weight:600;color:#185FA5;white-space:nowrap;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top">${c.code}</td>
        <td style="font-weight:500;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top">${c.name}</td>
        <td style="font-size:12px;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top">${(c.desc || '').replace(/\n/g, '<br>')}</td>
        <td style="font-family:monospace;font-size:11px;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top">${(c.data || '').replace(/\|/g, '<br>')}</td>
        <td style="font-size:12px;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top">${(c.steps || '').split(/\n|\|/).filter(Boolean).map((s, i) => `${i + 1}. ${s.replace(/^\d+\.\s*/, '')}`).join('<br>')}</td>
        <td style="font-size:12px;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top">${(c.expected || '').split(/\n|\|/).filter(Boolean).map(s => `• ${s.replace(/^[-•]\s*/, '')}`).join('<br>')}</td>
        <td style="font-size:12px;padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top;color:#999">${c.actual || '—'}</td>
        <td style="padding:8px 10px;border:1px solid #e4e7ec;vertical-align:top;white-space:nowrap"><span style="background:${stColor}22;color:${stColor};border-radius:99px;padding:2px 10px;font-size:11px;font-weight:600;font-family:monospace">${c.status}</span></td>
      </tr>`;
    });
  });
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${m.name} — Test Cases</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;background:#f5f6f8;color:#1a1a2e">
    <h1 style="color:#185FA5;font-size:20px;margin-bottom:4px">${m.icon || ''} ${m.name}</h1>
    <p style="color:#666;font-size:12px;margin-bottom:20px">${m.desc || ''}</p>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:900px;background:#fff;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#185FA5">
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">ID</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">TEST CASE NAME</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">DESCRIPTION</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">TEST DATA</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">STEPS</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">EXPECTED RESULT</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">ACTUAL RESULT</th>
        <th style="color:#E6F1FB;padding:9px 10px;text-align:left;font-size:11px">STATUS</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m.name.replace(/\s+/g, '-').toLowerCase() + '-testcases.html';
  a.click();
  toast('Exported: ' + a.download);
}

// ── MODAL HELPERS ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  ['addModuleModal', 'tcModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && e.target === el) closeModal(id);
  });
  hideCtx();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('addModuleModal'); closeModal('tcModal'); hideCtx();
  }
});

// ── CONFIRM MODAL ──
function openConfirmModal(title, message, callback) {
  confirmCallback = callback;
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalMessage').textContent = message;
  document.getElementById('confirmModalBtn').textContent = 'Delete';
  openModal('confirmModal');
}

function confirmModalAction() {
  if (typeof confirmCallback === 'function') confirmCallback();
  confirmCallback = null;
  closeModal('confirmModal');
}

// ── CONTEXT MENU ──
function showCtx(x, y, items) {
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = items.map(item => item.sep
    ? `<div class="ctx-sep"></div>`
    : `<div class="ctx-item ${item.danger ? 'danger' : ''}" onclick="event.stopPropagation(); ${item.action}; hideCtx()">${item.label}</div>`
  ).join('');
  menu.style.cssText = `display:block;position:fixed;left:${x}px;top:${y}px;z-index:9999`;
  setTimeout(() => {
    if (x + 180 > window.innerWidth) menu.style.left = (x - 180) + 'px';
  }, 0);
}
document.addEventListener('click', e => {
  if (!e.target.closest('#ctxMenu')) hideCtx();
});
function hideCtx() { document.getElementById('ctxMenu').style.display = 'none'; }

// ── TOAST ──
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-dot"></div>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
    t.style.transition = 'all .3s'; setTimeout(() => t.remove(), 300);
  }, 2200);
}

// ── BOOT ──
async function init() {
  await loadFromDB();
  renderSidebar();
  if (modules.length) {
    selectModule(modules[0].id);
  } else {
    renderMainEmpty();
  }
}
init();

// ── IMPORT CSV ──
function parseCSV(text) {
  const lines = text.trim().split('\n').map(line => line.split(',').map(cell => cell.replace(/"/g, '').trim()));
  if (lines.length < 2) return [];
  const headers = lines[0].map(h => h.toLowerCase());
  const data = lines.slice(1);
  const columnMap = {
    id: headers.indexOf('id') !== -1 ? headers.indexOf('id') : headers.indexOf('test case id'),
    name: headers.indexOf('name') !== -1 ? headers.indexOf('name') : headers.indexOf('test case name'),
    gid: headers.indexOf('gid') !== -1 ? headers.indexOf('gid') : headers.indexOf('group'),
    desc: headers.indexOf('desc') !== -1 ? headers.indexOf('desc') : headers.indexOf('description'),
    data: headers.indexOf('data') !== -1 ? headers.indexOf('data') : headers.indexOf('test data'),
    steps: headers.indexOf('steps') !== -1 ? headers.indexOf('steps') : -1,
    expected: headers.indexOf('expected') !== -1 ? headers.indexOf('expected') : headers.indexOf('expected result'),
    actual: headers.indexOf('actual') !== -1 ? headers.indexOf('actual') : headers.indexOf('actual result'),
    status: headers.indexOf('status') !== -1 ? headers.indexOf('status') : -1
  };
  return data.map(row => ({
    id: columnMap.id !== -1 ? row[columnMap.id] || '' : '',
    name: columnMap.name !== -1 ? row[columnMap.name] || '' : '',
    gid: columnMap.gid !== -1 ? row[columnMap.gid] || '' : '',
    desc: columnMap.desc !== -1 ? row[columnMap.desc] || '' : '',
    data: columnMap.data !== -1 ? row[columnMap.data] || '' : '',
    steps: columnMap.steps !== -1 ? row[columnMap.steps] || '' : '',
    expected: columnMap.expected !== -1 ? row[columnMap.expected] || '' : '',
    actual: columnMap.actual !== -1 ? row[columnMap.actual] || '' : '',
    status: columnMap.status !== -1 ? row[columnMap.status] || 'Not Run' : 'Not Run'
  })).filter(tc => tc.id && tc.name);
}

async function handleImport() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) return toast('Please select a CSV file', 'danger');

  try {
    const text = await file.text();
    const data = parseCSV(text);
    if (!data.length) return toast('No valid test cases found in CSV', 'danger');

    const m = getModule();
    if (!m) return toast('Select a module first', 'danger');

    // Group các TC theo group name
    const groupMap = {};
    data.forEach(tc => {
      const key = tc.gid.toLowerCase();
      if (!groupMap[key]) groupMap[key] = { name: tc.gid, tcs: [] };
      groupMap[key].tcs.push(tc);
    });

    for (const key of Object.keys(groupMap)) {
      const { name, tcs } = groupMap[key];

      // Tìm group có sẵn hoặc tạo mới
      let g = m.groups.find(gr => gr.title.toLowerCase() === key);
      if (!g) {
        const { data: newGroup, error } = await supabaseClient
          .from('groups')
          .insert({ module_id: m.id, title: name, open: true, position: m.groups.length })
          .select().single();
        if (error) { console.error(error); continue; }
        g = { ...newGroup, cases: [] };
        m.groups.push(g);
      }

      // Bulk insert tất cả TC của group này
      const tcInserts = tcs.map((tc, i) => ({
        code: tc.id,
        group_id: g.id,
        name: tc.name,
        description: tc.desc,
        data: tc.data,
        steps: tc.steps,
        expected: tc.expected,
        actual: tc.actual || '',
        status: tc.status || 'Not Run',
        position: g.cases.length + i
      }));

      const { data: inserted, error: tcError } = await supabaseClient
        .from('test_cases').insert(tcInserts).select();
      if (tcError) { console.error(tcError); continue; }

      inserted.forEach(tc => g.cases.push({ 
       ...tc, 
       dbId: tc.id,      
       code: tc.code,     
       desc: tc.description 
      }));
      }

    renderContent();
    renderSidebar();
    updateGroupFilter();
    toast(`Imported ${data.length} test cases`);
  } catch (error) {
    console.error(error);
    toast('Error importing CSV', 'danger');
  }

  fileInput.value = '';
}

// enter to confirm modal inputs
document.getElementById('m-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveModule(); });

// ── AI GENERATE ──
let aiGrouped = {};

function openAIModal() {
  const m = getModule();
  if (!m) return toast('Select a module first', 'danger');
  document.getElementById('ai-requirement').value = '';
  document.getElementById('aiStep1').style.display = 'flex';
  document.getElementById('aiStep2').style.display = 'none';
  document.getElementById('aiLoading').style.display = 'none';
  document.getElementById('aiModal').classList.add('open');
}

function closeAIModal() {
  document.getElementById('aiModal').classList.remove('open');
}

function backToStep1() {
  document.getElementById('aiStep1').style.display = 'flex';
  document.getElementById('aiStep2').style.display = 'none';
}

function selectAllTC(checked) {
  document.querySelectorAll('.ai-tc-check, .ai-group-check')
    .forEach(cb => cb.checked = checked);
}

async function handleGenerate() {
  const fileInput = document.getElementById('ai-requirement');
  const file = fileInput.files[0];

  // validate
  if (!file) return toast('Please upload a PDF file', 'danger');
  if (file.type !== 'application/pdf') {
    return toast('Only PDF file is allowed', 'danger');
  }

  // Show loading
  document.getElementById('aiStep1').style.display = 'none';
  document.getElementById('aiLoading').style.display = 'flex';

  try {
    const requirement = await readPDF(file);

    if (!requirement.trim()) {
      throw new Error('Cannot read content from PDF');
    }
    const testCases = await generateTestCases(requirement);
    const { html, grouped } = renderPreview(testCases);
    aiGrouped = grouped;

    document.getElementById('aiPreviewList').innerHTML = html;
    document.getElementById('aiPreviewCount').textContent =
      `${testCases.length} test cases generated across ${Object.keys(grouped).length} groups`;

    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('aiStep2').style.display = 'flex';

    // reset file
    fileInput.value = '';

  } catch (err) {
    console.error(err);
    toast('Failed to generate: ' + err.message, 'danger');
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('aiStep1').style.display = 'flex';
  }
}

const input = document.getElementById('ai-requirement');
const fileName = document.getElementById('fileName');

if (input) {
  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      fileName.textContent = input.files[0].name;
    } else {
      fileName.textContent = 'Chưa chọn file';
    }
  });
}

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
async function readPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let text = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const strings = content.items.map(item => item.str);
    text += strings.join(' ') + '\n';
  }

  return text;
}

async function handleAIImport() {
  const selected = getSelectedTestCases(aiGrouped);
  if (!selected.length) return toast('Please select at least one test case', 'danger');

  const m = getModule();
  if (!m) return toast('Select a module first', 'danger');

  document.getElementById('aiImportBtn').textContent = 'Importing...';
  document.getElementById('aiImportBtn').disabled = true;

  try {
    // Group by group name
    const groupMap = {};
    selected.forEach(tc => {
      if (!groupMap[tc.group]) groupMap[tc.group] = [];
      groupMap[tc.group].push(tc);
    });

    for (const [groupName, tcs] of Object.entries(groupMap)) {
      // Find or create group
      let g = m.groups.find(gr => gr.title.toLowerCase() === groupName.toLowerCase());
      if (!g) {
        const { data: newGroup, error } = await supabaseClient
          .from('groups')
          .insert({ module_id: m.id, title: groupName, open: true, position: m.groups.length })
          .select().single();
        if (error) { console.error(error); continue; }
        g = { ...newGroup, cases: [] };
        m.groups.push(g);
      }

      // Bulk insert TCs
      const tcInserts = tcs.map((tc, i) => ({
        code: tc.id,
        group_id: g.id,
        name: tc.name,
        description: tc.desc,
        data: tc.data || '',
        steps: tc.steps || '',
        expected: tc.expected || '',
        actual: '',
        status: 'Not Run',
        position: g.cases.length + i
      }));

      const { data: inserted, error: tcError } = await supabaseClient
        .from('test_cases').insert(tcInserts).select();
      if (tcError) { console.error(tcError); continue; }
      inserted.forEach(tc => g.cases.push({ ...tc, desc: tc.description }));
    }

    closeAIModal();
    renderContent();
    renderSidebar();
    updateGroupFilter();
    toast(`Imported ${selected.length} test cases successfully! 🎉`);
  } catch (err) {
    console.error(err);
    toast('Import failed: ' + err.message, 'danger');
  }

  document.getElementById('aiImportBtn').textContent = 'Import Selected';
  document.getElementById('aiImportBtn').disabled = false;
}