// ============================================================
// Axon — Phase 5: revision diff (§7 — needs logi_revisions table)
// Drop-in ES module. Copy to Axon/js/phase5.js and load it
// AFTER app.js (and phase4.js):
//   <script type="module" src="js/phase5.js"></script>
// Falls back to localStorage snapshots if the table is missing.
// ============================================================
import * as state from './state.js';
import { showToast } from './ui.js';
import { renderGraph, fitToScreen } from './graph.js';
import { db } from './database.js';

const I = (p, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px"><path d="${p}"/></svg>`;
const ICONS = {
  history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.6 4.6v3.5h3.5 M12 8.2v4.1l2.8 1.7',
  swap: 'M8 7h9 M14 4l3 3-3 3 M16 17H7 M10 14l-3 3 3 3',
  plus: 'M12 5v14 M5 12h14',
  trash: 'M4 7h16 M9 7V5h6v2 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  target: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
  close: 'M6 6l12 12 M18 6 6 18'
};
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STATUS_LBL = { DONE: 'Done', IN_PROGRESS: 'WIP', BLOCKED: 'Blocked', NOT_STARTED: 'Not started', REVIEW: 'Review', ON_HOLD: 'On hold' };
const stLbl = s => STATUS_LBL[s] || s || '—';

// ---------- snapshots ----------
function buildSnapshot() {
  return {
    v: 1,
    taken_at: new Date().toISOString(),
    nodes: state.nodes.filter(n => !n.deleted).map(n => ({
      id: n.id, name: n.name || '', part_number: n.part_number || null,
      sequence_tag: n.sequence_tag || null, status: n.status || 'NOT_STARTED', qty: n.qty ?? 1
    })),
    links: state.links.filter(l => !l.deleted).map(l => ({
      id: l.id, parent_id: l.parent_id, child_id: l.child_id,
      qty: l.qty ?? 1, fastener: l.fastener || null
    }))
  };
}

// ---------- diff ----------
function computeDiff(A, B) {
  const an = new Map(A.nodes.map(n => [n.id, n])), bn = new Map(B.nodes.map(n => [n.id, n]));
  const nameOf = id => (bn.get(id) || an.get(id) || {}).name || '?';
  const parentsOf = S => { const m = {}; S.links.forEach(l => { (m[l.child_id] = m[l.child_id] || []).push(l.parent_id); }); Object.values(m).forEach(a => a.sort()); return m; };
  const pa = parentsOf(A), pb = parentsOf(B);
  const added = [...bn.values()].filter(n => !an.has(n.id));
  const removed = [...an.values()].filter(n => !bn.has(n.id));
  const renamed = [], part = [], status = [], reparented = [];
  bn.forEach((b, id) => {
    const a = an.get(id); if (!a) return;
    if ((a.name || '') !== (b.name || '')) renamed.push({ id, from: a.name, to: b.name, pn: b.part_number });
    if ((a.part_number || '') !== (b.part_number || '')) part.push({ id, name: b.name, from: a.part_number, to: b.part_number });
    if ((a.status || '') !== (b.status || '')) status.push({ id, name: b.name, pn: b.part_number, from: a.status, to: b.status });
    if ((pa[id] || []).join() !== (pb[id] || []).join())
      reparented.push({ id, name: b.name, pn: b.part_number, from: (pa[id] || []).map(nameOf), to: (pb[id] || []).map(nameOf) });
  });
  const la = new Map(A.links.map(l => [l.parent_id + '→' + l.child_id, l]));
  const linkchg = [];
  B.links.forEach(b => {
    const a = la.get(b.parent_id + '→' + b.child_id); if (!a) return;
    if ((a.qty ?? 1) !== (b.qty ?? 1) || (a.fastener || '') !== (b.fastener || ''))
      linkchg.push({ id: b.child_id, name: nameOf(b.child_id), parent: nameOf(b.parent_id), aq: a.qty ?? 1, bq: b.qty ?? 1, af: a.fastener, bf: b.fastener });
  });
  const changedIds = new Set([...renamed, ...part, ...status, ...reparented, ...linkchg].map(r => r.id));
  return { added, removed, renamed, part, status, reparented, linkchg, changedIds };
}

// ---------- storage (DB with localStorage fallback) ----------
let _tableMissing = false, _warned = false;
const localKey = () => `axon_revisions_${state.currentAssemblyId}`;
function localList() { try { return JSON.parse(localStorage.getItem(localKey())) || []; } catch (e) { return []; } }
function localSave(list) { try { localStorage.setItem(localKey(), JSON.stringify(list.slice(-8))); } catch (e) { showToast('Local storage full — delete old local revisions', 'error'); } }
function warnMissing(err) {
  _tableMissing = true;
  if (!_warned) { _warned = true; console.warn('[phase5] logi_revisions missing — run sql/create-revisions-table.sql to share revisions. Using localStorage.', err?.message); }
}

async function listRevisions() {
  let rows = [];
  if (!_tableMissing) {
    const { data, error } = await db.from('logi_revisions')
      .select('id,label,note,created_at,created_by')
      .eq('assembly_id', state.currentAssemblyId)
      .order('created_at', { ascending: false });
    if (error) warnMissing(error); else rows = data || [];
  }
  const locals = localList().map(r => ({ id: r.id, label: r.label, note: r.note, created_at: r.created_at, created_by: r.created_by, local: true }));
  return [...locals.reverse(), ...rows].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

async function getSnapshot(id) {
  if (String(id).startsWith('local-')) return localList().find(r => r.id === id)?.snapshot || null;
  const { data, error } = await db.from('logi_revisions').select('snapshot').eq('id', id).single();
  if (error) { showToast('Failed to load snapshot', 'error'); return null; }
  return data?.snapshot || null;
}

async function saveRevision(label, note) {
  if (!state.nodes.filter(n => !n.deleted).length) { showToast('Nothing to snapshot — the tree is empty', 'warning'); return false; }
  const snapshot = buildSnapshot();
  const created_by = state.googleUser?.email || state.googleUser?.name || null;
  const row = { assembly_id: state.currentAssemblyId, label, note: note || null, created_by, snapshot };
  if (!_tableMissing) {
    const { error } = await db.from('logi_revisions').insert(row);
    if (!error) { showToast(`Revision ${esc(label)} saved — ${snapshot.nodes.length} nodes, ${snapshot.links.length} links`, 'success'); return true; }
    warnMissing(error);
  }
  localSave([...localList(), { ...row, id: 'local-' + Date.now(), created_at: new Date().toISOString() }]);
  showToast(`Revision ${esc(label)} saved locally (this browser only) — run the phase 5 SQL to share`, 'warning');
  return true;
}

async function deleteRevision(id) {
  if (String(id).startsWith('local-')) { localSave(localList().filter(r => r.id !== id)); return true; }
  const { error } = await db.from('logi_revisions').delete().eq('id', id);
  if (error) { showToast('Delete failed', 'error'); return false; }
  return true;
}

// ---------- jump / overlay ----------
function jumpToLiveNode(nodeId) {
  const g = d3.selectAll('#treeSvg g.node').filter(d => d && d.id === nodeId);
  if (g.empty()) { showToast('Node is hidden (filter or collapsed branch)', 'info'); return; }
  const d = g.datum();
  const svgEl = document.getElementById('treeSvg');
  const zb = window._axGetZoom && window._axGetZoom();
  if (zb && Number.isFinite(d.x) && Number.isFinite(d.y)) {
    const k = Math.max(0.8, d3.zoomTransform(svgEl).k);
    const t = d3.zoomIdentity.translate(svgEl.clientWidth / 2 - d.x * k, svgEl.clientHeight / 2 - d.y * k).scale(k);
    d3.select(svgEl).transition().duration(400).call(zb.transform, t);
  } else fitToScreen();
  g.classed('ax5-jump', true);
  setTimeout(() => d3.selectAll('#treeSvg g.node').classed('ax5-jump', false), 2400);
}

let _overlay = null; // {added:Set, changed:Set} while a vs-live diff is open
function applyOverlay() {
  const gs = d3.selectAll('#treeSvg g.node');
  gs.classed('ax5-added', d => !!_overlay && _overlay.added.has(d?.id))
    .classed('ax5-changed', d => !!_overlay && _overlay.changed.has(d?.id));
}

// ---------- revisions panel ----------
let _sel = []; // selected revision ids (max 2)
function nextLabel(rows) {
  let max = -1;
  rows.forEach(r => { const m = /^R(\d+)$/.exec(r.label || ''); if (m) max = Math.max(max, +m[1]); });
  return 'R' + String(max + 1).padStart(3, '0');
}
const fmtWhen = iso => iso ? iso.slice(0, 16).replace('T', ' ') : '';

async function renderPanel() {
  const panel = document.getElementById('ax5Panel'); if (!panel) return;
  const rows = await listRevisions();
  _sel = _sel.filter(id => rows.some(r => r.id === id));
  const foot = _sel.length === 2
    ? `<button id="ax5Compare">${I(ICONS.swap, 14)}Compare selected</button>`
    : _sel.length === 1
      ? `<button id="ax5Compare">${I(ICONS.swap, 14)}Compare with live tree</button>`
      : `<span class="ax5-hint">Select a revision to compare with live, or two to compare with each other</span>`;
  panel.innerHTML = `<div class="ax5-head"><span>Revisions <span class="ax5-n">${rows.length}</span></span>
    <button class="ax5-x" title="Close">${I(ICONS.close, 15)}</button></div>
    <div class="ax5-new">
      <input id="ax5Label" type="text" value="${esc(nextLabel(rows))}" title="Label">
      <input id="ax5Note" type="text" placeholder="Note (optional)">
      <button id="ax5Save">${I(ICONS.plus, 14)}Save revision of live tree</button>
    </div>
    <div class="ax5-body">${rows.length ? rows.map(r => `
      <button class="ax5-row ${r.local ? 'ax5-local' : ''} ${_sel.includes(r.id) ? 'ax5-sel' : ''}" data-id="${r.id}">
        <span class="ax5-tag">${esc(r.label || 'R?')}</span>
        <span class="ax5-meta">
          <span class="ax5-when">${esc(fmtWhen(r.created_at))}${r.local ? ' · local' : ''}${r.created_by ? ' · ' + esc(r.created_by.split('@')[0]) : ''}</span>
          ${r.note ? `<span class="ax5-note">${esc(r.note)}</span>` : ''}
        </span>
        <span class="ax5-del" data-del="${r.id}" title="Delete revision">${I(ICONS.trash, 14)}</span>
      </button>`).join('') : '<div class="ax5-empty">No revisions yet — save one to freeze the current tree as a comparison point</div>'}
    ${_tableMissing ? '<div class="ax5-localwarn">The <b>logi_revisions</b> table is missing — snapshots stay in this browser. Run <b>phase5/sql/create-revisions-table.sql</b> to share them.</div>' : ''}</div>
    <div class="ax5-foot">${foot}</div>`;
  panel.querySelector('.ax5-x').onclick = togglePanel;
  panel.querySelector('#ax5Save').onclick = async () => {
    const ok = await saveRevision(panel.querySelector('#ax5Label').value.trim() || nextLabel(rows), panel.querySelector('#ax5Note').value.trim());
    if (ok) renderPanel();
  };
  panel.querySelectorAll('.ax5-row').forEach(el => {
    el.onclick = e => {
      if (e.target.closest('.ax5-del')) return;
      const id = el.dataset.id;
      _sel = _sel.includes(id) ? _sel.filter(x => x !== id) : [..._sel, id].slice(-2);
      renderPanel();
    };
  });
  panel.querySelectorAll('.ax5-del').forEach(el => {
    el.onclick = async e => {
      e.stopPropagation();
      const row = rows.find(r => r.id === el.dataset.del);
      if (!confirm(`Delete revision ${row?.label || ''}? The snapshot cannot be recovered.`)) return;
      if (await deleteRevision(el.dataset.del)) renderPanel();
    };
  });
  const cmp = panel.querySelector('#ax5Compare');
  if (cmp) cmp.onclick = () => openDiff(rows);
}

function togglePanel() {
  let panel = document.getElementById('ax5Panel');
  if (panel) { panel.remove(); document.getElementById('ax5Btn')?.classList.remove('ax-on'); return; }
  document.getElementById('axIssuesPanel')?.querySelector('.ax-issues-close')?.click();
  document.getElementById('ax5Btn')?.classList.add('ax-on');
  panel = document.createElement('div'); panel.id = 'ax5Panel';
  document.body.appendChild(panel);
  renderPanel();
}

// ---------- diff modal ----------
async function openDiff(rows) {
  const meta = id => rows.find(r => r.id === id);
  let a, b, labelA, labelB, vsLive = false;
  if (_sel.length === 2) {
    // older = A, newer = B
    const [r1, r2] = [..._sel].map(meta).sort((x, y) => (x.created_at || '').localeCompare(y.created_at || ''));
    [a, b] = await Promise.all([getSnapshot(r1.id), getSnapshot(r2.id)]);
    labelA = r1.label; labelB = r2.label;
  } else {
    const r = meta(_sel[0]);
    a = await getSnapshot(r.id); b = buildSnapshot();
    labelA = r.label; labelB = 'Live'; vsLive = true;
  }
  if (!a || !b) return;
  const d = computeDiff(a, b);
  _overlay = vsLive ? { added: new Set(d.added.map(n => n.id)), changed: d.changedIds } : null;
  applyOverlay();

  const row = (cls, id, name, pn, chg, jump) => `<${jump ? 'button' : 'div'} class="ax5-drow ${cls}" ${jump ? `data-jump="${id}"` : ''}>
    <span class="dot"></span><span class="nm">${esc(name)}</span>${pn ? `<span class="pn">${esc(pn)}</span>` : ''}
    <span class="chgtxt">${chg}</span>${jump ? `<span class="pn">${I(ICONS.target, 12)}</span>` : ''}</${jump ? 'button' : 'div'}>`;
  const arrow = '<span class="arrow">→</span>';
  const sec = (title, items) => items.length ? `<div class="ax5-sec"><div class="ax5-sechead">${title} <span>${items.length}</span></div>${items.join('')}</div>` : '';
  const live = id => vsLive && state.nodes.some(n => n.id === id && !n.deleted);

  const nChanged = d.changedIds.size;
  const scrim = document.createElement('div');
  scrim.className = 'ax5-scrim'; scrim.id = 'ax5Diff';
  scrim.innerHTML = `<div class="ax5-modal" role="dialog" aria-label="Revision diff">
    <div class="ax5-mhead"><span class="ax5-vs">${esc(labelA)} <span class="arrow">→</span> <span class="${vsLive ? 'live' : ''}">${esc(labelB)}</span></span><span class="sp"></span>
      <button class="ax5-x" title="Close">${I(ICONS.close, 15)}</button></div>
    <div class="ax5-chips">
      <span class="ax5-chip add">+${d.added.length} added</span>
      <span class="ax5-chip rem">−${d.removed.length} removed</span>
      <span class="ax5-chip chg">~${nChanged} changed</span>
      ${!d.added.length && !d.removed.length && !nChanged ? '<span class="ax5-chip same">identical</span>' : ''}
    </div>
    <div class="ax5-mbody">
      ${sec('Added', d.added.map(n => row('add', n.id, n.name, n.part_number, '', live(n.id))))}
      ${sec('Removed', d.removed.map(n => row('rem', n.id, n.name, n.part_number, '', false)))}
      ${sec('Re-parented', d.reparented.map(r => row('chg', r.id, r.name, r.pn, `${esc(r.from.join(', ') || '—')} ${arrow} <span class="to">${esc(r.to.join(', ') || '—')}</span>`, live(r.id))))}
      ${sec('Status', d.status.map(r => row('chg', r.id, r.name, r.pn, `${esc(stLbl(r.from))} ${arrow} <span class="to">${esc(stLbl(r.to))}</span>`, live(r.id))))}
      ${sec('Qty & fasteners', d.linkchg.map(r => row('chg', r.id, r.name, 'under ' + r.parent, `${r.aq !== r.bq ? `×${r.aq} ${arrow} <span class="to">×${r.bq}</span>` : ''}${r.aq !== r.bq && (r.af || '') !== (r.bf || '') ? ' · ' : ''}${(r.af || '') !== (r.bf || '') ? `${esc(r.af || '—')} ${arrow} <span class="to">${esc(r.bf || '—')}</span>` : ''}`, live(r.id))))}
      ${sec('Renamed', d.renamed.map(r => row('chg', r.id, r.to, r.pn, `was <span class="to">${esc(r.from)}</span>`, live(r.id))))}
      ${sec('Part №', d.part.map(r => row('chg', r.id, r.name, '', `${esc(r.from || '—')} ${arrow} <span class="to">${esc(r.to || '—')}</span>`, live(r.id))))}
    </div>
    <div class="ax5-mfoot">${vsLive
      ? `Highlighted on the tree:<span class="swatch" style="background:var(--st-done)"></span>added<span class="swatch" style="background:var(--st-wip)"></span>changed — removed nodes are only listed here`
      : 'Snapshot-to-snapshot comparison — the live tree is not highlighted'}</div>
  </div>`;
  const close = () => { scrim.remove(); _overlay = null; applyOverlay(); };
  scrim.querySelector('.ax5-x').onclick = close;
  scrim.addEventListener('mousedown', e => { if (e.target === scrim) close(); });
  document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc2, true); } }, true);
  scrim.querySelectorAll('[data-jump]').forEach(el => { el.onclick = () => jumpToLiveNode(el.dataset.jump); });
  document.getElementById('ax5Diff')?.remove();
  document.body.appendChild(scrim);
}

// ---------- boot ----------
function boot() {
  const bar = document.getElementById('treeControls');
  if (bar) {
    const b = document.createElement('button');
    b.className = 'header-btn'; b.id = 'ax5Btn';
    b.title = 'Save & compare revision snapshots';
    b.innerHTML = I(ICONS.history) + 'Revisions';
    b.onclick = togglePanel;
    (document.getElementById('axIssuesBtn') || document.getElementById('separatorToggleBtn') || bar.lastElementChild)?.after(b);
  }
  const svg = document.getElementById('treeSvg');
  if (svg) new MutationObserver(() => { if (_overlay) requestAnimationFrame(applyOverlay); })
    .observe(svg, { childList: true, subtree: true });
  console.log('Axon Phase 5 (revision diff) loaded');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
