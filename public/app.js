/* ── State ── */
let network   = null;
let members   = [];
let relations = [];
let selected  = null;   // currently selected member id
let hierarchical = true;
let ctxTarget = null;   // node id for context menu

/* ══════════════════════════════════════════════
   DATA  ── fetch & refresh
══════════════════════════════════════════════ */
async function loadTree() {
  try {
    const data = await apiFetch('/api/tree');
    members   = data.members;
    relations = data.relationships;
    renderSidebar();
    renderTree();
    updateHeader();
  } catch {
    toast('Failed to load tree data', 'error');
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function renderSidebar(filter = '') {
  const list = qs('#memberList');
  const q    = filter.toLowerCase();
  const shown = members.filter(m => m.name.toLowerCase().includes(q));

  if (!shown.length) {
    list.innerHTML = `<div class="sidebar-empty">${filter ? 'No results found' : 'No members yet'}</div>`;
    return;
  }

  list.innerHTML = shown.map(m => `
    <div class="member-item ${selected === m.id ? 'active' : ''}"
         data-id="${m.id}" onclick="pickMember(${m.id})">
      ${avatarEl(m, 34)}
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-dates">${dateRange(m.birth_date, m.death_date)}</div>
      </div>
    </div>`).join('');
}

function updateHeader() {
  const n = members.length;
  qs('#memberCount').textContent = n ? `${n} member${n > 1 ? 's' : ''}` : '';
}

/* ══════════════════════════════════════════════
   TREE  ── vis-network
══════════════════════════════════════════════ */
function computeLevels() {
  const levels = {};
  members.forEach(m => { levels[m.id] = 0; });

  const pcRels   = relations.filter(r => r.type === 'parent-child');
  const childSet = new Set(pcRels.map(r => r.person2_id));
  const roots    = members.filter(m => !childSet.has(m.id));

  const queue = roots.map(r => ({ id: r.id, level: 0 }));
  const seen  = new Set();
  while (queue.length) {
    const { id, level } = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    levels[id] = Math.max(levels[id] ?? 0, level);
    pcRels
      .filter(r => r.person1_id === id)
      .forEach(r => queue.push({ id: r.person2_id, level: level + 1 }));
  }

  // Align spouses to the same generation
  const spouseRels = relations.filter(r => r.type === 'spouse');
  let changed = true;
  while (changed) {
    changed = false;
    spouseRels.forEach(r => {
      const l1 = levels[r.person1_id] ?? 0;
      const l2 = levels[r.person2_id] ?? 0;
      const max = Math.max(l1, l2);
      if (l1 !== max) { levels[r.person1_id] = max; changed = true; }
      if (l2 !== max) { levels[r.person2_id] = max; changed = true; }
    });
  }
  return levels;
}

function renderTree() {
  const container = qs('#treeContainer');
  const emptyEl   = qs('#emptyState');

  if (!members.length) {
    emptyEl.classList.add('visible');
    if (network) { network.destroy(); network = null; }
    return;
  }
  emptyEl.classList.remove('visible');

  const levels = computeLevels();

  const nodes = new vis.DataSet(members.map(m => ({
    id:    m.id,
    level: hierarchical ? (levels[m.id] ?? 0) : undefined,
    label: nodeLabel(m),
    shape: 'circularImage',
    image: m.photo || initialsDataUrl(m),
    brokenImage: initialsDataUrl(m),
    size:  32,
    borderWidth: selected === m.id ? 3 : 2,
    color: {
      border:    genderBorder(m.gender),
      highlight: { border: '#f59e0b', background: '#fef3c7' },
    },
    font: { size: 11, face: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
            color: '#1e293b', multi: false },
    title: nodeTooltip(m),
  })));

  const edges = new vis.DataSet(relations.map(r => ({
    id:      r.id,
    from:    r.person1_id,
    to:      r.person2_id,
    arrows:  r.type === 'parent-child'
               ? { to: { enabled: true, scaleFactor: .55 } }
               : { to: { enabled: false } },
    dashes:  r.type === 'spouse',
    color:   r.type === 'spouse'
               ? { color: '#ec4899', highlight: '#be185d' }
               : { color: '#94a3b8', highlight: '#3b82f6' },
    width:   r.type === 'spouse' ? 2 : 1.5,
    smooth:  { type: 'cubicBezier', forceDirection: r.type === 'spouse' ? 'horizontal' : 'vertical' },
  })));

  const options = buildNetworkOptions();

  if (network) {
    network.setData({ nodes, edges });
    network.setOptions(options);
  } else {
    network = new vis.Network(container, { nodes, edges }, options);
    attachNetworkEvents(nodes, edges);
  }

  if (selected) network.selectNodes([selected]);
}

function buildNetworkOptions() {
  if (hierarchical) {
    return {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'directed',
          levelSeparation: 130,
          nodeSpacing: 190,
          treeSpacing: 220,
          shakeTowards: 'roots',
        }
      },
      physics: { enabled: false },
      interaction: { hover: true, tooltipDelay: 400, navigationButtons: false },
    };
  }
  return {
    layout: { hierarchical: { enabled: false } },
    physics: {
      enabled: true,
      barnesHut: { gravitationalConstant: -3000, springLength: 160, damping: .4 },
    },
    interaction: { hover: true, tooltipDelay: 400, navigationButtons: false },
  };
}

