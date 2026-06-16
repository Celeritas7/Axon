/* Axon — Datum interactive prototype */
const { useState, useRef, useEffect, useCallback } = React;
const I = (n, s, st) => React.createElement(window.Icon, { name: n, size: s, style: st });
const A = window.AXON;
const HALF = 66, RHALF = 75;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function curve(x1, y1, x2, y2) { const mx = (x1 + x2) / 2; return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`; }

/* ---------- primitives ---------- */
function IB({ icon, on, title, onClick }) { return <button className={'axe-ib' + (on ? ' on' : '')} title={title} onClick={onClick}>{I(icon, 15)}</button>; }
function Btn({ icon, children, variant, onClick }) { return <button className={'axe-btn' + (variant ? ' ' + variant : '')} onClick={onClick}>{icon && I(icon, 14)}{children}</button>; }
function Sel({ label, value, onClick }) {
  return <button className="axe-select" onClick={onClick}>{label && <span className="lbl">{label}</span>}<span>{value}</span><span className="chev">{I('chevdown', 12)}</span></button>;
}
function Menu({ label, value, options, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [open]);
  const cur = options.find((o) => o.v === value);
  return <div className="axe-menu-wrap" ref={ref}>
    <button className="axe-select" onClick={() => setOpen((o) => !o)}>{label && <span className="lbl">{label}</span>}<span>{cur ? cur.label : value}</span><span className="chev">{I('chevdown', 12)}</span></button>
    {open && <div className="axe-menu">{options.map((o) => (
      <button key={String(o.v)} className={o.v === value ? 'on' : ''} onClick={() => { onPick(o.v); setOpen(false); }}>
        <span>{o.label}</span>{o.v === value && I('check', 13)}
      </button>))}</div>}
  </div>;
}
function Tag({ st, label }) { return <span className={'axe-tag ' + st}><span className={'dot bg-' + st} />{label || A.STATUS[st].label}</span>; }

/* ===================================================================
   APP
   =================================================================== */
const AppCtx = React.createContext(null);

function App() {
  const [route, setRoute] = useState({ name: 'projects', project: null, assembly: null });
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState('a');
  const [palette, setPalette] = useState(false);
  const [focus, setFocus] = useState(null);
  const toast = useCallback((msg, icon = 'check') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  }, []);

  const goProjects = () => setRoute({ name: 'projects', project: null, assembly: null });
  const openProject = (p) => setRoute({ name: 'assemblies', project: p, assembly: null });
  const openAssembly = (p, a) => setRoute({ name: 'tree', project: p, assembly: a });

  useEffect(() => {
    const k = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const pick = (it) => {
    setPalette(false);
    if (it.type === 'Project') { const p = A.projects.find((x) => x.id === it.id); if (p) setRoute({ name: 'assemblies', project: p, assembly: null }); }
    else if (it.type === 'Assembly') { const p = A.projects.find((x) => x.id === it.pid); const a = (A.assemblies[it.pid] || []).find((x) => x.id === it.id); if (p && a) setRoute({ name: 'tree', project: p, assembly: a }); }
    else if (it.type === 'Part') { const p = A.projects.find((x) => x.id === it.pid); const a = (A.assemblies[it.pid] || []).find((x) => x.id === it.aid); if (p && a) { setRoute({ name: 'tree', project: p, assembly: a }); setFocus({ nodeId: it.id, t: Date.now() }); } }
  };

  return (
    <AppCtx.Provider value={{ theme, setTheme, openPalette: () => setPalette(true) }}>
      <div className={'axe dir-' + theme}>
        {route.name === 'projects' && <ProjectsPage onOpen={openProject} toast={toast} />}
        {route.name === 'assemblies' && <AssembliesPage project={route.project} onBack={goProjects} onOpen={(a) => openAssembly(route.project, a)} toast={toast} />}
        {route.name === 'tree' && <TreePage key={route.assembly.id} project={route.project} assembly={route.assembly} siblings={A.assemblies[route.project.id] || []} onSwitch={(a) => openAssembly(route.project, a)} focus={focus} onBack={() => openProject(route.project)} onHome={goProjects} toast={toast} />}
        <Toasts toasts={toasts} />
        <CmdK open={palette} onClose={() => setPalette(false)} onPick={pick} />
      </div>
    </AppCtx.Provider>
  );
}

/* ---------- shared header bits ---------- */
function Brand({ onClick }) {
  return <div className="axe-brand" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
    <span className="axe-logomark">{I('spark', 14)}</span><span className="axe-wordmark">Axon</span>
  </div>;
}
function ThemeToggle() {
  const ctx = React.useContext(AppCtx);
  const dark = ctx.theme === 'b';
  return <button className="axe-ib" title={dark ? 'Light theme' : 'Dark theme'} onClick={() => ctx.setTheme(dark ? 'a' : 'b')}>{I(dark ? 'sun' : 'moon', 15)}</button>;
}
function HeaderRight() {
  const ctx = React.useContext(AppCtx);
  return <>
    <button className="axe-kbtn" onClick={ctx.openPalette} title="Search (⌘K)">{I('search', 14)}<span>Search</span><kbd>⌘K</kbd></button>
    <ThemeToggle />
    <span className="axe-pill live"><span className="dot" />Supabase</span>
    <span className="axe-user"><span>Priya N.</span><span className="axe-avatar">PN</span></span>
  </>;
}
function Crumb({ items }) {
  return <div className="axe-crumb">{items.map((it, i) => <React.Fragment key={i}>
    {i > 0 && <span className="sep">{I('chevright', 12)}</span>}
    <span className={i === items.length - 1 ? 'cur' : ''} onClick={it.onClick} style={{ cursor: it.onClick ? 'pointer' : 'default' }}>{it.label}</span>
  </React.Fragment>)}</div>;
}

/* ===================================================================
   PROJECTS
   =================================================================== */
function ProjectsPage({ onOpen, toast }) {
  const totalA = A.projects.reduce((s, p) => s + (A.assemblies[p.id] || []).length, 0);
  const [vis, setVis] = useState(() => Object.fromEntries(A.projects.map((p) => [p.id, p.visible !== false])));
  const stop = (e) => e.stopPropagation();
  return <>
    <header className="axe-header"><div className="axe-toprow">
      <Brand /><div className="axe-spacer" /><HeaderRight />
    </div></header>
    <div className="axe-body">
      <div className="axe-page">
        <div className="axe-pagehead">
          <div><div className="axe-eyebrow">Workspace</div><div className="axe-pagetitle">Projects</div>
            <div className="axe-pagesub">{A.projects.length} projects · {totalA} assemblies</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn icon="search" variant="ghost" onClick={() => toast('Search is a stub in this prototype', 'search')}>Search</Btn>
            <Btn icon="plus" variant="primary" onClick={() => toast('New project')}>New project</Btn>
          </div>
        </div>
        <div className="axe-grid cols4">
          {A.projects.map((p) => {
            const edge = p.st === 'done' ? 1 : p.st === 'blocked' ? 7 : 5;
            const on = vis[p.id];
            return <div className={'axe-card' + (on ? '' : ' hidden')} key={p.id} onClick={() => onOpen(p)}>
              <span className="accent-edge" style={{ background: `var(--lv${edge}-bar)` }} />
              <div className="axe-cardtop">
                <div className="axe-cardicon">{p.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="axe-cardname" title={p.name}>{p.name}</div>
                  <div className="axe-cardmeta"><span className="mono">{(A.assemblies[p.id] || []).length}</span> assemblies</div>
                </div>
                <Tag st={p.st} label={p.stl} />
              </div>
              <div className="axe-carddesc">{p.desc}</div>
              <div className="axe-progrow">
                <div className="axe-progress"><i style={{ width: p.pct + '%', background: `var(--st-${p.st})` }} /></div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{p.pct}%</span>
              </div>
              <div className="axe-cardfoot">
                <div className="axe-vis" onClick={stop}>
                  <span className={'axe-switch' + (on ? ' on' : '')} onClick={() => { setVis((v) => ({ ...v, [p.id]: !v[p.id] })); toast(on ? p.name + ' hidden' : p.name + ' visible'); }}><i /></span>
                  {on ? 'Visible' : 'Hidden'}
                </div>
                <div className="axe-cardacts" onClick={stop}>
                  <button className="axe-ib" title="Edit" onClick={() => toast('Edit ' + p.name)}>{I('edit', 15)}</button>
                  <button className="axe-ib danger" title="Delete" onClick={() => toast(p.name + ' deleted', 'trash')}>{I('trash', 15)}</button>
                </div>
              </div>
            </div>;
          })}
          <div className="axe-card add" onClick={() => toast('New project')}>
            <span className="ic">{I('plus', 18)}</span><span style={{ fontSize: 12, fontWeight: 500 }}>New project</span>
          </div>
        </div>
      </div>
    </div>
  </>;
}

/* ===================================================================
   ASSEMBLIES
   =================================================================== */
function AssembliesPage({ project, onBack, onOpen, toast }) {
  const list = A.assemblies[project.id] || [];
  return <>
    <header className="axe-header"><div className="axe-toprow">
      <Brand onClick={onBack} />
      <div className="axe-divider-v" />
      <Btn icon="back" variant="ghost" onClick={onBack}>Back</Btn>
      <Crumb items={[{ label: project.name, onClick: onBack }]} />
      <div className="axe-spacer" /><HeaderRight />
    </div></header>
    <div className="axe-body">
      <div className="axe-page">
        <div className="axe-asmhead">
          <div className="ic">{project.icon}</div>
          <div style={{ flex: 1 }}>
            <div className="axe-pagetitle">{project.name}</div>
            <div className="axe-pagesub">{project.desc}</div>
          </div>
          <Btn icon="plus" variant="primary" onClick={() => toast('New assembly')}>New assembly</Btn>
        </div>
        <div className="axe-grid cols3">
          {list.map((a) => {
            const edge = a.st === 'done' ? 1 : a.st === 'blocked' ? 7 : 5;
            return <div className="axe-card" key={a.id} onClick={() => onOpen(a)}>
              <span className="accent-edge" style={{ background: `var(--lv${edge}-bar)` }} />
              <div className="axe-cardtop">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="axe-cardname">{a.name}</div>
                  <div className="axe-cardmeta"><span className="mono">{a.nodes}</span> nodes</div>
                </div>
                <Tag st={a.st} />
              </div>
              <div className="axe-cardfoot">
                <div className="axe-progress"><i style={{ width: a.pct + '%', background: `var(--st-${a.st})` }} /></div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', marginLeft: 10 }}>{a.pct}%</span>
              </div>
            </div>;
          })}
          <div className="axe-card add" onClick={() => toast('New assembly')}>
            <span className="ic">{I('plus', 18)}</span><span style={{ fontSize: 12, fontWeight: 500 }}>New assembly</span>
          </div>
        </div>
      </div>
    </div>
  </>;
}

/* ===================================================================
   TREE
   =================================================================== */
function TreePage({ project, assembly, siblings, onSwitch, focus, onBack, onHome, toast }) {
  const theme = React.useContext(AppCtx).theme;
  const seed = A.tree[assembly.id] || A.tree.head;
  const [nodes, setNodes] = useState(seed);
  const [sel, setSel] = useState(null);          // single-selected node id
  const [multi, setMulti] = useState(() => new Set());
  const [draft, setDraft] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showSeq, setShowSeq] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [showSep, setShowSep] = useState(false);
  const [rollup, setRollup] = useState(false);
  const [critPath, setCritPath] = useState(false);
  const [levelMax, setLevelMax] = useState(null); // null = all
  const [colorMode, setColorMode] = useState('level'); // level | status | group
  const [view, setView] = useState({ scale: 1, tx: 44, ty: 54 });
  const [bom, setBom] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [chat, setChat] = useState(false);
  const [pop, setPop] = useState(null); // {id,x,y}
  const [issuesOpen, setIssuesOpen] = useState(false);
  const worldRef = useRef(null);
  const treeRef = useRef(null);
  const [lens, setLens] = useState(null); // {type:'status'|'level', value}
  const matchLens = (n) => !lens || (lens.type === 'status' ? effSt(n.id) === lens.value : n.lv === lens.value);
  const toggleLens = (type, value) => setLens((l) => (l && l.type === type && l.value === value) ? null : { type, value });

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const childrenOf = (id) => nodes.filter((n) => n.parent === id);
  const hidden = (n) => { let p = n.parent; while (p) { if (collapsed.has(p)) return true; p = byId[p] ? byId[p].parent : null; } return false; };
  const visible = nodes.filter((n) => !hidden(n) && (!levelMax || n.lv <= levelMax));
  const visIds = new Set(visible.map((n) => n.id));
  const edges = nodes.filter((n) => n.parent && visIds.has(n.id) && visIds.has(n.parent))
    .map((n) => ({ from: n, to: byId[n.parent] }));

  // roll-up: parent status derived from children (blocked > wip/orphan > done)
  const effSt = (id) => {
    const kids = childrenOf(id);
    if (!rollup || kids.length === 0) return byId[id].st;
    const ss = kids.map((k) => effSt(k.id));
    if (ss.includes('blocked')) return 'blocked';
    if (ss.includes('wip') || ss.includes('orphan')) return 'wip';
    if (ss.every((s) => s === 'done')) return 'done';
    return byId[id].st;
  };
  // group = L2 ancestor (sub-assembly)
  const l2list = nodes.filter((n) => n.lv === 2);
  const groupIdx = Object.fromEntries(l2list.map((g, i) => [g.id, i]));
  const groupOf = (n) => { let c = n; while (c && c.lv > 2) c = byId[c.parent]; return c ? c.id : null; };
  // critical path = chain from the deepest blocked node up to root
  const critSet = (() => {
    if (!critPath) return new Set();
    const blockedLeaf = nodes.find((n) => childrenOf(n.id).length === 0 && effSt(n.id) === 'blocked')
      || nodes.find((n) => effSt(n.id) === 'blocked');
    const s = new Set(); let c = blockedLeaf;
    while (c) { s.add(c.id); c = c.parent ? byId[c.parent] : null; }
    return s;
  })();
  // auto-tidy: recompute x/y into clean columns + centered parents
  const tidy = () => {
    const kmap = {}; nodes.forEach((n) => { if (n.parent) (kmap[n.parent] = kmap[n.parent] || []).push(n.id); });
    const root = nodes.find((n) => !n.parent);
    const yOf = {}; let slot = 0; const SP = 88, TOP = 70;
    const walk = (id) => {
      const ks = kmap[id] || [];
      if (!ks.length) { yOf[id] = TOP + slot * SP; slot++; }
      else { ks.forEach(walk); yOf[id] = (yOf[ks[0]] + yOf[ks[ks.length - 1]]) / 2; }
    };
    if (root) walk(root.id);
    const maxLv = Math.max(...nodes.map((n) => n.lv));
    const xOf = (lv) => 140 + (maxLv - lv) * 200;
    setNodes((ns) => ns.map((n) => ({ ...n, x: xOf(n.lv), y: yOf[n.id] != null ? yOf[n.id] : n.y })));
    toast('Layout tidied', 'refresh');
  };

  const selectNode = (n, e) => {
    setPop(null);
    if (e && (e.ctrlKey || e.metaKey)) {
      setMulti((m) => { const s = new Set(m); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s; });
      setSel(null); setDraft(null);
      return;
    }
    setMulti(new Set());
    setSel(n.id); setDraft({ ...n });
  };
  const closePanel = () => { setSel(null); setDraft(null); };
  const saveNode = () => { setNodes((ns) => ns.map((n) => n.id === draft.id ? { ...draft } : n)); toast('Node saved'); };
  const deleteNode = (id) => {
    setNodes((ns) => ns.filter((n) => n.id !== id && n.parent !== id));
    setSel(null); setDraft(null); setPop(null); toast('Node deleted', 'trash');
  };
  const toggleField = (id, field, onMsg, offMsg) => setNodes((ns) => ns.map((n) => {
    if (n.id !== id) return n; const v = !n[field]; toast(v ? onMsg : offMsg); return { ...n, [field]: v };
  }));
  const descendants = (id) => { const out = [id]; const walk = (pid) => childrenOf(pid).forEach((c) => { out.push(c.id); walk(c.id); }); walk(id); return out; };
  const ndrag = useRef(null);
  const startNodeDrag = (n, e) => {
    e.stopPropagation();
    if (e.button !== undefined && e.button !== 0) return;
    const sc = view.scale;
    const ids = e.shiftKey ? descendants(n.id) : [n.id];
    const base = {}; ids.forEach((id) => { base[id] = [byId[id].x, byId[id].y]; });
    ndrag.current = { id: n.id, sx: e.clientX, sy: e.clientY, moved: false, locked: !!n.locked, base };
    if (worldRef.current) { worldRef.current.classList.add('nodrag'); worldRef.current.classList.remove('animate'); }
    const move = (ev) => {
      const d = ndrag.current; if (!d) return;
      if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 3) d.moved = true;
      if (!d.moved || d.locked) return;
      const dx = (ev.clientX - d.sx) / sc, dy = (ev.clientY - d.sy) / sc;
      setNodes((ns) => ns.map((x) => d.base[x.id] ? { ...x, x: d.base[x.id][0] + dx, y: d.base[x.id][1] + dy } : x));
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
      const d = ndrag.current; ndrag.current = null;
      if (worldRef.current) { worldRef.current.classList.remove('nodrag'); worldRef.current.classList.add('animate'); }
      if (!d.moved) selectNode(n, ev);
      else if (d.locked) toast('Node is locked');
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };

  /* pan + zoom */
  const drag = useRef(null);
  const onBgDown = (e) => {
    if (e.target.closest('.axe-node, .axe-pop, .axe-zoom, .axe-sidepanel, .axe-selbar')) return;
    closePanel(); setMulti(new Set()); setPop(null);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    e.currentTarget.classList.add('panning');
  };
  const onBgMove = (e) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, tx: drag.current.tx + (e.clientX - drag.current.x), ty: drag.current.ty + (e.clientY - drag.current.y) }));
  };
  const onBgUp = (e) => { drag.current = null; e.currentTarget.classList.remove('panning'); };
  const zoom = (f) => setView((v) => ({ ...v, scale: clamp(+(v.scale * f).toFixed(2), 0.4, 2.2) }));
  const fit = () => setView({ scale: 1, tx: 44, ty: 54 });

  const centerOn = (id) => {
    const n = byId[id]; if (!n) return;
    setCollapsed((c) => { const s = new Set(c); let p = n.parent; while (p) { s.delete(p); p = (byId[p] || {}).parent; } return s; });
    setMulti(new Set()); setSel(n.id); setDraft({ ...n });
    const el = treeRef.current; const w = el ? el.clientWidth : 800; const h = el ? el.clientHeight : 480;
    setView({ scale: 1, tx: w / 2 - n.x, ty: h / 2 - n.y });
  };

  // data-integrity issues
  const issues = (() => {
    const list = [];
    nodes.forEach((n) => {
      if (!n.pn || !String(n.pn).trim()) list.push({ id: n.id, sev: 'blocked', type: 'Missing PN', msg: n.name + ' has no part number' });
      if (n.qty === 0) list.push({ id: n.id, sev: 'blocked', type: 'Zero qty', msg: n.name + ' has quantity 0' });
      if (n.st === 'orphan') list.push({ id: n.id, sev: 'orphan', type: 'Orphan', msg: n.name + ' has no valid parent link' });
      if (n.st === 'blocked') list.push({ id: n.id, sev: 'wip', type: 'Blocked', msg: n.name + ' is blocked' + (childrenOf(n.id).length ? ' (on critical path)' : '') });
    });
    return list;
  })();

  /* jump-to-node from ⌘K */
  useEffect(() => {
    if (!focus || !focus.nodeId) return;
    centerOn(focus.nodeId);
  }, [focus]);

  const maxLv = Math.max(...nodes.map((n) => n.lv));
  const sepLines = (() => {
    if (!showSep) return [];
    const bands = l2list.map((g) => {
      const ids = new Set([g.id]); let changed = true;
      while (changed) { changed = false; nodes.forEach((n) => { if (n.parent && ids.has(n.parent) && !ids.has(n.id)) { ids.add(n.id); changed = true; } }); }
      const ys = [...ids].map((id) => byId[id]).filter((n) => n && visIds.has(n.id)).map((n) => n.y);
      return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
    }).filter(Boolean).sort((a, b) => a.min - b.min);
    const lines = []; for (let i = 1; i < bands.length; i++) lines.push((bands[i - 1].max + bands[i].min) / 2);
    return lines;
  })();
  const nodeStyle = (n) => {
    let bar, fill;
    if (colorMode === 'level') { bar = `var(--lv${n.lv}-bar)`; fill = `var(--lv${n.lv}-fill)`; }
    else if (colorMode === 'group') { const gi = (groupIdx[groupOf(n)] ?? 0) % 8 + 1; bar = `var(--lv${gi}-bar)`; fill = `var(--lv${gi}-fill)`; }
    else { const st = effSt(n.id); bar = `var(--st-${st})`; fill = `color-mix(in oklch, var(--st-${st}) 15%, var(--surface))`; }
    return { left: n.x, top: n.y, '--nb': bar, background: fill };
  };

  return <>
    <header className="axe-header"><div className="axe-toprow">
      <Brand onClick={onHome} />
      <div className="axe-divider-v" />
      <Btn icon="back" variant="ghost" onClick={onBack}>Back</Btn>
      <Crumb items={[{ label: project.name, onClick: onBack }, { label: assembly.name }]} />
      <div className="axe-spacer" /><HeaderRight />
    </div>
      <div className="axe-toolrow">
        <Menu label="Assembly" value={assembly.id} onPick={(id) => { const a = (siblings || []).find((x) => x.id === id); if (a && a.id !== assembly.id) onSwitch(a); }}
          options={(siblings || []).map((a) => ({ v: a.id, label: a.name }))} />
        <div className="axe-group">
          <IB icon="plus" title="New assembly" onClick={() => toast('New assembly')} />
          <IB icon="edit" title="Rename assembly" onClick={() => toast('Rename assembly')} />
          <IB icon="copy" title="Duplicate assembly" onClick={() => toast('Duplicated assembly')} />
          <IB icon="trash" title="Delete assembly" onClick={() => toast('Delete assembly')} />
        </div>
        <div className="axe-divider-v" />
        <Menu label="Level" value={levelMax || 'all'} onPick={(v) => setLevelMax(v === 'all' ? null : v)}
          options={[{ v: 'all', label: 'All levels' }].concat(Array.from({ length: maxLv }, (_, i) => ({ v: i + 1, label: '≤ L' + (i + 1) })))} />
        <Menu label="Color" value={colorMode} onPick={setColorMode}
          options={[{ v: 'level', label: 'By level' }, { v: 'status', label: 'By status' }, { v: 'group', label: 'By group' }]} />
        <div className="axe-group">
          <IB icon="expand" title="Expand all" onClick={() => setCollapsed(new Set())} />
          <IB icon="collapse" title="Collapse all" onClick={() => setCollapsed(new Set(nodes.filter((n) => n.lv === 2).map((n) => n.id)))} />
          <IB icon="grid" title="Auto-tidy layout" onClick={tidy} />
        </div>
        <div className="axe-group">
          <IB icon="hash" on={showSeq} title="Sequence numbers" onClick={() => setShowSeq((s) => !s)} />
          <IB icon="layers" on={showLevels} title="Level headers" onClick={() => setShowLevels((s) => !s)} />
          <IB icon="sep" on={showSep} title="Group separators" onClick={() => setShowSep((s) => !s)} />
        </div>
        <div className="axe-group">
          <IB icon="merge" on={rollup} title="Roll up status from children" onClick={() => setRollup((s) => !s)} />
          <IB icon="target" on={critPath} title="Highlight critical path" onClick={() => setCritPath((s) => !s)} />
        </div>
        <button className={'axe-btn' + (issues.length ? ' warn' : '')} onClick={() => setIssuesOpen(true)} title="Data-integrity issues">{I('alert', 14)} Issues{issues.length > 0 && <span className="axe-badge">{issues.length}</span>}</button>
        <div className="axe-spacer" />
        <Btn icon="list" onClick={() => setBom(true)}>BOM</Btn>
        <Btn icon="basket" onClick={() => setPickup(true)}>Pickup</Btn>
        <Btn icon="download" onClick={() => toast('Exported CSV', 'download')}>Export</Btn>
        <Btn icon="upload" onClick={() => toast('Import CSV')}>Import</Btn>
      </div>
    </header>

    <div className="axe-legend">
      <div className="grp"><span className="ttl">Levels</span>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => { const on = lens && lens.type === 'level' && lens.value === n; const off = lens && !on; return <span className={'it lens' + (on ? ' on' : '') + (off ? ' off' : '')} key={n} onClick={() => toggleLens('level', n)} title={'Isolate L' + n}><span className="axe-swatch" style={{ background: `var(--lv${n}-bar)` }} />L{n}</span>; })}
      </div>
      <div className="grp"><span className="ttl">Status</span>
        {['done', 'wip', 'blocked', 'orphan'].map((s) => { const on = lens && lens.type === 'status' && lens.value === s; const off = lens && !on; return <span className={'it lens' + (on ? ' on' : '') + (off ? ' off' : '')} key={s} onClick={() => toggleLens('status', s)} title={'Isolate ' + A.STATUS[s].label}><span className={'axe-swatch bg-' + s} />{A.STATUS[s].label}</span>; })}
      </div>
      {lens && <button className="axe-legend-clear" onClick={() => setLens(null)}>{I('close', 12)} Clear</button>}
      <span className="hint"><kbd>⇧</kbd> drag = move subtree · <kbd>⌃</kbd> click = multi-select</span>
    </div>

    <div className="axe-body">
      <div className="axe-treeview" ref={treeRef} onPointerDown={onBgDown} onPointerMove={onBgMove} onPointerUp={onBgUp} onPointerLeave={onBgUp}>
        <div ref={worldRef} className="axe-treeworld animate" style={{ transform: `translate(${view.tx}px,${view.ty}px) scale(${view.scale})` }}>
          <svg className="links" width="720" height="460" style={{ position: 'absolute', overflow: 'visible' }}>
            {edges.map((e, i) => {
              const fr = e.from, to = e.to;
              const fx = fr.x + (fr.lv === 1 ? RHALF : HALF), tx = to.x - (to.lv === 1 ? RHALF : HALF);
              const fast = fr.link && fr.link.kind === 'fastener';
              const crit = critSet.has(fr.id) && critSet.has(to.id);
              return <path className={'link' + (crit ? ' crit' : '')} key={i} d={curve(fx, fr.y, tx, to.y)}
                style={fast ? { stroke: 'var(--accent)' } : crit ? { stroke: 'var(--st-blocked)' } : undefined} />;
            })}
          </svg>
          {showSep && sepLines.map((y, i) => <div className="axe-sep" key={i} style={{ top: y, left: 18, width: 612 }} />)}
          {edges.filter((e) => e.from.link && e.from.link.label).map((e, i) => {
            const fr = e.from, to = e.to;
            const fx = fr.x + (fr.lv === 1 ? RHALF : HALF), tx = to.x - (to.lv === 1 ? RHALF : HALF);
            return <div className="axe-linklabel" key={i} style={{ left: (fx + tx) / 2, top: (fr.y + to.y) / 2 }}>{fr.link.label}</div>;
          })}
          {showLevels && [3, 2, 1].map((lv) => {
            const sample = nodes.find((n) => n.lv === lv);
            if (!sample) return null;
            return <div className="axe-lvlhead" key={lv} style={{ left: sample.x, top: -38 }}>{I('layers', 12)} Level {lv}</div>;
          })}
          {visible.map((n) => {
            const isSel = sel === n.id || multi.has(n.id);
            const kids = childrenOf(n.id);
            return <div key={n.id} className={'axe-node' + (n.root ? ' root' : '') + (n.lv === 1 ? ' root' : '') + (isSel ? ' sel' : '') + (lens && !matchLens(n) ? ' dim' : '') + (critSet.has(n.id) ? ' crit' : '') + (n.locked ? ' locked' : '') + (n.flagged ? ' flagged' : '')}
              data-lv={n.lv} style={nodeStyle(n)}
              onPointerDown={(e) => startNodeDrag(n, e)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSel(n.id); setDraft({ ...n }); setPop({ id: n.id, x: n.x, y: n.y }); }}>
              <span className="bar" />
              {n.locked && <span className="axe-lock" title="Locked">{I('lock', 10)}</span>}
              {n.flagged && <span className="axe-flag" title="Flagged">{I('alert', 10)}</span>}
              <span className="nm">{n.name}</span>
              <span className="pn mono">{n.pn}</span>
              {showSeq && n.seq && <span className="seq">{n.seq}</span>}
              <span className={'stdot bg-' + effSt(n.id)} />
              {kids.length > 0 && (
                <button className="axe-collapse" title={collapsed.has(n.id) ? 'Expand' : 'Collapse'}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setCollapsed((c) => { const s = new Set(c); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s; }); }}>
                  {collapsed.has(n.id) ? kids.length : '–'}
                </button>
              )}
            </div>;
          })}
          {pop && byId[pop.id] && (
            <div className="axe-pop" style={{ left: pop.x + 70, top: pop.y - 10 }} onPointerDown={(e) => e.stopPropagation()}>
              <button onClick={() => { toast('Add child node'); setPop(null); }}>{I('plus', 14)} Add child</button>
              <button onClick={() => { setSel(pop.id); setDraft({ ...byId[pop.id] }); setPop(null); }}>{I('edit', 14)} Edit node</button>
              <button onClick={() => { setCollapsed((c) => { const s = new Set(c); s.has(pop.id) ? s.delete(pop.id) : s.add(pop.id); return s; }); setPop(null); }}>{I(collapsed.has(pop.id) ? 'expand' : 'collapse', 14)} {collapsed.has(pop.id) ? 'Expand' : 'Collapse'}</button>
              <button onClick={() => { toast('Edit links'); setPop(null); }}>{I('layers', 14)} Edit links</button>
              <button onClick={() => { toggleField(pop.id, 'locked', 'Node locked', 'Node unlocked'); setPop(null); }}>{I('lock', 14)} {byId[pop.id].locked ? 'Unlock' : 'Lock'}</button>
              <button onClick={() => { toggleField(pop.id, 'flagged', 'Node flagged', 'Flag cleared'); setPop(null); }}>{I('alert', 14)} {byId[pop.id].flagged ? 'Clear flag' : 'Flag node'}</button>
              <hr />
              <button className="danger" onClick={() => deleteNode(pop.id)}>{I('trash', 14)} Delete</button>
            </div>
          )}
        </div>

        <div className="axe-zoom">
          <button onClick={() => zoom(1.2)} title="Zoom in">{I('zin', 15)}</button>
          <button onClick={() => zoom(1 / 1.2)} title="Zoom out">{I('zout', 15)}</button>
          <button onClick={fit} title="Fit">{I('fit', 15)}</button>
          <button onClick={fit} title="Reset">{I('reset', 15)}</button>
        </div>

        {multi.size > 0 && (
          <div className="axe-selbar">
            <span className="cnt mono">{multi.size}</span> selected
            <Btn icon="layers" onClick={() => toast('Move ' + multi.size + ' nodes')}>Move to…</Btn>
            <Btn icon="trash" onClick={() => { setNodes((ns) => ns.filter((n) => !multi.has(n.id))); toast(multi.size + ' deleted', 'trash'); setMulti(new Set()); }}>Delete</Btn>
            <button className="axe-ib" title="Clear" onClick={() => setMulti(new Set())} style={{ border: 'none' }}>{I('close', 15)}</button>
          </div>
        )}
      </div>

      <SidePanel draft={draft} setDraft={setDraft} onClose={closePanel} onSave={saveNode} onDelete={() => deleteNode(draft.id)} />

      <div className="axe-fab" title="Assistant" onClick={() => setChat((c) => !c)}>{I('bot', 20)}</div>
    </div>

    {bom && <BomOverlay nodes={nodes} setNodes={setNodes} assembly={assembly} onClose={() => setBom(false)} toast={toast} />}
    {pickup && <PickupOverlay nodes={nodes} assembly={assembly} onClose={() => setPickup(false)} toast={toast} />}
    {chat && <ChatPanel nodes={nodes} onClose={() => setChat(false)} />}
    {issuesOpen && <div className="axe-overlay" onClick={() => setIssuesOpen(false)}>
      <div className={'axe-modal axe dir-' + theme} style={{ maxWidth: 560, height: 'auto', maxHeight: '80vh', background: 'var(--surface)' }} onClick={(e) => e.stopPropagation()}>
        <div className="axe-bom-head">
          <div className="axe-bom-title">{I('alert', 16)} Issues <span className="mono">· {issues.length}</span></div>
          <button className="axe-ib" title="Close" style={{ border: 'none' }} onClick={() => setIssuesOpen(false)}>{I('close', 15)}</button>
        </div>
        <div className="axe-issues">
          {issues.length === 0 && <div className="axe-empty" style={{ padding: 40 }}>{I('check', 26)}<span>No issues — everything checks out</span></div>}
          {issues.map((it, i) => (
            <button className="axe-issue" key={i} onClick={() => { centerOn(it.id); setIssuesOpen(false); }}>
              <span className={'idot bg-' + it.sev} />
              <span className="ity">{it.type}</span>
              <span className="imsg">{it.msg}</span>
              <span className="igo">{I('corner', 14)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>}
  </>;
}

/* ---------- side panel ---------- */
function SidePanel({ draft, setDraft, onClose, onSave, onDelete }) {
  const open = !!draft;
  return <div className={'axe-sidepanel' + (open ? ' open' : '')}>
    <div className="axe-sp-head">
      <span className="axe-sp-title">Edit node</span>
      <button className="axe-ib" style={{ border: 'none', width: 24, height: 24 }} onClick={onClose}>{I('close', 14)}</button>
    </div>
    {draft && <div className="axe-sp-body">
      <div className="axe-field"><div className="fl">Name</div>
        <input className="axe-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
      <div className="axe-field"><div className="fl">Part number</div>
        <input className="axe-input mono" value={draft.pn} onChange={(e) => setDraft({ ...draft, pn: e.target.value })} /></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="axe-field" style={{ flex: 1 }}><div className="fl">Level</div><div className="axe-input mono">L{draft.lv}</div></div>
        <div className="axe-field" style={{ flex: 1 }}><div className="fl">Qty</div>
          <input className="axe-input mono" type="number" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: +e.target.value })} /></div>
        <div className="axe-field" style={{ flex: 1 }}><div className="fl">Seq</div>
          <input className="axe-input mono" value={draft.seq || ''} onChange={(e) => setDraft({ ...draft, seq: e.target.value })} /></div>
      </div>
      <div className="axe-field"><div className="fl">Status</div>
        <div className="axe-seg">{['done', 'wip', 'blocked', 'orphan'].map((s) => (
          <span key={s} className={'opt' + (draft.st === s ? ' on' : '')} onClick={() => setDraft({ ...draft, st: s })}>
            <span className={'dot bg-' + s} />{A.STATUS[s].label}</span>))}</div>
      </div>
      <div className="axe-field"><div className="fl">People assigned</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="axe-ib" onClick={() => setDraft({ ...draft, people: Math.max(0, draft.people - 1) })}>{I('collapse', 14)}</button>
          <span className="mono" style={{ minWidth: 18, textAlign: 'center', fontSize: 14 }}>{draft.people}</span>
          <button className="axe-ib" onClick={() => setDraft({ ...draft, people: draft.people + 1 })}>{I('plus', 14)}</button>
        </div>
      </div>
    </div>}
    {draft && <div className="axe-sp-body" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 13 }}>
      <button className="axe-btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onSave}>Save changes</button>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn icon="copy" onClick={onClose}>Duplicate</Btn>
        <button className="axe-btn" style={{ color: 'var(--st-blocked)', borderColor: 'color-mix(in oklch,var(--st-blocked) 35%,transparent)', flex: 1, justifyContent: 'center' }} onClick={onDelete}>{I('trash', 14)} Delete</button>
      </div>
    </div>}
  </div>;
}

/* ---------- BOM overlay ---------- */
function BomOverlay({ nodes, setNodes, assembly, onClose, toast }) {
  const theme = React.useContext(AppCtx).theme;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => n.lv === 1);
  const l2 = nodes.filter((n) => n.lv === 2);
  const parts = nodes.filter((n) => n.lv >= 3);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [checked, setChecked] = useState(() => new Set());
  const [units, setUnits] = useState(1);
  const toggle = (id) => setChecked((c) => { const s = new Set(c); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const tg = (id) => setCollapsed((c) => { const s = new Set(c); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const ext = (n) => { let q = n.qty || 0; let p = n.parent; while (p && byId[p]) { q *= (byId[p].qty || 1); p = byId[p].parent; } return q * units; };
  const allIds = parts.map((p) => p.id);
  const allChecked = allIds.length > 0 && allIds.every((id) => checked.has(id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(allIds));
  const setSeq = (id, seq) => setNodes((ns) => ns.map((n) => n.id === id ? { ...n, seq } : n));
  const delChecked = () => { const k = checked.size; setNodes((ns) => ns.filter((n) => !checked.has(n.id))); setChecked(new Set()); toast(k + ' rows deleted', 'trash'); };
  const totalQty = parts.reduce((s, p) => s + ext(p), 0);
  let num = 0;
  return <div className="axe-overlay" onClick={onClose}>
    <div className={'axe-modal axe dir-' + theme} style={{ background: 'var(--surface)' }} onClick={(e) => e.stopPropagation()}>
      <div className="axe-bom-head">
        <div className="axe-bom-title">{I('list', 16)} BOM <span className="mono">· {assembly.name}</span></div>
        <div className="axe-bom-actions">
          <span className="axe-toollabel">Units</span>
          <input className="axe-input mono" style={{ width: 54, height: 30 }} type="number" min="1" value={units} onChange={(e) => setUnits(Math.max(1, +e.target.value || 1))} />
          <div className="axe-divider-v" />
          <Btn icon="expand" variant="ghost" onClick={() => setCollapsed(new Set())}>Expand</Btn>
          <Btn icon="collapse" variant="ghost" onClick={() => setCollapsed(new Set(l2.map((n) => n.id)))}>Collapse</Btn>
          <div className="axe-divider-v" />
          {checked.size > 0 && <button className="axe-btn" style={{ color: 'var(--st-blocked)', borderColor: 'color-mix(in oklch,var(--st-blocked) 35%,transparent)' }} onClick={delChecked}>{I('trash', 14)} Delete {checked.size}</button>}
          <IB icon="upload" title="Import CSV" onClick={() => toast('Import CSV')} />
          <Btn icon="download" onClick={() => toast('Exported CSV', 'download')}>Export CSV</Btn>
          <IB icon="print" title="Print" onClick={() => toast('Print')} />
          <button className="axe-ib" title="Close" style={{ border: 'none' }} onClick={onClose}>{I('close', 15)}</button>
        </div>
      </div>
      <div className="axe-bom-colhead bom7">
        <span><span className={'axe-cb' + (allChecked ? ' on' : '')} onClick={toggleAll} title="Select all">{allChecked && I('check', 11)}</span></span>
        <span>#</span><span>Seq</span><span>Item</span><span>Part №</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Ext</span><span style={{ textAlign: 'center' }}>St</span>
      </div>
      <div className="axe-bom-scroll axe-bom">
        {root && <div className="axe-bom-group" data-lv="1" onClick={() => tg(root.id)}>
          <span className="chev">{I(collapsed.has(root.id) ? 'chevright' : 'chevdown', 13)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{root.name}
            <span className="mono" style={{ opacity: .7, fontSize: 10.5, fontWeight: 400 }}>{root.pn}</span></span>
          <span className="cnt">{nodes.length - 1}</span>
        </div>}
        {!collapsed.has(root && root.id) && l2.map((g) => {
          const kids = nodes.filter((n) => n.parent === g.id);
          return <React.Fragment key={g.id}>
            <div className="axe-bom-group" data-lv="2" onClick={() => tg(g.id)}>
              <span className="chev">{I(collapsed.has(g.id) ? 'chevright' : 'chevdown', 13)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span className="mono" style={{ opacity: .85, fontSize: 11 }}>{g.seq}</span>{g.name}
                <span className="mono" style={{ opacity: .7, fontSize: 10.5, fontWeight: 400 }}>{g.pn}</span></span>
              <span className="cnt">{kids.length}</span>
            </div>
            {!collapsed.has(g.id) && kids.map((r) => {
              num += 1; const isC = checked.has(r.id);
              return <div className={'axe-bom-row bom7' + (isC ? ' checked' : '')} key={r.id}>
                <span className={'axe-cb' + (isC ? ' on' : '')} onClick={() => toggle(r.id)}>{isC && I('check', 11)}</span>
                <span className="num">{String(num).padStart(2, '0')}</span>
                <input className="axe-seqedit mono" value={r.seq || ''} onChange={(e) => setSeq(r.id, e.target.value)} placeholder="—" />
                <span className="nm">{r.name}</span>
                <span className="pn">{r.pn}</span>
                <span className="qty">{r.qty}</span>
                <span className="qty ext">{ext(r)}</span>
                <span className={'st bg-' + r.st} />
              </div>;
            })}
          </React.Fragment>;
        })}
      </div>
      <div className="axe-bom-foot">
        <span>{parts.length} parts · {units} unit{units > 1 ? 's' : ''}</span>
        <span className="mono">Total rolled qty <b style={{ color: 'var(--ink)' }}>{totalQty}</b></span>
      </div>
    </div>
  </div>;
}

/* ---------- Pickup overlay ---------- */
function PickupOverlay({ nodes, assembly, onClose, toast }) {
  const theme = React.useContext(AppCtx).theme;
  const parts = nodes.filter((n) => n.lv === 3);
  const l2 = nodes.filter((n) => n.lv === 2);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const [units, setUnits] = useState(1);
  const [scope, setScope] = useState('all');
  const [filter, setFilter] = useState('all');
  const [state, setState] = useState(() => Object.fromEntries(parts.map((p) => [p.id, 'pending'])));
  const set = (id, s) => setState((st) => ({ ...st, [id]: st[id] === s ? 'pending' : s }));

  let rows = parts.filter((p) => scope === 'all' || p.parent === scope);
  if (filter !== 'all') rows = rows.filter((p) => state[p.id] === filter);
  const picked = parts.filter((p) => state[p.id] === 'picked').length;
  const total = parts.length;

  return <div className="axe-overlay" onClick={onClose}>
    <div className={'axe-modal axe dir-' + theme} style={{ maxWidth: 720, background: 'var(--surface)' }} onClick={(e) => e.stopPropagation()}>
      <div className="axe-bom-head">
        <div className="axe-bom-title">{I('basket', 16)} Pickup <span className="mono">· {assembly.name}</span></div>
        <div className="axe-bom-actions">
          <span className="axe-toollabel">Units</span>
          <input className="axe-input mono" style={{ width: 56, height: 30 }} type="number" min="1" value={units} onChange={(e) => setUnits(Math.max(1, +e.target.value))} />
          <Btn icon="reset" variant="ghost" onClick={() => { setState(Object.fromEntries(parts.map((p) => [p.id, 'pending']))); toast('Reset'); }}>Reset</Btn>
          <IB icon="print" title="Print" onClick={() => toast('Print')} />
          <button className="axe-ib" title="Close" style={{ border: 'none' }} onClick={onClose}>{I('close', 15)}</button>
        </div>
      </div>
      <div className="axe-pk-top">
        <div className="axe-pk-chips">
          <span className={'axe-chip' + (scope === 'all' ? ' on' : '')} onClick={() => setScope('all')}>All groups</span>
          {l2.map((g) => <span key={g.id} className={'axe-chip' + (scope === g.id ? ' on' : '')} onClick={() => setScope(g.id)}>{g.name}</span>)}
        </div>
        <div className="axe-pk-prog">
          <div className="bar"><i style={{ width: (total ? picked / total * 100 : 0) + '%' }} /></div>
          <span className="lbl">{picked} / {total} picked</span>
        </div>
        <div className="axe-tabs">
          {[['all', 'All'], ['pending', 'Pending'], ['picked', 'Picked'], ['missing', 'Missing']].map(([k, l]) =>
            <button key={k} className={'axe-tab' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      <div className="axe-bom-scroll" style={{ overflowY: 'auto' }}>
        {rows.length === 0 && <div className="axe-empty" style={{ padding: 40 }}>{I('basket', 28)}<span>Nothing here</span></div>}
        {rows.map((p) => {
          const st = state[p.id];
          return <div className={'axe-pk-row' + (st === 'picked' ? ' picked' : '')} key={p.id}>
            <span className={'axe-cb' + (st === 'picked' ? ' on' : '')} onClick={() => set(p.id, 'picked')}>{st === 'picked' && I('check', 11)}</span>
            <div style={{ minWidth: 0 }}><div className="nm">{p.name}</div><div style={{ display: 'flex', gap: 8 }}><span className="pn">{p.pn}</span><span className="pn">{byId[p.parent] ? byId[p.parent].name : ''}</span></div></div>
            <span className="pn">{p.pn}</span>
            <span className="qty">×{p.qty * units}</span>
            <span className="axe-pk-state">
              <span className={'axe-mini' + (st === 'picked' ? ' on-pick' : '')} title="Picked" onClick={() => set(p.id, 'picked')}>{I('check', 13)}</span>
              <span className={'axe-mini' + (st === 'missing' ? ' on-miss' : '')} title="Missing" onClick={() => set(p.id, 'missing')}>{I('close', 13)}</span>
            </span>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

/* ---------- Chat ---------- */
function ChatPanel({ nodes, onClose }) {
  const theme = React.useContext(AppCtx).theme;
  const counts = ['done', 'wip', 'blocked', 'orphan'].reduce((o, s) => (o[s] = nodes.filter((n) => n.st === s).length, o), {});
  const blocked = nodes.filter((n) => n.st === 'blocked');
  const replies = {
    status: `**Status** — ${counts.done} done · ${counts.wip} in progress · ${counts.blocked} blocked · ${counts.orphan} orphan, across ${nodes.length} nodes.`,
    blocked: blocked.length ? `**Blocked (${blocked.length}):** ` + blocked.map((n) => n.name).join(', ') + '. Cable carrier brackets is on the critical path.' : 'Nothing is blocked right now. 🎉',
    parallel: '**Parallel work:** *Head side covers* and *Head top covers* have no shared dependencies — two people can run them at once.',
    progress: `**Progress:** ~${Math.round(counts.done / nodes.length * 100)}% complete by node count. Critical path runs through Level 2 sub-assemblies.`,
  };
  const [msgs, setMsgs] = useState([{ who: 'bot', t: '👋 I can summarise status, find blocked items, suggest parallel work, or estimate progress. Try a quick action.' }]);
  const [input, setInput] = useState('');
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs]);
  const ask = (key, label) => setMsgs((m) => [...m, { who: 'me', t: label }, { who: 'bot', t: replies[key] }]);
  const send = () => { if (!input.trim()) return; const q = input.trim(); setInput(''); setMsgs((m) => [...m, { who: 'me', t: q }, { who: 'bot', t: replies.status }]); };

  const fmt = (t) => t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) =>
    p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('*') ? <em key={i}>{p.slice(1, -1)}</em> : p);

  return <div className={'axe-chat axe dir-' + theme}>
    <div className="axe-chat-head">
      <span className="t"><span className="ic">{I('bot', 16)}</span> Assembly Assistant</span>
      <button className="axe-ib" style={{ border: 'none', width: 26, height: 26 }} onClick={onClose}>{I('close', 15)}</button>
    </div>
    <div className="axe-chat-quick">
      <button className="axe-quick" onClick={() => ask('status', 'Status')}>Status</button>
      <button className="axe-quick" onClick={() => ask('blocked', 'Blocked items')}>Blocked</button>
      <button className="axe-quick" onClick={() => ask('parallel', 'Parallel work')}>Parallel work</button>
      <button className="axe-quick" onClick={() => ask('progress', 'Progress')}>Progress</button>
    </div>
    <div className="axe-chat-body" ref={bodyRef}>
      {msgs.map((m, i) => <div key={i} className={'axe-msg ' + (m.who === 'me' ? 'me' : 'bot')}>{fmt(m.t)}</div>)}
    </div>
    <div className="axe-chat-input">
      <input value={input} placeholder="Ask about your assembly…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button className="axe-chat-send" onClick={send}>{I('chevright', 16)}</button>
    </div>
  </div>;
}

/* ---------- Toasts ---------- */
function Toasts({ toasts }) {
  return <div className="axe-toasts">{toasts.map((t) => <div className="axe-toast" key={t.id}>
    <span className="ic">{I(t.icon === 'trash' ? 'trash' : t.icon === 'download' ? 'download' : t.icon === 'refresh' ? 'refresh' : t.icon === 'search' ? 'search' : 'spark', 14)}</span>{t.msg}
  </div>)}</div>;
}

/* ---------- ⌘K command palette ---------- */
function CmdK({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(''); setHi(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);

  const items = React.useMemo(() => {
    const out = [];
    A.projects.forEach((p) => out.push({ type: 'Project', id: p.id, label: p.name, sub: (A.assemblies[p.id] || []).length + ' assemblies', icon: p.icon }));
    Object.entries(A.assemblies).forEach(([pid, list]) => list.forEach((a) => out.push({ type: 'Assembly', pid, id: a.id, label: a.name, sub: a.nodes + ' nodes', pname: (A.projects.find((x) => x.id === pid) || {}).name })));
    A.tree.head.forEach((n) => out.push({ type: 'Part', pid: 'ghost', aid: 'head', id: n.id, label: n.name, pn: n.pn, lv: n.lv, st: n.st }));
    return out;
  }, []);
  const usedIn = (pn) => (A.usage[pn] || []);

  const ql = q.trim().toLowerCase();
  const res = (ql ? items.filter((it) => it.label.toLowerCase().includes(ql) || (it.pn || '').toLowerCase().includes(ql) || (it.sub || '').toLowerCase().includes(ql)) : items).slice(0, 14);
  const groups = ['Project', 'Assembly', 'Part'].map((t) => ({ t, rows: res.filter((r) => r.type === t) })).filter((g) => g.rows.length);
  const flat = groups.flatMap((g) => g.rows);
  useEffect(() => { setHi(0); }, [q]);
  if (!open) return null;

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(flat.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[hi]) onPick(flat[hi]); }
  };

  return <div className="axe-cmdk-scrim" onClick={onClose}>
    <div className="axe-cmdk" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
      <div className="axe-cmdk-input">
        {I('search', 17)}
        <input ref={inputRef} value={q} placeholder="Search projects, assemblies, parts…" onChange={(e) => setQ(e.target.value)} />
        <kbd>esc</kbd>
      </div>
      <div className="axe-cmdk-list">
        {flat.length === 0 && <div className="axe-cmdk-empty">No matches for “{q}”</div>}
        {groups.map((g) => <div key={g.t}>
          <div className="axe-cmdk-grouphead">{g.t === 'Part' ? 'Parts' : g.t + 's'}</div>
          {g.rows.map((r) => {
            const idx = flat.indexOf(r);
            const uses = r.type === 'Part' ? usedIn(r.pn) : null;
            return <button key={r.type + r.id} className={'axe-cmdk-row' + (idx === hi ? ' hi' : '')}
              onMouseEnter={() => setHi(idx)} onClick={() => onPick(r)}>
              <span className="ic">{r.type === 'Project' ? <span style={{ fontSize: 16 }}>{r.icon}</span> : r.type === 'Assembly' ? I('layers', 15) : I('hash', 15)}</span>
              <span className="lbl">{r.label}{r.type === 'Part' && r.pn && <span className="pn mono">{r.pn}</span>}</span>
              <span className="meta" title={uses ? 'Used in: ' + uses.join(', ') : ''}>
                {r.type === 'Project' && r.sub}
                {r.type === 'Assembly' && (r.pname + ' · ' + r.sub)}
                {r.type === 'Part' && (uses.length > 1 ? <span className="usedin">used in {uses.length} assemblies</span> : 'used in 1 assembly')}
              </span>
              <span className="go">{I('corner', 14)}</span>
            </button>;
          })}
        </div>)}
      </div>
      <div className="axe-cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> open · <kbd>esc</kbd> close</div>
    </div>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
