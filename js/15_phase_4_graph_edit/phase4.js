// ============================================================
// Axon — Phase 4: derived UX features (§6, no schema change*)
// Drop-in ES module. Copy to Axon/js/phase4.js and load it
// AFTER app.js:  <script type="module" src="js/phase4.js"></script>
// (*the node-flag DB sync needs the optional flagged column — see sql/)
// ============================================================
import * as state from './state.js';
import { showToast, navigateTo } from './ui.js';
import { renderGraph, fitToScreen, loadAssemblyData } from './graph.js';
import { db } from './database.js';

const I = (p, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px"><path d="${p}"/></svg>`;
const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.5-4.5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5 5l1.4 1.4 M17.6 17.6 19 19 M19 5l-1.4 1.4 M6.4 17.6 5 19',
  moon: 'M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z',
  target: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  alert: 'M12 3.5 21.5 20H2.5z M12 10v4 M12 17.4h.01',
  tidy: 'M4 6h16 M7 12h10 M10 18h4',
  rollup: 'M12 20V8 M7.5 12 12 7.5 16.5 12 M5 4h14',
  close: 'M6 6l12 12 M18 6 6 18',
  chevright: 'M9 5l7 7-7 7'
};
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- shared graph helpers ----------
function childToParents() {
  const m = {};
  state.links.forEach(l => { if (!l.deleted) (m[l.child_id] = m[l.child_id] || []).push(l.parent_id); });
  return m;
}
function parentlessIds() {
  const hasParent = new Set(state.links.filter(l => !l.deleted).map(l => l.child_id));
  return state.nodes.filter(n => !n.deleted && !hasParent.has(n.id)).map(n => n.id);
}
function mainRootId() {
  const roots = parentlessIds();
  if (roots.length <= 1) return roots[0] || null;
  const p2c = {};
  state.links.forEach(l => { if (!l.deleted) (p2c[l.parent_id] = p2c[l.parent_id] || []).push(l.child_id); });
  const count = id => { let n = 0; const st = [id], seen = new Set(); while (st.length) { const c = st.pop(); (p2c[c] || []).forEach(k => { if (!seen.has(k)) { seen.add(k); n++; st.push(k); } }); } return n; };
  return roots.slice().sort((a, b) => count(b) - count(a))[0];
}
function nodeGroups() { return d3.selectAll('#treeSvg g.node'); }
function linkGroups() { return d3.selectAll('#treeSvg .link-group'); }
function linkIds(d) { return { p: d?.source?.id ?? d?.parent_id, c: d?.target?.id ?? d?.child_id }; }

function centerOnNode(node) {
  const svgEl = document.getElementById('treeSvg');
  const zb = window._axGetZoom && window._axGetZoom();
  if (zb && node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
    const k = Math.max(0.8, d3.zoomTransform(svgEl).k);
    const t = d3.zoomIdentity.translate(svgEl.clientWidth / 2 - node.x * k, svgEl.clientHeight / 2 - node.y * k).scale(k);
    d3.select(svgEl).transition().duration(400).call(zb.transform, t);
  } else fitToScreen();
}

function jumpToNode(nodeId) {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;
  // widen the level filter if it hides the node
  if (state.currentLevelFilter !== 'all' && (node.level || 1) > parseInt(state.currentLevelFilter)) {
    state.setLevelFilter('all');
    const sel = document.getElementById('levelFilter'); if (sel) sel.value = 'all';
  }
  // expand collapsed ancestors
  const c2p = childToParents(); const seen = new Set(); const st = [nodeId];
  while (st.length) {
    const id = st.pop(); if (seen.has(id)) continue; seen.add(id);
    (c2p[id] || []).forEach(p => { if (state.collapsedNodes.has(p)) state.toggleCollapsedNode(p); st.push(p); });
  }
  renderGraph();
  requestAnimationFrame(() => {
    const g = nodeGroups().filter(d => d && d.id === nodeId);
    const d = g.empty() ? node : g.datum();
    centerOnNode(d);
    g.classed('ax-jump', true);
    setTimeout(() => nodeGroups().classed('ax-jump', false), 2400);
  });
}