function attachNetworkEvents(nodes) {
  network.on('click', params => {
    hideCtxMenu();
    if (params.nodes.length) {
      pickMember(params.nodes[0]);
    } else {
      deselect();
    }
  });

  network.on('doubleClick', params => {
    if (params.nodes.length) openEditModal(params.nodes[0]);
  });

  network.on('oncontext', params => {
    params.event.preventDefault();
    if (params.nodes.length) {
      ctxTarget = params.nodes[0];
      showCtxMenu(params.event.clientX, params.event.clientY);
    }
  });

  // Update border width when selection changes
  network.on('selectNode', ({ nodes: sel }) => {
    const updates = members.map(m => ({
      id: m.id,
      borderWidth: sel.includes(m.id) ? 3 : 2,
    }));
    nodes.update(updates);
  });
  network.on('deselectNode', ({ nodes: sel }) => {
    const updates = members.map(m => ({
      id: m.id,
      borderWidth: sel.includes(m.id) ? 3 : 2,
    }));
    nodes.update(updates);
  });
}

/* ══════════════════════════════════════════════
   SELECTION & DETAIL PANEL
══════════════════════════════════════════════ */
function pickMember(id) {
  selected = id;
  renderSidebar(qs('#searchInput').value);
  if (network) {
    network.selectNodes([id]);
    network.focus(id, { animation: { duration: 400, easingFunction: 'easeInOutQuad' }, scale: 1.1 });
  }
  showDetail(members.find(m => m.id === id));
}

function deselect() {
  selected = null;
  qs('#detailPanel').classList.remove('open');
  renderSidebar(qs('#searchInput').value);
  if (network) network.unselectAll();
}

