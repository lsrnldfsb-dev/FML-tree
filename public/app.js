/* ══════════════════════════════════════════════
   INIT  ── Supabase client
══════════════════════════════════════════════ */
const isConfigured =
  window.SUPABASE_URL &&
  !window.SUPABASE_URL.includes('PASTE') &&
  window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_ANON_KEY.includes('PASTE');

if (!isConfigured) {
  document.getElementById('setupScreen').style.display = 'flex';
} else {
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('app').style.display        = 'flex';
}

const { createClient } = window.supabase;
const db = isConfigured
  ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

/* ── State ── */
let network      = null;
let nodesDS      = null;   // kept at module level for live node updates
let members      = [];
let relations    = [];
let selected     = null;
let adminMode    = false;
let ctxTarget    = null;
let posCache     = (() => {   // seed from saved layout (localStorage) on boot
  try { return JSON.parse(localStorage.getItem('familyTreeLayout') || '{}'); } catch { return {}; }
})();

/* ══════════════════════════════════════════════
   DATA  ── Supabase queries
══════════════════════════════════════════════ */
async function loadTree() {
  if (!db) return;
  // Snapshot current positions so manual drags survive a reload
  if (network) {
    const pos = network.getPositions();
    members.forEach(m => { if (pos[m.id]) posCache[m.id] = pos[m.id]; });
  }
  try {
    const [{ data: mem, error: e1 }, { data: rel, error: e2 }] = await Promise.all([
      db.from('members').select('*').order('name'),
      db.from('relationships').select('*'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    members   = mem   || [];
    relations = rel   || [];
    renderSidebar();
    renderTree();
    updateHeader();
  } catch (err) {
    toast('Failed to load tree: ' + (err.message || err), 'error');
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function renderSidebar(filter = '') {
  const list  = qs('#memberList');
  const q     = filter.toLowerCase();
  const shown = members.filter(m => m.name.toLowerCase().includes(q));

  if (!shown.length) {
    list.innerHTML = `<div class="sidebar-empty">${filter ? 'No results found' : 'No members yet'}</div>`;
    return;
  }
  list.innerHTML = shown.map(m => `
    <div class="member-item ${selected === m.id ? 'active' : ''}"
         data-id="${m.id}" onclick="pickMember('${m.id}')">
      ${avatarEl(m, 34)}
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        <div class="member-dates">${dateRange(m.birth_date, m.death_date)}</div>
      </div>
    </div>`).join('');
}

function updateHeader() {
  const n = members.length;
  qs('#memberCount').textContent = n ? `${n} member${n !== 1 ? 's' : ''}` : '';
}

/* ══════════════════════════════════════════════
   TREE  ── vis-network
══════════════════════════════════════════════ */
function computeLevels() {
  const levels   = {};
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
    pcRels.filter(r => r.person1_id === id)
          .forEach(r => queue.push({ id: r.person2_id, level: level + 1 }));
  }

  // Align spouses to the same generation
  const spouseRels = relations.filter(r => r.type === 'spouse');
  let changed = true;
  while (changed) {
    changed = false;
    spouseRels.forEach(r => {
      const max = Math.max(levels[r.person1_id] ?? 0, levels[r.person2_id] ?? 0);
      if ((levels[r.person1_id] ?? 0) !== max) { levels[r.person1_id] = max; changed = true; }
      if ((levels[r.person2_id] ?? 0) !== max) { levels[r.person2_id] = max; changed = true; }
    });
  }
  return levels;
}

// Computes initial x/y positions for all members — parents above, children below.
// Spouses are kept adjacent within the same row so the union dot sits neatly between them.
function computeInitialPositions(spouseRels) {
  const levels   = computeLevels();
  const spouseOf = {};
  spouseRels.forEach(r => {
    spouseOf[r.person1_id] = r.person2_id;
    spouseOf[r.person2_id] = r.person1_id;
  });

  // Group member IDs by generation level
  const byLevel = {};
  members.forEach(m => {
    const l = levels[m.id] ?? 0;
    if (!byLevel[l]) byLevel[l] = [];
    byLevel[l].push(m.id);
  });

  const NODE_SEP  = 220;   // horizontal px between nodes in the same row
  const LEVEL_SEP = 180;   // vertical px between generations

  const positions = {};
  Object.keys(byLevel).map(Number).sort((a, b) => a - b).forEach(lvl => {
    const ids = byLevel[lvl];
    const y   = lvl * LEVEL_SEP;

    // Re-order so spouses appear side-by-side
    const ordered = [];
    const added   = new Set();
    ids.forEach(id => {
      if (added.has(id)) return;
      ordered.push(id); added.add(id);
      const sp = spouseOf[id];
      if (sp && ids.includes(sp) && !added.has(sp)) { ordered.push(sp); added.add(sp); }
    });

    // Centre the row horizontally around x = 0
    const totalW = (ordered.length - 1) * NODE_SEP;
    ordered.forEach((id, i) => { positions[id] = { x: i * NODE_SEP - totalW / 2, y }; });
  });

  return positions;
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

  const visNodes   = [];
  const visEdges   = [];
  const pcRels     = relations.filter(r => r.type === 'parent-child');
  const spouseRels = relations.filter(r => r.type === 'spouse');

  // Compute tree positions (posCache overrides for user-dragged nodes)
  const initPos = computeInitialPositions(spouseRels);

  // ── Member nodes — positioned directly, no physics ──
  members.forEach(m => {
    const pos = posCache[m.id] || initPos[m.id] || { x: 0, y: 0 };
    visNodes.push({
      id:          m.id,
      x:           pos.x,
      y:           pos.y,
      label:       nodeLabel(m),
      shape:       'circularImage',
      image:       m.photo || initialsDataUrl(m),
      brokenImage: initialsDataUrl(m),
      size:        32,
      borderWidth: (selected === m.id || m.locked) ? 3 : 2,
      color: { border: nodeBorder(m), highlight: { border: '#f59e0b', background: '#fef3c7' } },
      font:  { size: 11, face: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', color: '#1e293b' },
      title: nodeTooltip(m),
    });
  });

  const handledPc = new Set();

  // ── Spouse pairs → union node pattern ──
  //   [Parent1] ──●── [Parent2]
  //               │
  //            [Child]
  spouseRels.forEach(sr => {
    const p1 = sr.person1_id;
    const p2 = sr.person2_id;

    const p1Kids = new Set(pcRels.filter(r => r.person1_id === p1).map(r => r.person2_id));
    const p2Kids = new Set(pcRels.filter(r => r.person1_id === p2).map(r => r.person2_id));
    const shared = [...p1Kids].filter(c => p2Kids.has(c));

    if (shared.length > 0) {
      const uid  = `union::${sr.id}`;
      // Union dot sits exactly between the two parents
      const p1pos = posCache[p1] || initPos[p1] || { x: 0, y: 0 };
      const p2pos = posCache[p2] || initPos[p2] || { x: 0, y: 0 };

      visNodes.push({
        id:    uid,
        x:     (p1pos.x + p2pos.x) / 2,
        y:     (p1pos.y + p2pos.y) / 2,
        label: '',
        shape: 'dot',
        size:  5,
        color: { background: '#ec4899', border: '#be185d',
                 highlight: { background: '#ec4899', border: '#be185d' } },
        title: '',
      });

      visEdges.push({
        id: `eu::p1::${sr.id}`, from: p1, to: uid,
        arrows: { to: { enabled: false } },
        color:  { color: '#ec4899' }, width: 2,
        smooth: { enabled: false },
      });
      visEdges.push({
        id: `eu::p2::${sr.id}`, from: p2, to: uid,
        arrows: { to: { enabled: false } },
        color:  { color: '#ec4899' }, width: 2,
        smooth: { enabled: false },
      });

      shared.forEach(childId => {
        visEdges.push({
          id:     `eu::c::${sr.id}::${childId}`,
          from:   uid,
          to:     childId,
          arrows: { to: { enabled: true, scaleFactor: 0.55 } },
          color:  { color: '#94a3b8', highlight: '#3b82f6' },
          width:  1.5,
          smooth: { enabled: false },
        });
        pcRels.forEach(r => {
          if (r.person2_id === childId && (r.person1_id === p1 || r.person1_id === p2))
            handledPc.add(r.id);
        });
      });

    } else {
      // Couple with no shared children → simple dashed line
      visEdges.push({
        id:     `es::${sr.id}`,
        from:   p1, to: p2,
        arrows: { to: { enabled: false } },
        dashes: true,
        color:  { color: '#ec4899', highlight: '#be185d' },
        width:  2,
        smooth: { enabled: false },
      });
    }
  });

  // ── Remaining parent→child edges (single parent, not in a union) ──
  pcRels.forEach(r => {
    if (handledPc.has(r.id)) return;
    visEdges.push({
      id:     `epc::${r.id}`,
      from:   r.person1_id,
      to:     r.person2_id,
      arrows: { to: { enabled: true, scaleFactor: 0.55 } },
      color:  { color: '#94a3b8', highlight: '#3b82f6' },
      width:  1.5,
      smooth: { enabled: false },
    });
  });

  nodesDS = new vis.DataSet(visNodes);
  const edgesDS = new vis.DataSet(visEdges);

  if (network) { network.destroy(); network = null; }
  network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, {
    layout:      { hierarchical: { enabled: false } },
    physics:     { enabled: false },
    interaction: { hover: true, tooltipDelay: 400, dragNodes: adminMode },
  });

  // Persist positions whenever the user drags a node
  network.on('dragEnd', ({ nodes: dragged }) => {
    if (!dragged.length) return;
    const pos = network.getPositions(dragged);
    dragged.forEach(id => {
      if (!String(id).startsWith('union::')) posCache[id] = pos[id];
    });
  });

  const isUnion = id => String(id).startsWith('union::');

  network.on('click', params => {
    hideCtxMenu();
    if (params.nodes.length) {
      if (!isUnion(params.nodes[0])) pickMember(params.nodes[0]);
    } else {
      deselect();
    }
  });
  network.on('doubleClick', params => {
    if (!params.nodes.length || isUnion(params.nodes[0])) return;
    const tgt = members.find(m => m.id === params.nodes[0]);
    if (tgt?.locked && !adminMode) { toast('This member is locked', 'warn'); return; }
    openEditModal(params.nodes[0]);
  });
  network.on('oncontext', params => {
    params.event.preventDefault();
    if (params.nodes.length && !isUnion(params.nodes[0])) {
      ctxTarget = params.nodes[0];
      showCtxMenu(params.event.clientX, params.event.clientY);
    }
  });

  // Long-press on mobile opens the context menu
  network.on('hold', params => {
    if (!isMobile()) return;
    if (params.nodes.length && !isUnion(params.nodes[0])) {
      ctxTarget = params.nodes[0];
      const rect = container.getBoundingClientRect();
      showCtxMenu(rect.left + params.pointer.DOM.x, rect.top + params.pointer.DOM.y);
    }
  });

  if (selected) network.selectNodes([selected]);
}

/* ══════════════════════════════════════════════
   SELECTION & DETAIL PANEL
══════════════════════════════════════════════ */
function pickMember(id) {
  selected = id;
  renderSidebar(qs('#searchInput').value);
  if (network) {
    network.selectNodes([id]);
    network.focus(id, { animation: { duration: 400 }, scale: 1.1 });
  }
  if (isMobile()) closeDrawer();
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

  const parents  = relatedOf(m.id, 'parent');
  const children = relatedOf(m.id, 'child');
  const spouses  = relatedOf(m.id, 'spouse');
  const gIcon    = { male: '♂', female: '♀', other: '⚧', unknown: '' }[m.gender] || '';
  const bgColor  = genderColor(m.gender);

  content.innerHTML = `
    <div class="detail-hero" style="background:${bgColor}22">
      ${m.photo
        ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}">`
        : `<div class="detail-hero-initials" style="background:${bgColor}">${initials(m.name)}</div>`}
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
      ${renderRelSection('Parents',  parents,  m.id, 'parent-child')}
      ${renderRelSection('Partners', spouses,  m.id, 'spouse')}
      ${renderRelSection('Children', children, m.id, 'parent-child')}
      <div class="detail-actions">
        ${(!m.locked || adminMode) ? `<button class="btn btn-outline btn-sm" onclick="openEditModal('${m.id}')">&#9998; Edit</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="openRelModal('${m.id}')">&#10133; Add Relation</button>
        ${(!m.locked || adminMode) ? `<button class="btn btn-danger btn-sm" onclick="confirmDelete('${m.id}')">&#10006; Delete</button>` : ''}
        ${adminMode ? `<button class="btn btn-sm ${m.locked ? 'btn-outline' : 'btn-ghost'}" onclick="toggleMemberLock('${m.id}')">${m.locked ? '&#128275; Unlock' : '&#128274; Lock'}</button>` : ''}
        ${m.locked && !adminMode ? `<span class="locked-badge">&#128274; Locked</span>` : ''}
      </div>
    </div>`;
  panel.classList.add('open');
}

function renderRelSection(title, people, fromId, type) {
  if (!people.length) return '';
  const rows = people.map(p => {
    const relId = findRelId(fromId, p.id, type);
    return `<div class="rel-row">
      <span class="rel-who" onclick="pickMember('${p.id}')">${esc(p.name)}</span>
      ${relId ? `<button class="rel-remove" title="Remove" onclick="removeRelation('${relId}')">&#10006;</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="detail-section"><h3>${title}</h3>${rows}</div>`;
}

function relatedOf(id, role) {
  if (role === 'spouse') {
    return relations
      .filter(r => r.type === 'spouse' && (r.person1_id === id || r.person2_id === id))
      .map(r => members.find(m => m.id === (r.person1_id === id ? r.person2_id : r.person1_id)))
      .filter(Boolean);
  }
  if (role === 'parent') {
    return relations
      .filter(r => r.type === 'parent-child' && r.person2_id === id)
      .map(r => members.find(m => m.id === r.person1_id)).filter(Boolean);
  }
  return relations
    .filter(r => r.type === 'parent-child' && r.person1_id === id)
    .map(r => members.find(m => m.id === r.person2_id)).filter(Boolean);
}

function findRelId(a, b, type) {
  return relations.find(r =>
    r.type === type &&
    ((r.person1_id === a && r.person2_id === b) || (r.person1_id === b && r.person2_id === a))
  )?.id ?? null;
}

/* ══════════════════════════════════════════════
   ADD / EDIT MEMBER
══════════════════════════════════════════════ */
function openAddModal() {
  qs('#modalTitle').textContent = 'Add Family Member';
  qs('#memberId').value         = '';
  qs('#memberForm').reset();
  qs('#removePhotoBtn').style.display = 'none';
  setPhotoThumb(null);
  // Populate the "connect to" selector with current members
  const opts = members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  qs('#relLink').innerHTML = `<option value="">&#8212; No connection &#8212;</option>` + opts;
  qs('#relLinkRow').style.display     = members.length ? '' : 'none';
  qs('#relLinkTypeRow').style.display = 'none';
  openOverlay('memberOverlay');
}

function openEditModal(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  if (m.locked && !adminMode) { toast('This member is locked', 'warn'); return; }
  qs('#modalTitle').textContent   = 'Edit Member';
  qs('#memberId').value           = id;
  qs('#memberName').value         = m.name;
  qs('#memberGender').value       = m.gender      || 'unknown';
  qs('#memberBirthDate').value    = m.birth_date  || '';
  qs('#memberDeathDate').value    = m.death_date  || '';
  qs('#memberBirthPlace').value   = m.birth_place || '';
  qs('#memberBio').value          = m.bio         || '';
  qs('#removePhotoBtn').style.display = m.photo ? 'inline-flex' : 'none';
  setPhotoThumb(m.photo);
  qs('#relLinkRow').style.display     = 'none';
  qs('#relLinkTypeRow').style.display = 'none';
  openOverlay('memberOverlay');
}

async function saveMember(e) {
  e.preventDefault();
  const id   = qs('#memberId').value;
  const name = qs('#memberName').value.trim();
  if (!name) { qs('#memberName').focus(); return; }

  const btn = qs('#saveMemberBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    // ── Handle photo upload to Supabase Storage ──
    let photoUrl = null;
    const existingMember = id ? members.find(m => m.id === id) : null;
    const photoFile      = qs('#photoInput').files[0];

    if (photoFile) {
      const ext  = photoFile.name.split('.').pop().toLowerCase();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await db.storage.from('photos').upload(path, photoFile, { contentType: photoFile.type });
      if (upErr) throw upErr;
      photoUrl = db.storage.from('photos').getPublicUrl(path).data.publicUrl;
    } else if (id) {
      // Keep existing photo unless explicitly removed
      const thumbHasImg = !!qs('#photoThumb').querySelector('img');
      photoUrl = thumbHasImg ? (existingMember?.photo || null) : null;
    }

    const payload = {
      name,
      gender:      qs('#memberGender').value,
      birth_date:  qs('#memberBirthDate').value  || null,
      death_date:  qs('#memberDeathDate').value  || null,
      birth_place: qs('#memberBirthPlace').value || null,
      bio:         qs('#memberBio').value        || null,
      photo:       photoUrl,
      updated_at:  new Date().toISOString(),
    };

    let saved;
    if (id) {
      const { data, error } = await db.from('members').update(payload).eq('id', id).select().single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await db.from('members').insert(payload).select().single();
      if (error) throw error;
      saved = data;
    }

    // ── Optional: link to an existing family member (new members only) ──
    let relWarning = null;
    const relLinkId   = qs('#relLink').value;
    const relLinkType = qs('#relLinkType').value;
    if (!id && relLinkId) {
      const newId = saved.id;
      if (relLinkType === 'sibling-of') {
        // Share the same parents as the selected sibling
        const sibParents = relations
          .filter(r => r.type === 'parent-child' && r.person2_id === relLinkId)
          .map(r => r.person1_id);
        for (const pid of sibParents) await insertRel(pid, newId, 'parent-child');
        if (!sibParents.length) relWarning = "Sibling's parents aren't recorded yet — link parents manually";
      } else if (relLinkType === 'child-of') {
        await insertRel(relLinkId, newId, 'parent-child');
      } else if (relLinkType === 'parent-of') {
        await insertRel(newId, relLinkId, 'parent-child');
      } else {
        await insertRel(newId, relLinkId, 'spouse');
      }
    }

    closeOverlay('memberOverlay');
    toast(relWarning || `${name} ${id ? 'updated' : 'added'}!`, relWarning ? 'warn' : 'success');
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
  if (m.locked && !adminMode) { toast('This member is locked', 'warn'); return; }
  if (!confirm(`Delete "${m.name}"? All their relationships will also be removed.`)) return;
  try {
    const { error } = await db.from('members').delete().eq('id', id);
    if (error) throw error;
    toast(`${m.name} removed`, 'success');
    deselect();
    await loadTree();
  } catch (err) {
    toast(err.message || 'Failed to delete', 'error');
  }
}

/* ══════════════════════════════════════════════
   RELATIONSHIPS
══════════════════════════════════════════════ */
function openRelModal(defaultId = null) {
  const opts = members.map(m =>
    `<option value="${m.id}" ${m.id === defaultId ? 'selected' : ''}>${esc(m.name)}</option>`
  ).join('');
  const optsNone = `<option value="">— None —</option>` + opts;

  // Populate all selectors
  qs('#relParent1').innerHTML = opts;
  qs('#relParent2').innerHTML = optsNone;
  qs('#relChild').innerHTML   = opts;
  qs('#relPerson1').innerHTML = opts;
  qs('#relPerson2').innerHTML = opts;

  // Set defaults
  if (defaultId) {
    qs('#relParent1').value  = defaultId;
    qs('#relPerson1').value  = defaultId;
  }
  qs('#relParent2').value = ''; // default Parent 2 to none

  const other = members.find(m => m.id !== defaultId);
  if (other) {
    qs('#relChild').value   = other.id;
    qs('#relPerson2').value = other.id;
  }

  updateRelLabels();
  openOverlay('relOverlay');
}

function updateRelLabels() {
  const isPC = qs('#relType').value === 'parent-child';
  qs('#pcFields').style.display     = isPC ? '' : 'none';
  qs('#spouseFields').style.display = isPC ? 'none' : '';
}

async function saveRelation() {
  const type = qs('#relType').value;
  const btn  = qs('#saveRelBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (type === 'spouse') {
      const p1 = qs('#relPerson1').value;
      const p2 = qs('#relPerson2').value;
      if (p1 === p2) { toast('Choose two different people', 'warn'); return; }
      await insertRel(p1, p2, 'spouse');

    } else {
      const parent1 = qs('#relParent1').value;
      const parent2 = qs('#relParent2').value; // may be empty
      const child   = qs('#relChild').value;

      if (parent1 === child)              { toast('Parent 1 and Child must be different people', 'warn'); return; }
      if (parent2 && parent2 === child)   { toast('Parent 2 and Child must be different people', 'warn'); return; }
      if (parent2 && parent2 === parent1) { toast('Parent 1 and Parent 2 must be different people', 'warn'); return; }

      await insertRel(parent1, child, 'parent-child');
      if (parent2) await insertRel(parent2, child, 'parent-child');
    }

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

async function insertRel(p1, p2, type) {
  const { error } = await db.from('relationships').insert({ person1_id: p1, person2_id: p2, type });
  if (error) throw error;
}

async function removeRelation(id) {
  if (!confirm('Remove this relationship?')) return;
  try {
    const { error } = await db.from('relationships').delete().eq('id', id);
    if (error) throw error;
    toast('Relationship removed', 'success');
    await loadTree();
    if (selected) showDetail(members.find(m => m.id === selected));
  } catch (err) {
    toast(err.message || 'Failed to remove', 'error');
  }
}

/* ══════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════ */
function showCtxMenu(x, y) {
  const menu = qs('#ctxMenu');
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
  const m = members.find(m => m.id === ctxTarget);
  // Show Edit/Delete only when editable
  qs('#ctxEdit').style.display   = (!m?.locked || adminMode) ? '' : 'none';
  qs('#ctxDelete').style.display = (!m?.locked || adminMode) ? '' : 'none';
  // Show Lock/Unlock only in admin mode
  qs('#ctxLock').style.display   = adminMode ? '' : 'none';
  qs('#ctxLock').innerHTML       = m?.locked ? '&#128275; Unlock member' : '&#128274; Lock member';
  menu.classList.add('open');
}
function hideCtxMenu() { qs('#ctxMenu').classList.remove('open'); }

qs('#ctxEdit').onclick     = () => { hideCtxMenu(); if (ctxTarget) openEditModal(ctxTarget); };
qs('#ctxRelation').onclick = () => { hideCtxMenu(); if (ctxTarget) openRelModal(ctxTarget); };
qs('#ctxDelete').onclick   = () => { hideCtxMenu(); if (ctxTarget) confirmDelete(ctxTarget); };
qs('#ctxLock').onclick     = () => { hideCtxMenu(); if (ctxTarget) toggleMemberLock(ctxTarget); };
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
  qs('#photoThumb').innerHTML = src
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
   MOBILE SIDEBAR DRAWER
══════════════════════════════════════════════ */
function openDrawer() {
  qs('#sidebar').classList.add('drawer-open');
  qs('#sidebarBackdrop').classList.add('visible');
}
function closeDrawer() {
  qs('#sidebar').classList.remove('drawer-open');
  qs('#sidebarBackdrop').classList.remove('visible');
}
function isMobile() { return window.innerWidth <= 768; }

qs('#sidebarToggle').addEventListener('click', () => {
  qs('#sidebar').classList.contains('drawer-open') ? closeDrawer() : openDrawer();
});
qs('#sidebarBackdrop').addEventListener('click', closeDrawer);

/* ══════════════════════════════════════════════
   EVENT WIRING
══════════════════════════════════════════════ */
qs('#adminBtn').onclick      = toggleAdminMode;
qs('#addMemberBtn').onclick  = openAddModal;
qs('#emptyAddBtn').onclick   = openAddModal;
qs('#refreshBtn').onclick    = loadTree;
qs('#closePanelBtn').onclick = deselect;

qs('#closeModalBtn').onclick  = () => closeOverlay('memberOverlay');
qs('#cancelModalBtn').onclick = () => closeOverlay('memberOverlay');
qs('#memberForm').addEventListener('submit', saveMember);

qs('#closeRelBtn').onclick  = () => closeOverlay('relOverlay');
qs('#cancelRelBtn').onclick = () => closeOverlay('relOverlay');
qs('#saveRelBtn').onclick   = saveRelation;
qs('#relType').addEventListener('change', updateRelLabels);

qs('#searchInput').addEventListener('input', e => renderSidebar(e.target.value));

qs('#fitBtn').onclick = () => network?.fit({ animation: { duration: 500 } });

qs('#layoutBtn').onclick = () => {
  posCache = {};
  localStorage.removeItem('familyTreeLayout');
  renderTree();
  network?.fit({ animation: { duration: 500 } });
  toast('Layout reset to auto', '');
};

qs('#saveLayoutBtn').onclick = () => {
  if (!network || !members.length) { toast('Nothing to save', 'warn'); return; }
  const pos      = network.getPositions();
  const snapshot = {};
  members.forEach(m => { if (pos[m.id]) snapshot[m.id] = pos[m.id]; });
  localStorage.setItem('familyTreeLayout', JSON.stringify(snapshot));
  posCache = { ...snapshot };
  toast('Layout saved as default!', 'success');
};

qs('#relLink').addEventListener('change', () => {
  qs('#relLinkTypeRow').style.display = qs('#relLink').value ? '' : 'none';
});

['memberOverlay', 'relOverlay'].forEach(id => {
  qs(`#${id}`).addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay(id); });
});

/* ══════════════════════════════════════════════
   ADMIN MODE
══════════════════════════════════════════════ */
function toggleAdminMode() {
  if (adminMode) {
    adminMode = false;
    updateAdminUI();
    toast('Admin mode off', '');
  } else {
    const code = prompt('Enter admin passcode:');
    if (code === null) return;          // cancelled
    if (code === '1993') {
      adminMode = true;
      updateAdminUI();
      toast('Admin mode on', 'success');
    } else {
      toast('Incorrect passcode', 'error');
    }
  }
}

function updateAdminUI() {
  const btn = qs('#adminBtn');
  btn.innerHTML = adminMode ? '&#128275;' : '&#128274;';
  btn.title     = adminMode ? 'Admin mode ON — click to exit' : 'Admin login';
  btn.classList.toggle('admin-active', adminMode);

  // Layout controls only available to admin
  qs('#saveLayoutBtn').style.display = adminMode ? '' : 'none';
  qs('#layoutBtn').style.display     = adminMode ? '' : 'none';

  // Toggle node dragging on the live network (no re-render needed)
  if (network) network.setOptions({ interaction: { dragNodes: adminMode } });

  // Refresh node borders to show/hide lock indicators
  if (nodesDS) {
    members.forEach(m => nodesDS.update({
      id:          m.id,
      borderWidth: (selected === m.id || m.locked) ? 3 : 2,
      color:       { border: nodeBorder(m), highlight: { border: '#f59e0b', background: '#fef3c7' } },
    }));
  }

  // Refresh detail panel so Edit/Delete/Lock buttons update immediately
  if (selected) {
    const m = members.find(x => x.id === selected);
    if (m) showDetail(m);
  }
}

async function toggleMemberLock(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  try {
    const { error } = await db.from('members')
      .update({ locked: !m.locked, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    toast(`${m.name} ${m.locked ? 'unlocked' : 'locked'}`, 'success');
    await loadTree();
    if (selected === id) showDetail(members.find(x => x.id === id));
  } catch (err) {
    toast(err.message || 'Failed to update lock', 'error');
  }
}

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function qs(sel) { return document.querySelector(sel); }

function genderColor(g)  { return { male:'#3b82f6', female:'#ec4899', other:'#8b5cf6' }[g] || '#64748b'; }
function genderBorder(g) { return { male:'#2563eb', female:'#be185d', other:'#7c3aed' }[g] || '#475569'; }
function nodeBorder(m)   { return m.locked ? '#d97706' : genderBorder(m.gender); }  // amber = locked

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
  const s = `width:${size}px;height:${size}px;`;
  if (m.photo)
    return `<div class="avatar ${m.gender}" style="${s}"><img src="${esc(m.photo)}" alt=""></div>`;
  return `<div class="avatar ${m.gender}" style="${s}">${initials(m.name)}</div>`;
}

function nodeLabel(m) {
  const name  = m.name.length > 18 ? m.name.slice(0, 16) + '…' : m.name;
  const range = dateRange(m.birth_date, m.death_date);
  return range ? `${name}\n${range}` : name;
}

function nodeTooltip(m) {
  const div = document.createElement('div');
  div.style.cssText = 'padding:8px 10px;font-size:13px;max-width:220px;line-height:1.5';
  div.innerHTML = `<strong>${esc(m.name)}</strong><br>${dateRange(m.birth_date, m.death_date) || ''}
    ${m.bio ? `<hr style="margin:.4rem 0;border:0;border-top:1px solid #ddd">` + esc(m.bio.slice(0, 120)) + (m.bio.length > 120 ? '…' : '') : ''}`;
  return div;
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }); }
  catch { return d; }
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
if (isConfigured) { updateAdminUI(); loadTree(); }