// ============================================================
// 1) THEME TOGGLE  (Datum ↔ Blueprint dark)
// ============================================================
const THEME_KEY = 'axon_theme';
function applyTheme(t) {
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const btn = document.getElementById('axThemeBtn');
  if (btn) { btn.innerHTML = I(t === 'dark' ? ICONS.sun : ICONS.moon, 15); btn.title = t === 'dark' ? 'Light theme' : 'Dark theme'; }
}
function initTheme() {
  const right = document.getElementById('dbIndicator')?.parentElement; if (!right) return;
  const btn = document.createElement('button');
  btn.className = 'header-btn'; btn.id = 'axThemeBtn'; btn.style.padding = '4px 8px';
  btn.onclick = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
    if (state.currentPage === 'tree' && state.nodes.length) renderGraph();
  };
  right.insertBefore(btn, document.getElementById('dbIndicator'));
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
}

// ============================================================
// 2) ⌘K COMMAND PALETTE — search + where-used + jump-to-node
// ============================================================
let _cmdkEl = null, _cmdkRows = [], _cmdkHi = 0, _dbTimer = null, _dbHits = [], _asmNames = {};
function initCmdk() {
  const right = document.getElementById('dbIndicator')?.parentElement;
  if (right) {
    const b = document.createElement('button');
    b.className = 'header-btn'; b.style.padding = '4px 8px';
    b.innerHTML = I(ICONS.search, 15) + '<kbd class="ax-kbd">⌘K</kbd>'; b.title = 'Search (⌘K)';
    b.onclick = openCmdk;
    right.insertBefore(b, right.firstChild);
  }
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); _cmdkEl?.classList.contains('open') ? closeCmdk() : openCmdk(); }
    if (e.key === 'Escape' && _cmdkEl?.classList.contains('open')) closeCmdk();
  }, true);
  _cmdkEl = document.createElement('div');
  _cmdkEl.className = 'axe-cmdk-scrim'; _cmdkEl.id = 'axCmdk';
  _cmdkEl.innerHTML = `<div class="axe-cmdk" role="dialog" aria-label="Search">
    <div class="axe-cmdk-input">${I(ICONS.search, 16)}<input id="axCmdkInput" type="text" placeholder="Search assemblies, nodes, part numbers…" autocomplete="off"><kbd>esc</kbd></div>
    <div class="axe-cmdk-list" id="axCmdkList"></div>
    <div class="axe-cmdk-foot"><kbd>↑↓</kbd> navigate <kbd>↵</kbd> jump — part hits outside this assembly show <span class="usedin">where-used</span></div>
  </div>`;
  _cmdkEl.addEventListener('mousedown', e => { if (e.target === _cmdkEl) closeCmdk(); });
  document.body.appendChild(_cmdkEl);
  const inp = _cmdkEl.querySelector('#axCmdkInput');
  inp.addEventListener('input', () => cmdkQuery(inp.value));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); _cmdkRows[_cmdkHi]?.action(); }
  });
}
function openCmdk() {
  _cmdkEl.classList.add('open');
  const inp = _cmdkEl.querySelector('#axCmdkInput');
  inp.value = ''; _dbHits = []; cmdkQuery(''); setTimeout(() => inp.focus(), 30);
}
function closeCmdk() { _cmdkEl.classList.remove('open'); }
function cmdkMove(d) {
  if (!_cmdkRows.length) return;
  _cmdkHi = (_cmdkHi + d + _cmdkRows.length) % _cmdkRows.length;
  cmdkPaint();
}
function cmdkQuery(q) {
  q = q.trim().toLowerCase();
  const rows = [];
  const match = s => s && String(s).toLowerCase().includes(q);
  // assemblies in the loaded list
  state.assemblies.filter(a => !q || match(a.name)).slice(0, 6).forEach(a => rows.push({
    group: 'Assemblies', label: esc(a.name), meta: a.id === state.currentAssemblyId ? 'current' : '',
    action: async () => { closeCmdk(); state.setCurrentAssembly(a.id, a.name); navigateTo('tree'); const s = document.getElementById('assemblySelect'); if (s) s.value = a.id; await loadAssemblyData(a.id); fitToScreen(); }
  }));
  // nodes in the current tree
  state.nodes.filter(n => !n.deleted && (!q || match(n.name) || match(n.part_number) || match(n.sequence_tag))).slice(0, 10).forEach(n => rows.push({
    group: 'This assembly', label: esc(n.name), pn: esc(n.part_number || ''), meta: `L${n.level || 1}`,
    action: () => { closeCmdk(); jumpToNode(n.id); }
  }));
  // where-used across the whole database (async)
  if (q.length >= 2) {
    clearTimeout(_dbTimer);
    _dbTimer = setTimeout(async () => {
      try {
        const { data } = await db.from('logi_nodes')
          .select('id,name,part_number,assembly_id')
          .or(`part_number.ilike.%${q}%,name.ilike.%${q}%`)
          .eq('deleted', false).limit(12);
        _dbHits = (data || []).filter(n => n.assembly_id !== state.currentAssemblyId);
        const missing = [...new Set(_dbHits.map(n => n.assembly_id))].filter(id => !_asmNames[id]);
        if (missing.length) {
          const { data: asms } = await db.from('logi_assemblies').select('id,name').in('id', missing);
          (asms || []).forEach(a => { _asmNames[a.id] = a.name; });
        }
        if (_cmdkEl.classList.contains('open')) cmdkQuery(_cmdkEl.querySelector('#axCmdkInput').value);
      } catch (e) { /* offline / RLS — local results still work */ }
    }, 260);
  } else _dbHits = [];
  _dbHits.slice(0, 8).forEach(n => rows.push({
    group: 'Where-used (other assemblies)', label: esc(n.name), pn: esc(n.part_number || ''),
    meta: `<span class="usedin">${esc(_asmNames[n.assembly_id] || 'assembly')}</span>`,
    action: async () => {
      closeCmdk();
      state.setCurrentAssembly(n.assembly_id, _asmNames[n.assembly_id] || '');
      navigateTo('tree');
      const s = document.getElementById('assemblySelect'); if (s) s.value = n.assembly_id;
      await loadAssemblyData(n.assembly_id);
      jumpToNode(n.id);
    }
  }));
  _cmdkRows = rows; _cmdkHi = 0; cmdkPaint();
}
function cmdkPaint() {
  const list = _cmdkEl.querySelector('#axCmdkList');
  if (!_cmdkRows.length) { list.innerHTML = '<div class="axe-cmdk-empty">Nothing found</div>'; return; }
  let html = '', lastGroup = null;
  _cmdkRows.forEach((r, i) => {
    if (r.group !== lastGroup) { html += `<div class="axe-cmdk-grouphead">${r.group}</div>`; lastGroup = r.group; }
    html += `<button class="axe-cmdk-row ${i === _cmdkHi ? 'hi' : ''}" data-i="${i}">
      <span class="ic">${I(r.group === 'Assemblies' ? 'M12 4 3 9l9 5 9-5-9-5z M3 14l9 5 9-5' : ICONS.target, 14)}</span>
      <span class="lbl">${r.label}${r.pn ? ` <span class="pn">${r.pn}</span>` : ''}</span>
      <span class="meta">${r.meta || ''}</span>
      <span class="go">${I(ICONS.chevright, 13)}</span></button>`;
  });
  list.innerHTML = html;
  list.querySelectorAll('.axe-cmdk-row').forEach(el => {
    el.onclick = () => _cmdkRows[+el.dataset.i]?.action();
    el.onmouseenter = () => { _cmdkHi = +el.dataset.i; cmdkPaint(); };
  });
}