function showDetail(m) {
  if (!m) return;
  const panel   = qs('#detailPanel');
  const content = qs('#detailContent');

  const parents  = relatedOf(m.id, 'parent', 'parent-child');
  const children = relatedOf(m.id, 'child',  'parent-child');
  const spouses  = relatedOf(m.id, 'spouse', 'spouse');

  const gIcon = { male: '♂', female: '♀', other: '⚧', unknown: '' }[m.gender] || '';
  const bgColor = genderColor(m.gender);

  content.innerHTML = `
    <div class="detail-hero" style="background:${bgColor}22">
      ${m.photo
        ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}">`
        : `<div class="detail-hero-initials" style="background:${bgColor}">
             ${initials(m.name)}</div>`}
    </div>
    <div class="detail-body">
      <div>
        <div class="detail-name">${esc(m.name)}</div>
        <div class="detail-sub">${gIcon} ${m.gender !== 'unknown' ? m.gender : '—'}</div>
      </div>

      ${(m.birth_date || m.death_date || m.birth_place) ? `
      <div class="detail-meta">
        ${m.birth_date  ? `<div class="detail-meta-row"><span class="meta-label">Born</span><span>${fmtDate(m.birth_date)}</span></div>` : ''}
        ${m.birth_place ? `<div class="detail-meta-row"><span class="meta-label">Place</span><span>${esc(m.birth_place)}</span></div>` : ''}
        ${m.death_date  ? `<div class="detail-meta-row"><span class="meta-label">Died</span><span>${fmtDate(m.death_date)}</span></div>` : ''}
      </div>` : ''}

      ${m.bio ? `<div class="detail-bio">${esc(m.bio)}</div>` : ''}

      ${renderRelSection('Parents',  parents,  m.id, 'parent-child', 'child')}
      ${renderRelSection('Spouses',  spouses,  m.id, 'spouse',       null)}
      ${renderRelSection('Children', children, m.id, 'parent-child', 'parent')}

      <div class="detail-actions">
        <button class="btn btn-outline btn-sm" onclick="openEditModal(${m.id})">&#9998; Edit</button>
        <button class="btn btn-outline btn-sm" onclick="openRelModal(${m.id})">&#10133; Add Relation</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete(${m.id})">&#10006; Delete</button>
      </div>
    </div>
  `;

  panel.classList.add('open');
}

function renderRelSection(title, people, fromId, type, role) {
  if (!people.length) return '';

  const rows = people.map(p => {
    const relId = findRelId(fromId, p.id, type);
    return `
      <div class="rel-row">
        <span class="rel-who" onclick="pickMember(${p.id})">${esc(p.name)}</span>
        ${relId ? `<button class="rel-remove" title="Remove" onclick="removeRelation(${relId})">&#10006;</button>` : ''}
      </div>`;
  }).join('');

  return `<div class="detail-section"><h3>${title}</h3>${rows}</div>`;
}

function relatedOf(id, role, type) {
  if (type === 'spouse') {
    return relations
      .filter(r => r.type === 'spouse' && (r.person1_id === id || r.person2_id === id))
      .map(r => members.find(m => m.id === (r.person1_id === id ? r.person2_id : r.person1_id)))
      .filter(Boolean);
  }
  if (role === 'parent') {
    return relations
      .filter(r => r.type === 'parent-child' && r.person2_id === id)
      .map(r => members.find(m => m.id === r.person1_id))
      .filter(Boolean);
  }
  // child
  return relations
    .filter(r => r.type === 'parent-child' && r.person1_id === id)
    .map(r => members.find(m => m.id === r.person2_id))
    .filter(Boolean);
}

function findRelId(a, b, type) {
  const r = relations.find(r =>
    r.type === type &&
    ((r.person1_id === a && r.person2_id === b) ||
     (r.person1_id === b && r.person2_id === a))
  );
  return r?.id ?? null;
}

/* ══════════════════════════════════════════════
   ADD / EDIT MEMBER
══════════════════════════════════════════════ */
function openAddModal() {
  qs('#modalTitle').textContent    = 'Add Family Member';
  qs('#memberId').value            = '';
  qs('#memberForm').reset();
  qs('#removePhotoBtn').style.display = 'none';
  setPhotoThumb(null);
  openOverlay('memberOverlay');
}

function openEditModal(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  qs('#modalTitle').textContent   = 'Edit Member';
  qs('#memberId').value           = id;
  qs('#memberName').value         = m.name;
  qs('#memberGender').value       = m.gender  || 'unknown';
  qs('#memberBirthDate').value    = m.birth_date  || '';
  qs('#memberDeathDate').value    = m.death_date  || '';
  qs('#memberBirthPlace').value   = m.birth_place || '';
  qs('#memberBio').value          = m.bio    || '';
  qs('#removePhotoBtn').style.display = m.photo ? 'inline-flex' : 'none';
  setPhotoThumb(m.photo);
  openOverlay('memberOverlay');
}

async function saveMember(e) {
  e.preventDefault();
  const id   = qs('#memberId').value;
  const name = qs('#memberName').value.trim();
  if (!name) { qs('#memberName').focus(); return; }

  const fd = new FormData();
  fd.append('name',        name);
  fd.append('gender',      qs('#memberGender').value);
  fd.append('birth_date',  qs('#memberBirthDate').value);
  fd.append('death_date',  qs('#memberDeathDate').value);
  fd.append('birth_place', qs('#memberBirthPlace').value);
  fd.append('bio',         qs('#memberBio').value);

  const photoFile = qs('#photoInput').files[0];
  if (photoFile) fd.append('photo', photoFile);
  if (!photoFile && !id) { /* new member, no photo */ }
  // handle remove-photo flag
  if (!photoFile && id) {
    const thumb = qs('#photoThumb');
    if (!thumb.querySelector('img')) fd.append('remove_photo', 'true');
  }

  const btn = qs('#saveMemberBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const saved = await apiFetch(
      id ? `/api/members/${id}` : '/api/members',
      { method: id ? 'PUT' : 'POST', body: fd }
    );
    closeOverlay('memberOverlay');
    toast(`${name} ${id ? 'updated' : 'added'}!`, 'success');
    await loadTree();
    pickMember(saved.id);
  } catch (err) {
    toast(err.message || 'Failed to save', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Member';
  }
}

async function confirmDelete(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  if (!confirm(`Delete "${m.name}"? All their relationships will also be removed.`)) return;

  try {
    await apiFetch(`/api/members/${id}`, { method: 'DELETE' });
    toast(`${m.name} removed`, 'success');
    deselect();
    await loadTree();
  } catch {
    toast('Failed to delete member', 'error');
  }
}

/* ══════════════════════════════════════════════
   RELATIONSHIPS
══════════════════════════════════════════════ */
function openRelModal(defaultId = null) {
  const opts = members.map(m =>
    `<option value="${m.id}" ${m.id === defaultId ? 'selected' : ''}>${esc(m.name)}</option>`
  ).join('');
  qs('#rel1').innerHTML = opts;
  qs('#rel2').innerHTML = opts;

  // Default second selector to a different person
  if (defaultId && members.length > 1) {
    const other = members.find(m => m.id !== defaultId);
    if (other) qs('#rel2').value = other.id;
  }
  updateRelLabels();
  openOverlay('relOverlay');
}

function updateRelLabels() {
  const type = qs('#relType').value;
  qs('#rel1Label').textContent = type === 'parent-child' ? 'Parent' : 'Person 1';
  qs('#rel2Label').textContent = type === 'parent-child' ? 'Child'  : 'Person 2';
}

async function saveRelation() {
  const type = qs('#relType').value;
  const p1   = parseInt(qs('#rel1').value);
  const p2   = parseInt(qs('#rel2').value);

  if (p1 === p2) { toast('Choose two different people', 'warn'); return; }

  const btn = qs('#saveRelBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await apiFetch('/api/relationships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person1_id: p1, person2_id: p2, type }),
    });
    closeOverlay('relOverlay');
    toast('Relationship added!', 'success');
    await loadTree();
    if (selected) showDetail(members.find(m => m.id === selected));
  } catch (err) {
    toast(err.message || 'Failed to add relationship', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Add Relationship';
  }
}

async function removeRelation(id) {
  if (!confirm('Remove this relationship?')) return;
  try {
    await apiFetch(`/api/relationships/${id}`, { method: 'DELETE' });
    toast('Relationship removed', 'success');
    await loadTree();
    if (selected) showDetail(members.find(m => m.id === selected));
  } catch {
    toast('Failed to remove relationship', 'error');
  }
}

/* ══════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════ */
function showCtxMenu(x, y) {
  const menu = qs('#ctxMenu');
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
  menu.classList.add('open');
}
function hideCtxMenu() { qs('#ctxMenu').classList.remove('open'); }

qs('#ctxEdit').onclick    = () => { hideCtxMenu(); if (ctxTarget) openEditModal(ctxTarget); };
qs('#ctxRelation').onclick = () => { hideCtxMenu(); if (ctxTarget) openRelModal(ctxTarget); };
qs('#ctxDelete').onclick  = () => { hideCtxMenu(); if (ctxTarget) confirmDelete(ctxTarget); };
document.addEventListener('click', hideCtxMenu);

/* ══════════════════════════════════════════════
   OVERLAY HELPERS
══════════════════════════════════════════════ */
function openOverlay(id)  { qs(`#${id}`).classList.add('open'); }
function closeOverlay(id) { qs(`#${id}`).classList.remove('open'); }

