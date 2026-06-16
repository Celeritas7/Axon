/* Axon Datum prototype — demo data (window.AXON) */
(function () {
  const projects = [
    { id: 'ghost', icon: '👻', name: 'Ghost', desc: 'Sensor-head retrofit program.', pct: 72, st: 'wip', stl: 'In progress', edit: '2d ago', visible: true },
    { id: 'logi', icon: '🔧', name: 'Logi assy', desc: 'Elevator mechanical assemblies.', pct: 100, st: 'done', stl: 'Released', edit: '1w ago', visible: true },
    { id: 'enclosure', icon: '🛠️', name: 'Logi_new_enclosure_assy', desc: 'No description', pct: 64, st: 'wip', stl: 'In progress', edit: '4d ago', visible: true },
    { id: 'robot', icon: '🏗️', name: 'Logi_new_robot_assy', desc: 'Autonomous picking cell.', pct: 38, st: 'blocked', stl: 'Blocked', edit: '5h ago', visible: true },
    { id: 'temp', icon: '📁', name: 'Temp', desc: 'No description', pct: 22, st: 'wip', stl: 'Scratch', edit: '6h ago', visible: true },
    { id: 'testing', icon: '📁', name: 'Testing', desc: 'No description', pct: 48, st: 'wip', stl: 'In progress', edit: '1d ago', visible: true },
    { id: 'humanoid', icon: '🤖', name: 'Humanoid', desc: 'No description', pct: 0, st: 'orphan', stl: 'Empty', edit: '2w ago', visible: false },
  ];

  const assemblies = {
    ghost: [
      { id: 'head', name: 'Head assy upgrader', nodes: 9, st: 'wip', pct: 64 },
      { id: 'l3m', name: 'L3 motor upgrader', nodes: 20, st: 'wip', pct: 45 },
      { id: 'pillar', name: 'Pillar rework', nodes: 12, st: 'done', pct: 100 },
      { id: 'pup', name: 'Pillar upgrade', nodes: 11, st: 'blocked', pct: 30 },
      { id: 'p1111', name: 'Pillar1111', nodes: 10, st: 'wip', pct: 52 },
    ],
    logi: [
      { id: 'la1', name: 'Car frame assy', nodes: 14, st: 'done', pct: 100 },
      { id: 'la2', name: 'Counterweight', nodes: 8, st: 'done', pct: 100 },
      { id: 'la3', name: 'Drive sheave', nodes: 11, st: 'done', pct: 100 },
    ],
    robot: [
      { id: 'rb1', name: 'BLDC panel assy', nodes: 16, st: 'wip', pct: 40 },
      { id: 'rb2', name: 'Pneumatic FRL unit', nodes: 9, st: 'blocked', pct: 20 },
    ],
    enclosure: [
      { id: 'en1', name: 'Side cover assy', nodes: 12, st: 'wip', pct: 60 },
      { id: 'en2', name: 'Top enclosure', nodes: 9, st: 'wip', pct: 55 },
      { id: 'en3', name: 'Base plate', nodes: 7, st: 'done', pct: 100 },
    ],
    temp: [
      { id: 'tp1', name: 'Compressor BOM', nodes: 18, st: 'wip', pct: 30 },
    ],
    testing: [
      { id: 'ts1', name: 'Air tank', nodes: 7, st: 'done', pct: 100 },
      { id: 'ts2', name: 'Drain sub-assem', nodes: 5, st: 'wip', pct: 44 },
    ],
    humanoid: [],
  };

  // Demo tree — leaves (left) → root (right). x/y in world coords.
  const tree = {
    head: [
      { id: 'root', parent: null, lv: 1, x: 540, y: 232, name: 'Head assy upgrade', pn: 'HD-ASSY-00', qty: 1, people: 2, st: 'wip', seq: '1' },
      { id: 's1', parent: 'root', lv: 2, x: 340, y: 110, name: 'Head side covers', pn: 'HD-SIDE-01', qty: 1, people: 1, st: 'done', seq: '1a' },
      { id: 's2', parent: 'root', lv: 2, x: 340, y: 232, name: 'Head top covers', pn: 'HD-TOP-02', qty: 1, people: 1, st: 'wip', seq: '2a' },
      { id: 's3', parent: 'root', lv: 2, x: 340, y: 354, name: 'Cable carrier brackets', pn: 'CC-BRK-03', qty: 1, people: 0, st: 'blocked', seq: '3a' },
      { id: 'l1', parent: 's1', lv: 3, x: 140, y: 66, name: 'AGX side cover — Keep', pn: 'AGX-114', qty: 1, people: 1, st: 'done', seq: '1a' },
      { id: 'l2', parent: 's1', lv: 3, x: 140, y: 154, name: 'Stock side cover', pn: 'STK-220', qty: 1, people: 0, st: 'done', seq: '1b' },
      { id: 'l3', parent: 's2', lv: 3, x: 140, y: 232, name: 'Head top cover', pn: 'HTC-330', qty: 1, people: 1, st: 'wip', seq: '2a' },
      { id: 'l4', parent: 's2', lv: 3, x: 140, y: 308, name: 'Waterproof cover', pn: 'WPC-340', qty: 2, people: 0, st: 'orphan', seq: '2b', link: { kind: 'fastener', label: 'CBE8-20 ×2' } },
      { id: 'l5', parent: 's3', lv: 3, x: 140, y: 390, name: 'Stock side panel', pn: 'SSP-355', qty: 4, people: 0, st: 'blocked', seq: '3a' },
    ],
  };

  const STATUS = {
    done: { label: 'Done', v: 'var(--st-done)' },
    wip: { label: 'WIP', v: 'var(--st-wip)' },
    blocked: { label: 'Blocked', v: 'var(--st-blocked)' },
    orphan: { label: 'Orphan', v: 'var(--st-orphan)' },
  };

  // where-used: part number -> assemblies that consume it (demo)
  const usage = {
    'AGX-114': ['Head assy upgrader'],
    'STK-220': ['Head assy upgrader', 'Pillar rework'],
    'HTC-330': ['Head assy upgrader'],
    'WPC-340': ['Head assy upgrader', 'L3 motor upgrader', 'Pillar1111'],
    'SSP-355': ['Head assy upgrader', 'Pillar upgrade'],
    'HD-SIDE-01': ['Head assy upgrader'],
    'HD-TOP-02': ['Head assy upgrader'],
    'CC-BRK-03': ['Head assy upgrader'],
    'HD-ASSY-00': ['Head assy upgrader'],
  };

  // previous saved revision of the head tree, for diffing
  const revisions = {
    head: {
      label: 'R006', when: '3 days ago',
      prev: [
        { id: 'root', parent: null, name: 'Head assy upgrade', st: 'wip', qty: 1, seq: '1' },
        { id: 's1', parent: 'root', name: 'Head side covers', st: 'wip', qty: 1, seq: '1a' },
        { id: 's2', parent: 'root', name: 'Head top covers', st: 'wip', qty: 1, seq: '2a' },
        { id: 's3', parent: 'root', name: 'Cable carrier brackets', st: 'wip', qty: 1, seq: '3a' },
        { id: 'l1', parent: 's1', name: 'AGX side cover — Keep', st: 'wip', qty: 1, seq: '1a' },
        { id: 'l2', parent: 's1', name: 'Stock cover (old)', st: 'done', qty: 1, seq: '1b' },
        { id: 'l3', parent: 's1', name: 'Head top cover', st: 'wip', qty: 1, seq: '2a' },
        { id: 'l4', parent: 's2', name: 'Waterproof cover', st: 'orphan', qty: 1, seq: '2b' },
        { id: 'lx', parent: 's3', name: 'Old gasket', st: 'done', qty: 1, seq: '3b' },
      ],
    },
  };

  window.AXON = { projects, assemblies, tree, STATUS, usage, revisions };
})();