// ============================================================
// 3) INTERACTIVE LEGEND — click a chip to isolate
// ============================================================
let _isolate = null; // {kind:'level'|'status'|'orphan', value}
function initLegend() {
  const sections = document.querySelectorAll('.legend .legend-section');
  if (sections.length < 2) return;
  const wire = (section, kind, values) => {
    section.querySelectorAll('.legend-item').forEach((item, i) => {
      if (!values[i]) return;
      item.classList.add('ax-clickable');
      item.title = 'Click to isolate';
      item.onclick = () => {
        const v = values[i];
        _isolate = (_isolate && _isolate.kind === kind && _isolate.value === v) ? null : { kind, value: v };
        paintLegendActive();
        applyOverlays();
      };
    });
  };
  wire(sections[0], 'level', [1, 2, 3, 4, 5, 6, 7, 8]);
  wire(sections[1], 'status', ['DONE', 'IN_PROGRESS', 'BLOCKED', 'ORPHAN']);
}
function paintLegendActive() {
  const sections = document.querySelectorAll('.legend .legend-section');
  const mark = (section, kind, values) => section?.querySelectorAll('.legend-item').forEach((item, i) =>
    item.classList.toggle('ax-active', !!_isolate && _isolate.kind === kind && _isolate.value === values[i]));
  mark(sections[0], 'level', [1, 2, 3, 4, 5, 6, 7, 8]);
  mark(sections[1], 'status', ['DONE', 'IN_PROGRESS', 'BLOCKED', 'ORPHAN']);
}
function nodeMatchesIsolate(d) {
  if (!_isolate || !d) return true;
  if (_isolate.kind === 'level') return _isolate.value === 8 ? (d.level || 1) >= 8 : (d.level || 1) === _isolate.value;
  if (_isolate.value === 'ORPHAN') { const root = mainRootId(); return (!d.goesInto || d.goesInto.length === 0) && d.id !== root; }
  return d.status === _isolate.value;
}