/* ══════════════════════════════════════════════
   PHOTO PREVIEW
══════════════════════════════════════════════ */
function setPhotoThumb(src) {
  const thumb = qs('#photoThumb');
  thumb.innerHTML = src
    ? `<img src="${esc(src)}" alt="Photo">`
    : '<span>&#128247;</span>';
}

qs('#photoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    qs('#photoThumb').innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
    qs('#removePhotoBtn').style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
});

qs('#removePhotoBtn').addEventListener('click', () => {
  qs('#photoInput').value = '';
  setPhotoThumb(null);
  qs('#removePhotoBtn').style.display = 'none';
});

/* ══════════════════════════════════════════════
   EVENT WIRING
══════════════════════════════════════════════ */
qs('#addMemberBtn').onclick   = openAddModal;
qs('#emptyAddBtn').onclick    = openAddModal;
qs('#refreshBtn').onclick     = loadTree;
qs('#closePanelBtn').onclick  = deselect;

qs('#closeModalBtn').onclick  = () => closeOverlay('memberOverlay');
qs('#cancelModalBtn').onclick = () => closeOverlay('memberOverlay');
qs('#memberForm').addEventListener('submit', saveMember);

qs('#closeRelBtn').onclick   = () => closeOverlay('relOverlay');
qs('#cancelRelBtn').onclick  = () => closeOverlay('relOverlay');
qs('#saveRelBtn').onclick    = saveRelation;
qs('#relType').addEventListener('change', updateRelLabels);

qs('#searchInput').addEventListener('input', e => renderSidebar(e.target.value));

qs('#fitBtn').onclick = () => network?.fit({ animation: { duration: 500 } });

qs('#layoutBtn').onclick = () => {
  hierarchical = !hierarchical;
  qs('#layoutBtn').textContent = hierarchical ? '⇅ Layout' : '⇄ Layout';
  if (network) network.destroy();
  network = null;
  renderTree();
  toast(hierarchical ? 'Hierarchical layout' : 'Free layout', '');
};

// Close overlays on backdrop click
['memberOverlay', 'relOverlay'].forEach(id => {
  qs(`#${id}`).addEventListener('click', e => {
    if (e.target === e.currentTarget) closeOverlay(id);
  });
});

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function qs(sel) { return document.querySelector(sel); }

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function genderColor(g) {
  return { male: '#3b82f6', female: '#ec4899', other: '#8b5cf6' }[g] || '#64748b';
}
function genderBorder(g) {
  return { male: '#2563eb', female: '#be185d', other: '#7c3aed' }[g] || '#475569';
}

function initialsDataUrl(m) {
  const ini  = initials(m.name);
  const fill = genderColor(m.gender);
  const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <circle cx="32" cy="32" r="32" fill="${fill}"/>
    <text x="32" y="42" font-family="sans-serif" font-size="22" font-weight="700"
          fill="white" text-anchor="middle">${ini}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function initials(name) {
  return (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarEl(m, size) {
  const style = `width:${size}px;height:${size}px;`;
  if (m.photo) {
    return `<div class="avatar ${m.gender}" style="${style}"><img src="${esc(m.photo)}" alt=""></div>`;
  }
  return `<div class="avatar ${m.gender}" style="${style}">${initials(m.name)}</div>`;
}

function nodeLabel(m) {
  const name  = m.name.length > 18 ? m.name.slice(0, 16) + '…' : m.name;
  const range = dateRange(m.birth_date, m.death_date);
  return range ? `${name}\n${range}` : name;
}

function nodeTooltip(m) {
  const div = document.createElement('div');
  div.style.cssText = 'padding:8px 10px;font-size:13px;max-width:220px;line-height:1.5';
  div.innerHTML = `<strong>${esc(m.name)}</strong><br>${dateRange(m.birth_date, m.death_date) || ''}${m.bio ? `<hr style="margin:.4rem 0;border:0;border-top:1px solid #ddd">` + esc(m.bio.slice(0, 120)) + (m.bio.length > 120 ? '…' : '') : ''}`;
  return div;
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US',
      { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return d; }
}

function dateRange(birth, death) {
  const b = birth?.split('-')[0] || '';
  const d = death?.split('-')[0] || '';
  if (b && d) return `${b} – ${d}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return '';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function toast(msg, type = '') {
  const el = qs('#toast');
  el.textContent = msg;
  el.className   = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ── Boot ── */
loadTree();