// ============================================================
// 4) STATUS ROLL-UP — derive parent status from children
// ============================================================
let _rollup = false; const _origStatus = new Map();
const ROLL_RANK = { BLOCKED: 4, IN_PROGRESS: 3, REVIEW: 2, ON_HOLD: 2, NOT_STARTED: 1, DONE: 0 };
function toggleRollup() {
  _rollup = !_rollup;
  document.getElementById('axRollupBtn')?.classList.toggle('ax-on', _rollup);
  if (_rollup) {
    _origStatus.clear();
    const p2c = {};
    state.links.forEach(l => { if (!l.deleted) (p2c[l.parent_id] = p2c[l.parent_id] || []).push(l.child_id); });
    const derived = new Map();
    const calc = (id, seen) => {
      if (derived.has(id)) return derived.get(id);
      if (seen.has(id)) return 'NOT_STARTED';
      seen.add(id);
      const node = state.nodes.find(n => n.id === id);
      const kids = (p2c[id] || []).filter(k => state.nodes.some(n => n.id === k && !n.deleted));
      let st = node?.status || 'NOT_STARTED';
      if (kids.length) {
        st = kids.map(k => calc(k, seen)).reduce((a, b) => (ROLL_RANK[b] ?? 1) > (ROLL_RANK[a] ?? 1) ? b : a, 'DONE');
      }
      derived.set(id, st); return st;
    };
    state.nodes.forEach(n => { if (!n.deleted) calc(n.id, new Set()); });
    state.nodes.forEach(n => {
      const d = derived.get(n.id);
      if (d && d !== n.status) { _origStatus.set(n.id, n.status); n.status = d; }
    });
    showToast(`Roll-up on — ${_origStatus.size} parent status${_origStatus.size === 1 ? '' : 'es'} derived (view only)`, 'info');
  } else {
    _origStatus.forEach((st, id) => { const n = state.nodes.find(x => x.id === id); if (n) n.status = st; });
    _origStatus.clear();
    showToast('Roll-up off — original statuses restored', 'info');
  }
  renderGraph();
}

// ============================================================
// 5) CRITICAL PATH — deepest blocked node → root
// ============================================================
let _critPath = null; // {nodes:Set, pairs:Set('p→c')}
function toggleCritical() {
  if (_critPath) { _critPath = null; }
  else {
    const blocked = state.nodes.filter(n => !n.deleted && n.status === 'BLOCKED');
    if (!blocked.length) { showToast('No blocked nodes — no critical path', 'info'); return; }
    const deepest = blocked.slice().sort((a, b) => (b.level || 1) - (a.level || 1))[0];
    const c2p = childToParents();
    const ids = new Set(); const pairs = new Set();
    let cur = deepest.id; ids.add(cur);
    const guard = new Set();
    while (c2p[cur]?.length && !guard.has(cur)) {
      guard.add(cur);
      const parent = c2p[cur][0];
      pairs.add(parent + '→' + cur); ids.add(parent); cur = parent;
    }
    blocked.forEach(b => ids.add(b.id));
    _critPath = { nodes: ids, pairs };
    showToast(`Critical path: ${esc(deepest.name)} → root (${ids.size} nodes)`, 'warning');
  }
  document.getElementById('axCritBtn')?.classList.toggle('ax-on', !!_critPath);
  applyOverlays();
}

// ============================================================
// 6) AUTO-TIDY — recompute clean columns (locked nodes stay)
// ============================================================
function autoTidy() {
  if (!state.nodes.length) return;
  state.nodes.forEach(n => {
    if (!state.lockedNodes.has(n.id)) {
      n.tree_x = null; n.tree_y = null; n.treeX = null; n.treeY = null; n.fx = null; n.fy = null;
    }
  });
  renderGraph();
  setTimeout(() => fitToScreen(), 60);
  showToast('Auto-tidy: layout recomputed (Save Positions to persist)', 'info');
}

// ============================================================
// 7) ISSUES PANEL — orphans, missing P/N, qty 0, blocked
// ============================================================
function buildIssues() {
  const root = mainRootId();
  const orphans = state.nodes.filter(n => !n.deleted && parentlessIds().includes(n.id) && n.id !== root);
  const noPn = state.nodes.filter(n => !n.deleted && !(n.part_number || '').trim());
  const qty0 = state.nodes.filter(n => !n.deleted && n.qty === 0)
    .concat(state.links.filter(l => !l.deleted && l.qty === 0).map(l => state.nodes.find(n => n.id === l.child_id)).filter(Boolean));
  const blocked = state.nodes.filter(n => !n.deleted && n.status === 'BLOCKED');
  return [
    { title: 'Orphans', hint: 'no parent link', items: orphans },
    { title: 'Missing part №', hint: '', items: noPn },
    { title: 'Qty = 0', hint: '', items: [...new Set(qty0)] },
    { title: 'Blocked', hint: '', items: blocked }
  ];
}
function toggleIssues() {
  let panel = document.getElementById('axIssuesPanel');
  if (panel) { panel.remove(); document.getElementById('axIssuesBtn')?.classList.remove('ax-on'); return; }
  document.getElementById('axIssuesBtn')?.classList.add('ax-on');
  panel = document.createElement('div'); panel.id = 'axIssuesPanel';
  const secs = buildIssues();
  const total = secs.reduce((a, s) => a + s.items.length, 0);
  panel.innerHTML = `<div class="ax-issues-head"><span>Issues <span class="ax-issues-count">${total}</span></span>
    <button class="ax-issues-close" title="Close">${I(ICONS.close, 15)}</button></div>
    <div class="ax-issues-body">${total === 0 ? '<div class="ax-issues-empty">Nothing here — the tree is clean</div>' :
      secs.filter(s => s.items.length).map(s => `<div class="ax-issues-sec">
        <div class="ax-issues-sechead">${s.title} <span>${s.items.length}</span></div>
        ${s.items.map(n => `<button class="ax-issues-row" data-id="${n.id}">
          <span class="ax-issues-name">${esc(n.name)}</span>
          <span class="ax-issues-meta">${esc(n.part_number || '')} L${n.level || 1}</span></button>`).join('')}
      </div>`).join('')}</div>`;
  document.body.appendChild(panel);
  panel.querySelector('.ax-issues-close').onclick = toggleIssues;
  panel.querySelectorAll('.ax-issues-row').forEach(el => { el.onclick = () => jumpToNode(el.dataset.id); });
}

// ============================================================
// 8) ROLLED-UP BOM QTY — Ext = qty × Π(ancestor qty) × units
// ============================================================
let _bomInjecting = false;
function bomUnitsKey() { return `axon_bom_units_${state.currentAssemblyId}`; }
function getBomUnits() { try { return Math.max(1, parseInt(localStorage.getItem(bomUnitsKey())) || 1); } catch (e) { return 1; } }
function extQty(nodeId) {
  const nm = new Map(state.nodes.map(n => [n.id, n]));
  const c2p = childToParents();
  let q = nm.get(nodeId)?.qty || 1;
  let cur = c2p[nodeId]?.[0]; const seen = new Set([nodeId]);
  while (cur && !seen.has(cur)) { seen.add(cur); q *= nm.get(cur)?.qty || 1; cur = c2p[cur]?.[0]; }
  return q;
}
function injectBomExt() {
  const wrap = document.getElementById('bomTableWrap'); if (!wrap) return;
  _bomInjecting = true;
  const units = getBomUnits();
  // units control in the BOM toolbar
  const toolbar = document.getElementById('bomDeleteBtn')?.parentElement;
  if (toolbar && !document.getElementById('axBomUnits')) {
    const u = document.createElement('label');
    u.className = 'ax-bom-units';
    u.innerHTML = `Units <input id="axBomUnits" type="number" min="1" value="${units}">`;
    toolbar.insertBefore(u, toolbar.firstChild);
    u.querySelector('input').onchange = e => {
      try { localStorage.setItem(bomUnitsKey(), Math.max(1, parseInt(e.target.value) || 1)); } catch (err) {}
      injectBomExt();
    };
  } else if (document.getElementById('axBomUnits')) document.getElementById('axBomUnits').value = units;
  wrap.querySelectorAll('.bom2-part[data-id]').forEach(row => {
    const ext = extQty(row.dataset.id) * units;
    let tag = row.querySelector('.ax-ext');
    if (!tag) {
      tag = document.createElement('span'); tag.className = 'ax-ext'; tag.title = 'Extended qty (qty × ancestors × units)';
      const qtyEl = row.querySelector('.bom2-part-qty');
      qtyEl ? qtyEl.after(tag) : row.appendChild(tag);
    }
    tag.textContent = `= ${ext}`;
  });
  _bomInjecting = false;
}
function initBomExt() {
  const wrap = document.getElementById('bomTableWrap'); if (!wrap) return;
  new MutationObserver(() => { if (!_bomInjecting) requestAnimationFrame(injectBomExt); })
    .observe(wrap, { childList: true });
}

// ============================================================
// 9) NODE FLAG → DB (needs sql/add-flagged-column.sql)
// ============================================================
let _flagWarned = false, _flagSyncedFor = null;
function initFlagSync() {
  const orig = window.toggleFlag;
  if (typeof orig !== 'function') return;
  window.toggleFlag = id => {
    orig(id);
    const flagged = state.flaggedNodes.has(id);
    db.from('logi_nodes').update({ flagged }).eq('id', id).then(({ error }) => {
      if (error && !_flagWarned) {
        _flagWarned = true;
        console.warn('[phase4] flagged column missing — run sql/add-flagged-column.sql to share flags. Falling back to localStorage.', error.message);
      }
    });
  };
}
function syncFlagsFromDb() {
  if (state.currentAssemblyId === _flagSyncedFor) return;
  _flagSyncedFor = state.currentAssemblyId;
  let added = false;
  state.nodes.forEach(n => { if (n.flagged && !state.flaggedNodes.has(n.id)) { state.flaggedNodes.add(n.id); added = true; } });
  if (added) renderGraph();
}

// ============================================================
// OVERLAYS — reapplied after every graph re-render
// ============================================================
function applyOverlays() {
  const gs = nodeGroups(); if (gs.empty() && !_isolate && !_critPath) return;
  gs.classed('ax-dim', d => (_isolate && !nodeMatchesIsolate(d)) || (_critPath && !_isolate && !_critPath.nodes.has(d?.id)))
    .classed('ax-crit', d => !!_critPath && _critPath.nodes.has(d?.id));
  linkGroups().each(function (d) {
    const { p, c } = linkIds(d);
    const onPath = !!_critPath && _critPath.pairs.has(p + '→' + c);
    const dim = (_isolate && !(nodeMatchesIsolate(state.nodes.find(n => n.id === p)) && nodeMatchesIsolate(state.nodes.find(n => n.id === c))))
      || (_critPath && !_isolate && !onPath);
    d3.select(this).classed('ax-dim', dim).classed('ax-crit-link', onPath);
  });
}

// ============================================================
// HEADER BUTTONS + BOOT
// ============================================================
function initTreeButtons() {
  const bar = document.getElementById('treeControls'); if (!bar) return;
  const mk = (id, icon, label, title, fn) => {
    const b = document.createElement('button');
    b.className = 'header-btn'; b.id = id; b.title = title;
    b.innerHTML = I(icon) + label; b.onclick = fn;
    return b;
  };
  const anchor = document.getElementById('separatorToggleBtn');
  const btns = [
    mk('axTidyBtn', ICONS.tidy, 'Tidy', 'Auto-tidy layout (clean columns)', autoTidy),
    mk('axRollupBtn', ICONS.rollup, 'Roll up', 'Derive parent status from children (view only)', toggleRollup),
    mk('axCritBtn', ICONS.target, 'Crit path', 'Highlight critical path (deepest blocked → root)', toggleCritical),
    mk('axIssuesBtn', ICONS.alert, 'Issues', 'Orphans, missing part №, qty 0, blocked', toggleIssues)
  ];
  btns.reverse().forEach(b => anchor?.after(b));
}

function boot() {
  initTheme();
  initCmdk();
  initLegend();
  initTreeButtons();
  initBomExt();
  initFlagSync();
  const svg = document.getElementById('treeSvg');
  if (svg) new MutationObserver(() => requestAnimationFrame(() => { syncFlagsFromDb(); applyOverlays(); }))
    .observe(svg, { childList: true, subtree: true });
  console.log('Axon Phase 4 features loaded');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
