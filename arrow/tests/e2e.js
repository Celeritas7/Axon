const { chromium } = require('playwright-core');
const path_ = require('path');
const APP_URL = 'file://' + path_.resolve(__dirname, '..', 'index.html');
const OUT = process.env.SHOT_DIR || require('os').tmpdir();
const addDaysNode = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  // stand-in for the browser's file picker (File System Access API), kept in memory per page
  await ctx.addInitScript(() => {
    window.__files = {};
    const handle = name => ({
      kind: 'file', name,
      async getFile() { const f = window.__files[name] || { text: '', t: 0 }; return { lastModified: f.t, text: async () => f.text }; },
      async createWritable() { let buf = ''; return { write: async d => { buf += d; }, close: async () => { window.__files[name] = { text: buf, t: Date.now() }; } }; },
      async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; }
    });
    window.showSaveFilePicker = async o => handle((o && o.suggestedName) || 'data.json');
    window.showOpenFilePicker = async () => [handle(window.__openName || 'existing.json')];
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  let dismissNext = false;
  let promptAnswer = null;
  page.on('dialog', d => { if (dismissNext) { dismissNext = false; d.dismiss(); } else if (d.type() === 'prompt' && promptAnswer != null) { d.accept(promptAnswer); promptAnswer = null; } else d.accept(); });
  await page.goto(APP_URL);
  const assert = (c, m) => { if (!c) { throw new Error('FAIL: ' + m); } console.log('ok -', m); };

  assert(await page.title() === 'Arrow', 'app is named Arrow');
  assert(await page.locator('.brand .logo svg #logoGrad').count() === 1, 'logo is the fletched-arrow mark');
  assert(/^data:image\/svg\+xml,/.test(await page.getAttribute('link[rel=icon]', 'href')), 'favicon is inline (no network)');
  assert((await page.textContent('h1')) === 'Projects' && await page.locator('.pcard[data-view^="project:"]').count() === 1, 'opens on the Projects overview');
  await page.click('.pcard[data-view^="project:"]');
  assert((await page.textContent('h1')) === 'Getting started', 'project card opens the project');
  await page.click('[data-view=today]');
  assert(await page.locator('.row').count() >= 1, 'seed tasks shown in Today');
  await page.screenshot({ path: OUT + '/shot-today.png' });

  // new project (from the Projects page, like Axon)
  await page.click('.brand');
  await page.click('[data-act=new-project]');
  await page.fill('#pName', 'Compressor build');
  await page.fill('#pDesc', 'Ship v2 by December');
  await page.click('#projForm button[type=submit]');
  assert((await page.textContent('h1')) === 'Compressor build', 'project created and opened');

  // quick add with syntax
  await page.fill('#quickInput', 'Order fasteners #purchasing !urgent @tomorrow');
  await page.press('#quickInput', 'Enter');
  await page.fill('#quickInput', 'Draft wiring diagram !2 @+5');
  await page.press('#quickInput', 'Enter');
  await page.fill('#quickInput', 'Plain task');
  await page.press('#quickInput', 'Enter');
  assert(await page.locator('.row').count() === 3, 'three tasks added');
  await page.waitForTimeout(300); const db1 = await page.evaluate(() => JSON.parse(localStorage.getItem('axonTasks.v1')));
  const t1 = db1.tasks.find(t => t.title === 'Order fasteners');
  assert(t1 && t1.priority === 4 && t1.tags[0] === 'purchasing' && t1.due, 'quick-add parsed tag/priority/date');

  // open drawer, edit, subtasks
  await page.click('.row:has-text("Plain task") .row-title');
  assert(await page.locator('#drawer.open').count() === 1, 'drawer opens');
  await page.fill('#dTitle', 'Plain task renamed');
  await page.selectOption('#dStatus', 'blocked');
  await page.fill('#subInput', 'Step one'); await page.press('#subInput', 'Enter');
  await page.fill('#subInput', 'Step two'); await page.press('#subInput', 'Enter');
  await page.click('.sub >> nth=0 >> [data-act=sub-toggle]');
  await page.fill('#dNotes', 'Waiting on supplier');
  await page.waitForTimeout(300);
  const t3 = (await page.evaluate(() => JSON.parse(localStorage.getItem('axonTasks.v1')))).tasks.find(t => t.title === 'Plain task renamed');
  assert(t3 && t3.status === 'blocked' && t3.subtasks.length === 2 && t3.subtasks[0].done && t3.notes, 'drawer edits saved');
  await page.screenshot({ path: OUT + '/shot-project-drawer.png' });
  await page.keyboard.press('Escape'); // blur? first escape
  await page.click('[data-act=close-drawer]').catch(() => {});

  // board drag
  await page.click('[data-layout=board]');
  await page.dragAndDrop('.card:has-text("Order fasteners")', '.col[data-status=done]');
  await page.waitForTimeout(300); const t1b = (await page.evaluate(() => JSON.parse(localStorage.getItem('axonTasks.v1')))).tasks.find(t => t.title === 'Order fasteners');
  assert(t1b.status === 'done' && t1b.completedAt, 'drag to Done sets status');
  await page.screenshot({ path: OUT + '/shot-board.png' });

  // toggle done in list, search
  await page.click('[data-layout=list]');
  await page.click('.row:has-text("Draft wiring") [data-act=toggle]');
  await page.waitForTimeout(250);
  assert(await page.locator('.row:has-text("Draft wiring")').count() === 0, 'done task hidden by default');
  await page.click('#showDone');
  assert(await page.locator('.row.done').count() === 2, 'show done reveals them');
  await page.fill('#searchInput', '#purchasing');
  assert(await page.locator('.row').count() === 1, 'search by tag');

  // persistence after reload
  await page.reload();
  assert((await page.textContent('h1')) === 'Compressor build', 'view restored after reload');
  await page.click('[data-view=all]');
  assert(await page.locator('.row').count() >= 4, 'all tasks lists open tasks');

  // export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const path = await dl.path();
  const data = JSON.parse(require('fs').readFileSync(path, 'utf8'));
  assert(data.tasks.length === 7 && data.projects.length === 2, 'backup contains all data');
  assert(/^arrow-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'backup file named arrow-backup-<date>.json');

  // restore
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.setInputFiles('#importInput', path);
  await page.waitForTimeout(300);
  const db2 = await page.evaluate(() => JSON.parse(localStorage.getItem('axonTasks.v1')));
  assert(db2.tasks.length === 7, 'restore replaces data');

  // delete with undo
  await page.click('[data-view=all]');
  await page.click('.row >> nth=0 >> .row-title');
  await page.click('[data-act=delete-task]');
  await page.click('#toast button');
  await page.waitForTimeout(250);
  await page.waitForTimeout(300); assert((await page.evaluate(() => JSON.parse(localStorage.getItem('axonTasks.v1')))).tasks.length === 7, 'undo delete');

  // tree view
  const getDb = () => page.evaluate(() => JSON.parse(localStorage.getItem('axonTasks.v1')));
  await page.click('[data-view=all]');
  await page.click('[data-layout=tree]');
  assert(await page.locator('#treeSvg .troot').count() >= 2 && await page.locator('#treeSvg .troot', { hasText: 'Compressor build' }).count() === 1, 'helper-view tree has one project root per project');
  assert(await page.locator('#treeSvg .ttask').count() >= 5 && await page.locator('#treeSvg .tsub').count() >= 2, 'tree shows tasks and subtasks');
  assert(await page.locator('#treeSvg .tseq', { hasText: '1a' }).count() >= 1 && await page.locator('#treeSvg .tlevel').count() === 3, 'tree has Axon-style sequence badges and level headers');
  await page.selectOption('#treeColor', 'status');
  assert(await page.locator('#treeSvg .tnode').count() > 0, 'colour-by-status redraws the tree');
  await page.selectOption('#treeColor', 'level');
  await page.screenshot({ path: OUT + '/shot-tree.png' });
  await page.click('[data-act=tree-collapse]');
  assert(await page.locator('#treeSvg .tsub').count() === 0, 'collapse hides subtasks');
  await page.click('[data-act=tree-expand]');
  const subCount = await page.locator('#treeSvg .tsub').count();
  assert(subCount >= 2, 'expand all shows subtasks again');
  await page.locator('#treeSvg .ttoggle').first().click();
  assert(await page.locator('#treeSvg .ttoggle text', { hasText: '+' }).count() === 1, 'one node collapses with a +N badge');
  await page.click('[data-act=tree-expand]');
  const subEl = page.locator('#treeSvg .tsub:not(.done)').first();
  const subTask = await subEl.getAttribute('data-task');
  const doneBefore = (await getDb()).tasks.find(t => t.id === subTask).subtasks.filter(x => x.done).length;
  await subEl.locator('[data-act=tree-sub] .d').click();
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.id === subTask).subtasks.filter(x => x.done).length === doneBefore + 1, 'ticking a subtask in the tree saves it');
  const tBefore = await page.getAttribute('#treeG', 'transform');
  const box = await page.locator('#treeSvg').boundingBox();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height - 30); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 130, box.y + box.height - 80, { steps: 5 }); await page.mouse.up();
  assert((await page.getAttribute('#treeG', 'transform')) !== tBefore && await page.locator('#drawer.open').count() === 0, 'dragging pans the tree without opening a task');
  await page.click('[data-act=tree-fit]');
  await page.locator('#treeSvg .ttask .t1').first().click();
  assert(await page.locator('#drawer.open').count() === 1, 'clicking a task node opens its details');
  await page.click('[data-act=close-drawer]');
  await page.reload();
  await page.click('[data-view=all]');
  assert(await page.locator('#treeSvg').count() === 1, 'tree layout remembered after reload');
  await page.keyboard.press('b');
  assert(await page.locator('#tl').count() === 1, 'B cycles tree -> timeline');
  await page.keyboard.press('b');
  assert(await page.locator('.cal-grid').count() === 1, 'B cycles timeline -> calendar');
  await page.keyboard.press('b');
  assert(await page.locator('.content .row').count() > 0, 'B cycles calendar -> list');
  await page.keyboard.press('b'); await page.keyboard.press('b');
  assert(await page.locator('#treeSvg').count() === 1, 'B cycles list -> board -> tree');
  await page.click('[data-layout=list]');

  // helper views add tasks to a chosen project; launch is project-first
  await page.click('[data-view=today]');
  const pid = (await getDb()).projects.find(x => x.name === 'Compressor build').id;
  await page.selectOption('#quickProj', pid);
  await page.fill('#quickInput', 'Call supplier');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(300);
  const cs = (await getDb()).tasks.find(t => t.title === 'Call supplier');
  assert(cs && cs.projectId === pid && cs.due, 'quick add in Today goes to the picked project, due today');
  assert(await page.locator('#quickProj').inputValue() === pid, 'picked project is remembered');
  await page.reload();
  assert((await page.textContent('h1')) === 'Projects', 'reload from a helper view opens the Projects overview');
  await page.click('[data-view=today]');
  await page.click('[data-layout=tree]');
  await page.locator('#treeSvg .troot', { hasText: 'Compressor build' }).click();
  assert((await page.textContent('h1')) === 'Compressor build' && await page.locator('#treeSvg .troot').count() === 1, 'clicking a project root opens that project as a single tree');
  await page.click('[data-layout=list]');

  // checklist templates
  await page.click('[data-view=templates]');
  assert(await page.locator('.tcard', { hasText: 'Work quality checklist' }).count() === 1, 'sample checklist template is there');
  await page.click('.pnew[data-act=new-template]');
  await page.fill('#tName', 'Wiring check');
  await page.fill('#tText', 'Prepare\n  Check drawing rev\n  Label wires\nVerify\n  Continuity test\n  Insulation test\nSign off');
  await page.click('#tplForm button[type=submit]');
  assert(await page.locator('.tcard', { hasText: 'Wiring check' }).count() === 1 && await page.locator('.tcard', { hasText: '5 items' }).count() === 1, 'new template saved with sections and sub-items');
  const pidT = (await getDb()).projects.find(x => x.name === 'Compressor build').id;
  await page.click('.brand'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  const before = (await getDb()).tasks.length;
  await page.click('[data-act=project-template]');
  await page.selectOption('#uTpl', { label: 'Wiring check (5 items)' });
  await page.check('input[name=uMode][value=many]');
  await page.click('#useTplForm button[type=submit]');
  await page.waitForTimeout(300);
  const afterDb = await getDb();
  assert(afterDb.tasks.length === before + 3 && afterDb.tasks.find(t => t.title === 'Verify').subtasks.length === 2, 'template creates a task per section with sub-items');
  await page.click('.row:has-text("Call supplier") .row-title');
  await page.selectOption('#dTemplate', { label: 'Wiring check (5)' });
  await page.waitForTimeout(300);
  const cs2 = (await getDb()).tasks.find(t => t.title === 'Call supplier');
  assert(cs2.subtasks.length === 5 && cs2.subtasks[0].title === 'Prepare › Check drawing rev', 'checklist loads into a task as subtasks');
  dismissNext = true;
  await page.click('[data-act=drawer-done]');
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.title === 'Call supplier').status !== 'done', 'marking done with unticked items asks first (cancel keeps it open)');
  await page.click('[data-act=close-drawer]');
  await page.click('[data-layout=tree]');
  const rootX = Number(await page.locator('#treeSvg .troot .n-bar').first().getAttribute('x'));
  const taskX = Number(await page.locator('#treeSvg .ttask .n-bar').first().getAttribute('x'));
  assert(rootX > taskX, 'tree reads right-to-left like Axon (project on the right)');
  await page.click('[data-layout=list]');

  // phases inside a project
  await page.click('.brand'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('[data-act=phases]');
  await page.click('[data-ph-preset]');
  assert(await page.locator('.ph-row').count() === 4, 'phase preset fills Design/Purchase/Build/Test');
  await page.locator('.ph-row').nth(3).locator('[data-ph-move="-1"]').click();
  await page.click('#phForm button[type=submit]');
  await page.waitForTimeout(300);
  let pdb = (await getDb()).projects.find(x => x.id === pidT);
  assert(pdb.phases.map(x => x.name).join(',') === 'Design,Purchase,Test,Build', 'phases saved in order (with a reorder)');
  assert(await page.locator('.phases .ph[data-phase]').count() >= 5, 'phase strip shows on the project page');
  const build = pdb.phases.find(x => x.name === 'Build').id;
  await page.selectOption('#quickPhase', build);
  await page.fill('#quickInput', 'Assemble frame');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.title === 'Assemble frame').phaseId === build, 'quick add goes into the picked phase');
  await page.click('.row:has-text("Call supplier") .row-title');
  const purchase = pdb.phases.find(x => x.name === 'Purchase').id;
  await page.selectOption('#dPhase', purchase);
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.title === 'Call supplier').phaseId === purchase, 'task moved to a phase from its details');
  await page.click('[data-act=close-drawer]');
  assert(await page.locator('.group-h', { hasText: '2. Purchase' }).count() === 1, 'project list groups by phase');
  await page.click(`.ph[data-phase="${build}"]`);
  assert(await page.locator('.content .row').count() === 1, 'clicking a phase filters to it');
  await page.click('.ph[data-phase=""]');
  await page.click('[data-layout=tree]');
  assert(await page.locator('#treeSvg .tphase').count() >= 4 && await page.locator('#treeSvg .tlevel', { hasText: 'Phases' }).count() === 1, 'tree has a Phases level');
  assert(await page.locator('#treeSvg .tseq', { hasText: '2.1' }).count() >= 1, 'tasks numbered within their phase (2.1)');
  await page.screenshot({ path: OUT + '/shot-phases-tree.png' });
  await page.click('[data-layout=list]');
  await page.click('[data-act=project-template]');
  await page.selectOption('#uTpl', { label: 'Wiring check (5 items)' });
  await page.check('input[name=uMode][value=phases]');
  await page.click('#useTplForm button[type=submit]');
  await page.waitForTimeout(300);
  pdb = (await getDb()).projects.find(x => x.id === pidT);
  const ver = pdb.phases.find(x => x.name === 'Verify');
  assert(ver && (await getDb()).tasks.filter(t => t.phaseId === ver.id).length === 2, 'template sections can become phases with tasks');
  await page.click('.brand');
  assert(await page.locator(`.pcard[data-view="project:${pidT}"] .pc-meta`, { hasText: 'phase' }).count() === 1, 'project card shows the current phase');

  // task dependencies
  await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('.ph[data-phase=""]').catch(() => {});
  const ddb = await getDb();
  const frame = ddb.tasks.find(t => t.title === 'Assemble frame'), supplier = ddb.tasks.find(t => t.title === 'Call supplier');
  await page.click('.row:has-text("Assemble frame") .row-title');
  await page.selectOption('#dAddDep', supplier.id);
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.id === frame.id).dependsOn.includes(supplier.id), 'dependency added from task details');
  assert(await page.locator('.wait-banner').count() === 1 && await page.locator('.dep').count() === 1, 'details show "waiting on" and the dependency');
  await page.click(`[data-open-task="${supplier.id}"]`);
  assert(await page.locator('#dTitle').inputValue() === 'Call supplier' && await page.locator('.dep', { hasText: 'Assemble frame' }).count() === 1, 'prerequisite shows what it blocks');
  assert(await page.locator(`#dAddDep option[value="${frame.id}"]`).count() === 0, 'a loop (A needs B needs A) cannot be picked');
  await page.click('[data-act=close-drawer]');
  assert(await page.locator('.row.waiting:has-text("Assemble frame") .wait').count() === 1, 'list marks a waiting task');
  dismissNext = true;
  await page.click('.row:has-text("Assemble frame") [data-act=toggle]');
  await page.waitForTimeout(250);
  assert((await getDb()).tasks.find(t => t.id === frame.id).status !== 'done', 'finishing a waiting task asks first');
  await page.click('[data-layout=tree]');
  assert(await page.locator('#treeSvg .tdep').count() >= 1 && await page.locator('#treeSvg .ttask.waiting').count() >= 1, 'tree draws dependency arrows');
  await page.screenshot({ path: OUT + '/shot-deps-tree.png' });
  await page.click('[data-layout=list]');
  await page.click('.row:has-text("Call supplier") [data-act=toggle]');
  await page.waitForTimeout(250);
  assert((await page.textContent('#toast')).includes('Ready to start: Assemble frame'), 'finishing a prerequisite announces what is now ready');
  assert(await page.locator('.row.waiting:has-text("Assemble frame")').count() === 0, 'task is no longer waiting once its dependency is done');

  // timeline (Gantt)
  await page.click('.brand'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('[data-layout=timeline]');
  assert(await page.locator('#tl .tl-row.g').count() >= 4 && await page.locator('#tl .tl-today').count() === 1, 'timeline shows phase groups and today line');
  const hf = (await getDb()).tasks.find(t => t.title === 'Assemble frame');
  await page.click(`.tl-set[data-task="${hf.id}"]`).catch(async () => {});
  await page.waitForTimeout(250);
  let hf2 = (await getDb()).tasks.find(t => t.id === hf.id);
  assert(hf2.start && hf2.due && hf2.start <= hf2.due, 'unscheduled task gets dates from "+ Set dates" (or already had them)');
  const bar = page.locator(`.tl-bar[data-task="${hf.id}"]`);
  const bb = await bar.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + 34 * 2 + 3, bb.y + bb.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const hf3 = (await getDb()).tasks.find(t => t.id === hf.id);
  assert(hf3.start === addDaysNode(hf2.start, 2) && hf3.due === addDaysNode(hf2.due, 2) && await page.locator('#drawer.open').count() === 0, 'dragging a bar moves both dates (and does not open it)');
  const bar2 = page.locator(`.tl-bar[data-task="${hf.id}"] .tl-h.r`);
  const rb = await bar2.boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 34 * 3 + 2, rb.y + rb.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);
  const hf4 = (await getDb()).tasks.find(t => t.id === hf.id);
  assert(hf4.start === hf3.start && hf4.due === addDaysNode(hf3.due, 3), 'dragging the right end changes only the due date');
  await page.waitForTimeout(400);
  await page.locator(`.tl-bar[data-task="${hf.id}"]`).click();
  assert(await page.locator('#drawer.open').count() === 1 && await page.locator('#dStart').inputValue() === hf4.start, 'clicking a bar opens the task, with its start date');
  await page.click('[data-act=close-drawer]');
  await page.click('[data-tl-scale=week]');
  assert(await page.locator('.tl-w').count() > 4, 'week scale');
  await page.click('[data-tl-scale=month]');
  await page.click('[data-tl-scale=day]');
  await page.click('[data-layout=list]');

  // effort estimates
  await page.click('.brand'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('.ph[data-phase=""]').catch(() => {});
  await page.fill('#quickInput', 'Bench test ~2.5h');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(300);
  const bt = (await getDb()).tasks.find(t => t.title === 'Bench test');
  assert(bt && bt.estimate === 2.5, 'quick add ~2.5h sets the estimate');
  await page.click('.row:has-text("Bench test") .row-title');
  await page.fill('#dEst', '1d 2h'); await page.press('#dEst', 'Tab');
  await page.fill('#dSpent', '90 min'); await page.press('#dSpent', 'Tab');
  await page.waitForTimeout(300);
  let bt2 = (await getDb()).tasks.find(t => t.id === bt.id);
  assert(bt2.estimate === 10 && bt2.spent === 1.5, 'estimate and spent accept 1d 2h / 90 min');
  assert(await page.locator('#dEst').inputValue() === '10h', 'estimate shown back as hours');
  await page.fill('#dEst', 'lots'); await page.press('#dEst', 'Tab');
  await page.waitForTimeout(250);
  assert((await getDb()).tasks.find(t => t.id === bt.id).estimate === 10, 'nonsense estimate is rejected, value kept');
  await page.click('[data-act=close-drawer]');
  assert(await page.locator('.row:has-text("Bench test") .eff').innerText() === '1.5h/10h', 'list shows spent/estimate');
  assert((await page.textContent('.effline')).includes('8.5h left'), 'project head shows effort left');
  await page.selectOption('#sortSel', 'effort');
  assert((await page.locator('.content .row .row-title').first().innerText()).startsWith('Bench test'), 'sort by effort puts the biggest first');
  await page.selectOption('#sortSel', 'due');
  await page.click('.brand');
  assert((await page.textContent(`.pcard[data-view="project:${pidT}"] .pc-meta`)).includes('left'), 'project card shows hours left');

  // save to a file
  const fileDb = () => page.evaluate(() => JSON.parse(window.__files['arrow-data.json'].text));
  await page.click('.savepill');
  assert(await page.locator('.modal [data-act=fs-create]').count() === 1, 'storage panel offers to create a data file');
  await page.click('.modal [data-act=fs-create]');
  await page.waitForTimeout(400);
  assert((await fileDb()).tasks.length === (await getDb()).tasks.length, 'creating the data file writes all data to it');
  assert((await page.textContent('.savepill')).includes('Saved to file'), 'top bar shows "Saved to file"');
  await page.click('[data-view=today]');
  await page.fill('#quickInput', 'Synced task');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(1300);
  assert((await fileDb()).tasks.some(t => t.title === 'Synced task'), 'changes are saved to the file automatically');
  const viewOnly = (await fileDb()).savedAt;
  await page.click('[data-view=upcoming]');
  await page.waitForTimeout(1200);
  assert((await fileDb()).savedAt === viewOnly, 'just looking around does not rewrite the file');
  // another computer changes the file, and this browser changes too -> ask, never overwrite silently
  await page.evaluate(() => {
    const d = JSON.parse(window.__files['arrow-data.json'].text);
    d.projects.push({ id: 'laptop1', name: 'From laptop', color: '#8250df' });
    d.savedAt = new Date(Date.now() + 60000).toISOString();
    window.__files['arrow-data.json'] = { text: JSON.stringify(d), t: Date.now() };
  });
  await page.click('[data-view=today]');
  await page.fill('#quickInput', 'Local change');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(1300);
  assert((await page.textContent('.savepill')).includes('File changed') && !(await fileDb()).tasks.some(t => t.title === 'Local change'), 'a file changed elsewhere is not overwritten');
  await page.click('.savepill');
  await page.waitForTimeout(200);
  assert(await page.locator('.modal .cmp-side').count() === 2, 'conflict dialog compares file and browser');
  await page.click('.modal [data-act=fs-load]');
  await page.waitForTimeout(300);
  assert((await getDb()).projects.some(x => x.name === 'From laptop'), 'loading the file brings in the other computer\'s data');
  await page.click('[data-view=today]');
  await page.fill('#quickInput', 'After sync');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(1300);
  const fd = await fileDb();
  assert(fd.tasks.some(t => t.title === 'After sync') && fd.projects.some(x => x.name === 'From laptop'), 'saving resumes after choosing');
  await page.click('.savepill');
  await page.click('.modal [data-act=fs-disconnect]');
  await page.waitForTimeout(200);
  assert(!(await page.textContent('.savepill')).includes('file'), 'stop saving to the file');

  // recurring tasks
  const step = await page.evaluate(() => {
    const m = normalizeRepeat({ every: 1, unit: 'month', monthDay: 31 });
    const wk = normalizeRepeat({ every: 1, unit: 'week', weekdays: [1, 4] });   // Mon + Thu
    return [stepDate('2026-01-31', m), stepDate(stepDate('2026-01-31', m), m), stepDate('2026-11-02', wk), stepDate('2026-11-05', wk),
      stepDate('2028-02-29', normalizeRepeat({ every: 1, unit: 'year', monthDay: 29 })), repeatLabel(wk), repeatLabel(normalizeRepeat({ every: 2, unit: 'week', from: 'done' }))];
  });
  assert(step.join('|') === '2026-02-28|2026-03-31|2026-11-05|2026-11-09|2029-02-28|Weekly on Mon, Thu|Every 2 weeks after done', 'repeat dates: month ends, weekdays, leap years, labels');
  await page.click('[data-view=today]');
  await page.fill('#quickInput', 'Daily standup *daily');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(300);
  const ds = (await getDb()).tasks.find(t => t.title === 'Daily standup');
  assert(ds && ds.repeat && ds.repeat.unit === 'day' && ds.due === addDaysNode(addDaysNode(ds.due, 0), 0), 'quick add *daily makes a repeating task due today');
  assert(await page.locator('.row:has-text("Daily standup") .rep').count() === 1, 'list shows the repeat');
  await page.click('.row:has-text("Daily standup") [data-act=toggle]');
  await page.waitForTimeout(300);
  let all = (await getDb()).tasks.filter(t => t.title === 'Daily standup');
  const first = all.find(t => t.id === ds.id), next = all.find(t => t.id !== ds.id);
  assert(all.length === 2 && first.status === 'done' && !first.repeat && next && next.status === 'todo' && next.due === addDaysNode(ds.due, 1) && next.repeat.unit === 'day', 'finishing it keeps a done record and creates the next one (tomorrow)');
  assert((await page.textContent('#toast')).includes('next one tomorrow'), 'toast says when the next one is');
  await page.click('#showDone');
  await page.click(`.row[data-task="${ds.id}"] [data-act=toggle]`);
  await page.waitForTimeout(300);
  all = (await getDb()).tasks.filter(t => t.title === 'Daily standup');
  assert(all.length === 1 && all[0].repeat && all[0].status !== 'done', 'reopening by mistake takes the next one back');
  await page.click('#showDone');
  await page.click('.row:has-text("Daily standup") .row-title');
  await page.selectOption('#dRepeat', 'custom');
  await page.selectOption('#rUnit', 'week');
  await page.waitForTimeout(150);
  await page.click('[data-rwd="5"]');
  await page.selectOption('#rFrom', 'done');
  await page.waitForTimeout(300);
  const ds2 = (await getDb()).tasks.find(t => t.id === ds.id);
  assert(ds2.repeat.unit === 'week' && ds2.repeat.weekdays.includes(5) && ds2.repeat.from === 'done', 'custom repeat: weekly on chosen days, counted from completion');
  assert((await page.textContent('.rep-next')).includes('next one is due'), 'details preview the next due date');
  await page.selectOption('#dRepeat', '');
  await page.waitForTimeout(250);
  assert(!(await getDb()).tasks.find(t => t.id === ds.id).repeat, 'repeat can be switched off');
  await page.click('[data-act=close-drawer]');

  // calendar view
  await page.click('[data-view=all]');
  await page.click('[data-layout=calendar]');
  const today0 = await page.evaluate(() => todayStr());
  assert(await page.locator('.cal-day').count() === 42 && await page.locator(`.cal-day.today[data-date="${today0}"]`).count() === 1, 'month grid of 6 weeks with today marked');
  await page.fill('#quickInput', 'Gym *weekly');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(300);
  const gym = (await getDb()).tasks.find(t => t.title === 'Gym');
  assert(await page.locator(`.cal-day[data-date="${today0}"] .cal-chip[data-task="${gym.id}"]`).count() === 1, 'task shows on its due date');
  assert(await page.locator(`.cal-day[data-date="${addDaysNode(today0, 7)}"] .cal-chip.ghost[data-task="${gym.id}"]`).count() === 1, 'future repeats show as faded previews');
  // drag to another day
  const target = addDaysNode(today0, 2);
  await page.dragAndDrop(`.cal-day[data-date="${today0}"] .cal-chip[data-task="${gym.id}"]`, `.cal-day[data-date="${target}"]`);
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.id === gym.id).due === target, 'dragging a task to another day changes its due date');
  await page.click('#toast button');
  await page.waitForTimeout(250);
  assert((await getDb()).tasks.find(t => t.id === gym.id).due === today0, 'undo puts it back');
  // undated strip -> day
  await page.fill('#quickInput', 'Undated idea');
  await page.press('#quickInput', 'Enter');
  await page.click('[data-view=projects]'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('[data-layout=calendar]');
  await page.fill('#quickInput', 'Pick a date later');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(250);
  const pl = (await getDb()).tasks.find(t => t.title === 'Pick a date later');
  assert(await page.locator(`.cal-undated .cal-chip[data-task="${pl.id}"]`).count() === 1, 'undated tasks wait in the No date strip');
  await page.click('[data-cal-mode=week]');          // shorter grid: strip and day both on screen
  const dayAfter = (await page.evaluate(() => { const d = new Date(); return d.getDay(); })) === 0 ? today0 : addDaysNode(today0, 1);   // stay inside this week
  await page.dragAndDrop(`.cal-undated .cal-chip[data-task="${pl.id}"]`, `.cal-day[data-date="${dayAfter}"]`);
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.id === pl.id).due === dayAfter, 'dragging from No date schedules it');
  await page.click('[data-cal-mode=month]');
  await page.locator(`.cal-day[data-date="${addDaysNode(today0, 3)}"]`).hover();
  await page.click(`.cal-day[data-date="${addDaysNode(today0, 3)}"] [data-act=cal-add]`);
  await page.keyboard.type('Call the vendor');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.find(t => t.title === 'Call the vendor').due === addDaysNode(today0, 3), '+ on a day adds a task due that day');
  await page.click('[data-cal-mode=week]');
  assert(await page.locator('.cal-day').count() === 7, 'week view');
  await page.click('[data-act=cal-next]');
  assert((await page.locator('.cal-day').first().getAttribute('data-date')) > today0, 'next week');
  await page.click('[data-act=cal-today]');
  await page.click('[data-cal-mode=month]');
  await page.locator(`.cal-chip[data-task="${pl.id}"]`).click();
  assert(await page.locator('#drawer.open').count() === 1 && await page.locator('#dTitle').inputValue() === 'Pick a date later', 'clicking a task opens it');
  await page.click('[data-act=close-drawer]');
  await page.click('[data-layout=list]');

  // manual drag ordering
  await page.click('[data-act=new-project]').catch(async () => { await page.click('.brand'); await page.click('[data-act=new-project]'); });
  await page.fill('#pName', 'Order test'); await page.click('#projForm button[type=submit]');
  for (const q of ['Alpha', 'Bravo', 'Charlie', 'Delta']) { await page.fill('#quickInput', q); await page.press('#quickInput', 'Enter'); }
  await page.selectOption('#groupSel', 'none');
  const titles = async () => page.$$eval('.content .rows .row .row-title', els => els.map(e => e.textContent));
  const rowBox = async name => (await page.locator(`.rows .row:has-text("${name}")`).boundingBox());
  const dragRow = async (from, to, below) => {
    const a = await rowBox(from), b = await rowBox(to);
    await page.dragAndDrop(`.rows .row:has-text("${from}")`, `.rows .row:has-text("${to}")`, { sourcePosition: { x: 40, y: a.height / 2 }, targetPosition: { x: 40, y: below ? b.height - 4 : 4 } });
    await page.waitForTimeout(300);
  };
  await dragRow('Delta', 'Alpha', false);
  assert((await titles()).join(',') === 'Delta,Alpha,Bravo,Charlie', 'drag a row above another');
  assert(await page.locator('#sortSel').inputValue() === 'manual', 'first drag switches to Sort: Manual');
  await dragRow('Alpha', 'Charlie', true);
  assert((await titles()).join(',') === 'Delta,Bravo,Charlie,Alpha', 'drag a row below another');
  await page.reload();
  await page.selectOption('#groupSel', 'none');
  assert((await titles()).join(',') === 'Delta,Bravo,Charlie,Alpha' && await page.locator('#sortSel').inputValue() === 'manual', 'manual order and sort are kept after reload');
  await page.fill('#quickInput', 'Echo'); await page.press('#quickInput', 'Enter');
  assert((await titles()).slice(-1)[0] === 'Echo', 'new tasks go to the end');
  // across groups: status grouping moves the status too
  await page.selectOption('#groupSel', 'status');
  await page.click('.row:has-text("Bravo") .row-title'); await page.selectOption('#dStatus', 'doing'); await page.click('[data-act=close-drawer]');
  await dragRow('Charlie', 'Bravo', false);
  assert((await getDb()).tasks.find(t => t.title === 'Charlie').status === 'doing', 'dropping into another status group changes the status');
  // board
  await page.click('[data-layout=board]');
  const cardTitles = async st => page.$$eval(`.col[data-status="${st}"] .card .t`, els => els.map(e => e.textContent));
  const todo0 = await cardTitles('todo');
  const lastCard = todo0[todo0.length - 1], topCard = todo0[0];
  await page.dragAndDrop(`.col[data-status=todo] .card:has-text("${lastCard}")`, `.col[data-status=todo] .card:has-text("${topCard}")`, { targetPosition: { x: 30, y: 4 } });
  await page.waitForTimeout(300);
  assert((await cardTitles('todo'))[0] === lastCard, 'board: drag a card to the top of its column');
  await page.dragAndDrop(`.col[data-status=todo] .card:has-text("${lastCard}")`, `.col[data-status=doing] .card:has-text("Bravo")`, { targetPosition: { x: 30, y: 4 } });
  await page.waitForTimeout(300);
  const doing = await cardTitles('doing');
  assert(doing.indexOf(lastCard) === doing.indexOf('Bravo') - 1 && (await getDb()).tasks.find(t => t.title === lastCard).status === 'doing', 'board: drop between cards of another column sets status and position');
  await page.click('[data-layout=list]');
  await page.selectOption('#sortSel', 'due');

  // CSV export
  await page.click('.brand'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('.row:has-text("Bench test") .row-title');
  await page.fill('#dNotes', 'Line one, with a comma\n"quoted" line two');
  await page.click('[data-act=close-drawer]');
  await page.fill('#quickInput', '=SUM(A1) trick');
  await page.press('#quickInput', 'Enter');
  await page.waitForTimeout(300);
  await page.click('[data-act=csv]');
  const shownN = Number(await page.textContent('#csvHere'));
  const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('#csvForm button[type=submit]')]);
  const raw = require('fs').readFileSync(await csvDl.path(), 'utf8');
  assert(raw.charCodeAt(0) === 0xfeff && csvDl.suggestedFilename().startsWith('arrow-compressor-build-'), 'CSV has a UTF-8 BOM for Excel and a helpful name');
  // tiny CSV parser (quotes, doubled quotes, newlines in cells)
  const parse = txt => { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < txt.length; i++) { const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c; }
    return rows; };
  const rows = parse(raw.slice(1));
  assert(rows[0][2] === 'Task' && rows[0].length === 18 && rows.length - 1 === shownN, 'header plus one row per shown task');
  const bench = rows.find(r => r[2] === 'Bench test');
  assert(bench && bench[14] === 'Line one, with a comma\n"quoted" line two' && bench[7] === '10' && bench[8] === '1.5', 'commas, quotes, line breaks and hours survive');
  assert(rows.some(r => r[2] === "'=SUM(A1) trick"), 'a formula-looking title is made safe');
  await page.click('[data-act=csv]');
  await page.check('input[name=csvScope][value=all]'); await page.check('#csvDone');
  const allN = (await getDb()).tasks.length;
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#csvForm button[type=submit]')]);
  assert(parse(require('fs').readFileSync(await dl2.path(), 'utf8').slice(1)).length - 1 === allN, 'all tasks, including finished ones');

  // import from a file
  const FIX = path_.join(__dirname, 'fixtures');
  await page.click('.brand');
  await page.setInputFiles('#importAnyInput', path_.join(FIX, 'tasks.xlsx'));
  await page.waitForSelector('#impForm');
  assert((await page.textContent('#impForm')).includes('Deadline'), 'xlsx: columns detected (Deadline → Due, Hours → Estimate…)');
  assert(await page.locator('#impForm input[name=impTo][value=column]').isChecked(), 'xlsx: offers the file\'s Project column');
  await page.click('#impForm button[type=submit]');
  await page.waitForTimeout(300);
  let idb = await getDb();
  const enc = idb.projects.find(x => x.name === 'Enclosure build');
  const cut = idb.tasks.find(t => t.title === 'Cut sheet metal');
  assert(enc && enc.phases.map(x => x.name).join(',') === 'Fabrication,Finishing' && cut.projectId === enc.id, 'xlsx: project and phases created');
  assert(cut.status === 'doing' && cut.due === '2026-12-15' && cut.estimate === 3 && cut.tags.join() === 'shop,metal' && cut.notes.startsWith('Use 2 mm'), 'xlsx: status, Excel date, hours, labels and notes read');
  assert(idb.tasks.find(t => t.title === 'Order hinges').status === 'done', 'xlsx: done status');
  await page.click('.brand');
  await page.setInputFiles('#importAnyInput', path_.join(FIX, 'tasks.xlsx'));
  await page.waitForSelector('#impForm');
  await page.click('#impForm button[type=submit]');
  await page.waitForTimeout(300);
  assert((await getDb()).tasks.filter(t => t.title === 'Cut sheet metal').length === 1 && (await page.textContent('#toast')).includes('skipped'), 'importing the same file again skips existing tasks');
  // semicolon CSV with day-first dates into a new project
  await page.click('.brand');
  await page.setInputFiles('#importAnyInput', path_.join(FIX, 'semicolon-dmy.csv'));
  await page.waitForSelector('#impForm');
  await page.fill('#impName', 'QA checks');
  await page.click('#impForm button[type=submit]');
  await page.waitForTimeout(300);
  idb = await getDb();
  const iw = idb.tasks.find(t => t.title === 'Inspect welds');
  assert(iw && idb.projects.find(x => x.id === iw.projectId).name === 'QA checks' && iw.due === '2026-12-15' && iw.priority === 3 && iw.notes === 'Check, then sign off', 'semicolon CSV: DD/MM dates, priority, quoted notes, new project');
  assert((await page.textContent('h1')) === 'QA checks', 'opens the project it imported into');
  await page.click('#toast button');
  await page.waitForTimeout(250);
  assert(!(await getDb()).projects.some(x => x.name === 'QA checks'), 'undo takes the whole import back');
  // Axon BOM export → build plan
  await page.setInputFiles('#importAnyInput', path_.join(FIX, 'axon-bom.csv'));
  await page.waitForSelector('#impForm');
  assert((await page.textContent('#impForm')).includes('Axon') && await page.inputValue('#impName') === 'Head assy upgrade', 'Axon BOM recognised; project named after the top assembly');
  await page.check('#impForm input[name=impTo][value=new]');
  await page.click('#impForm button[type=submit]');
  await page.waitForTimeout(300);
  idb = await getDb();
  const hp = idb.projects.find(x => x.name.startsWith('Head assy upgrade'));
  const at = n => idb.tasks.find(t => t.projectId === hp.id && t.title === n);
  assert(hp.phases.map(x => x.name).join(',').includes('Head side covers') && at('Assemble Head side covers').dependsOn.includes(at('AGX side cover').id), 'Axon: sub-assemblies become phases; assemblies wait on their parts');
  assert(at('AGX side cover').status === 'done' && at('Head top cover').status === 'blocked' && at('AGX side cover').notes.includes('Part number: AGX-114') && at('Assemble Head assy upgrade').dependsOn.length === 2, 'Axon: status, part number, top assembly waits on sub-assemblies');
  // JSON list of tasks into the current project
  await page.setInputFiles('#importAnyInput', path_.join(FIX, 'list.json'));
  await page.waitForSelector('#impForm');
  assert(await page.locator('#impForm input[name=impTo][value=existing]').isChecked(), 'JSON list: defaults to the project you are in');
  await page.click('#impForm button[type=submit]');
  await page.waitForTimeout(300);
  idb = await getDb();
  assert(idb.tasks.find(t => t.title === 'Book crane' && t.projectId === hp.id && t.priority === 4 && t.tags[0] === 'site') && idb.tasks.find(t => t.title === 'Safety briefing').estimate === 0.5, 'JSON list imported with priority, tags, estimate');
  // an Arrow backup added alongside (not replacing)
  const nP = (await getDb()).projects.length;
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('.cluster [data-act=export]')]);
  const bkPath = path_.join(require('os').tmpdir(), 'arrow-merge-test.json');
  await bk.saveAs(bkPath);
  await page.setInputFiles('#importAnyInput', bkPath);
  await page.waitForSelector('#ajForm');
  await page.click('#ajForm button[type=submit]');
  await page.waitForTimeout(300);
  idb = await getDb();
  assert(idb.projects.length === nP * 2 && idb.projects.filter(x => x.name.startsWith('Head assy upgrade')).length === 2 && idb.projects.some(x => / \(\d+\)$/.test(x.name)), 'Arrow backup can be added alongside (same names get "(2)")');
  const copyHp = idb.projects.find(x => x.name !== hp.name && x.name.startsWith('Head assy upgrade'));
  const copyAsm = idb.tasks.find(t => t.projectId === copyHp.id && t.title === 'Assemble Head side covers');
  assert(copyAsm.dependsOn.length && copyAsm.dependsOn.every(id => idb.tasks.find(t => t.id === id).projectId === copyHp.id), 'merged copy keeps its own dependencies');
  await page.click('#toast button');
  await page.waitForTimeout(250);
  assert((await getDb()).projects.length === nP, 'undo the merge');

  // attachments
  await page.click('.brand'); await page.click(`.pcard[data-view="project:${pidT}"]`);
  await page.click('.ph[data-phase=""]').catch(() => {});
  await page.click('.row:has-text("Bench test") .row-title');
  await page.setInputFiles('#attInput', [path_.join(FIX, 'drawing.png'), path_.join(FIX, 'bracket.dwg')]);
  await page.waitForTimeout(600);
  let bt3 = (await getDb()).tasks.find(t => t.title === 'Bench test');
  assert(bt3.attachments.length === 2 && bt3.attachments[0].name === 'drawing.png' && bt3.attachments[0].type === 'image/png', 'attach files from the task panel');
  assert((await page.getAttribute('.att.img img', 'src') || '').startsWith('blob:') && await page.locator('.att.file .att-ic', { hasText: 'DWG' }).count() === 1, 'image thumbnail and file tile shown');
  assert(await page.locator('.row:has-text("Bench test") [title*="2 attachments"]').count() === 1, 'list shows the attachment count');
  await page.click('.att.img');
  await page.waitForTimeout(200);
  assert((await page.getAttribute('.lightbox img', 'src') || '').startsWith('blob:'), 'clicking an image opens it large');
  await page.click('.lightbox [data-act=cancel-modal]');
  await page.hover('.att.file'); await page.click('.att.file .att-x');
  await page.waitForTimeout(200);
  assert((await getDb()).tasks.find(t => t.id === bt3.id).attachments.length === 1, 'remove an attachment');
  await page.click('#toast button'); await page.waitForTimeout(200);
  assert((await getDb()).tasks.find(t => t.id === bt3.id).attachments.length === 2, 'undo brings it back');
  await page.evaluate(() => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'screenshot.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })); });
  await page.waitForTimeout(500);
  assert((await getDb()).tasks.find(t => t.id === bt3.id).attachments.some(a => a.name === 'screenshot.png'), 'paste a screenshot to attach it');
  await page.click('[data-act=close-drawer]');
  const [bk2] = await Promise.all([page.waitForEvent('download'), page.click('.cluster [data-act=export]')]);
  const bk2Path = path_.join(require('os').tmpdir(), 'arrow-att-backup.json');
  await bk2.saveAs(bk2Path);
  const bkJson = JSON.parse(require('fs').readFileSync(bk2Path, 'utf8'));
  const pngId = bt3.attachments[0].id;
  assert(bkJson.files && bkJson.files[pngId] && Buffer.from(bkJson.files[pngId].data, 'base64').length === require('fs').statSync(path_.join(FIX, 'drawing.png')).size, 'backups carry the files');
  // a fresh browser restores the backup with its files
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  p2.on('dialog', d => d.accept());
  await p2.goto(APP_URL);
  await p2.setInputFiles('#importInput', bk2Path);
  await p2.waitForTimeout(500);
  await p2.click(`.pcard:has-text("Compressor build")`);
  await p2.click('.ph[data-phase=""]').catch(() => {});
  await p2.click('.row:has-text("Bench test") .row-title');
  await p2.waitForTimeout(400);
  assert((await p2.getAttribute('.att.img img', 'src') || '').startsWith('blob:'), 'restored in another browser, attachments open');
  await ctx2.close();
  // the data file carries them too
  await page.click('.savepill'); await page.click('.modal [data-act=fs-create]');
  await page.waitForTimeout(500);
  assert((await page.evaluate(id => !!JSON.parse(window.__files['arrow-data.json'].text).files[id], pngId)), 'the data file carries the files');
  await page.click('.savepill'); await page.click('.modal [data-act=fs-disconnect]');

  // timer
  await page.click('.row:has-text("Bench test") .row-title');
  const spent0 = (await getDb()).tasks.find(t => t.id === bt3.id).spent || 0;
  await page.click('[data-act=timer-start]');
  await page.waitForTimeout(300);
  let tdb = await getDb();
  assert(tdb.timer && tdb.timer.taskId === bt3.id && await page.locator('.timer-pill').count() === 1, 'timer starts and shows in the top bar');
  await page.evaluate(() => { db.timer.startedAt = new Date(Date.now() - 25 * 60000).toISOString(); });
  await page.waitForTimeout(1100);
  assert((await page.textContent('.timer-pill .tp-c')).startsWith('0:25:'), 'timer ticks');
  await page.click('.timer-pill [data-act=timer-stop]');
  await page.waitForTimeout(300);
  tdb = await getDb();
  let btt = tdb.tasks.find(t => t.id === bt3.id);
  assert(!tdb.timer && Math.abs(btt.spent - spent0 - 0.42) < 0.02 && btt.time.length === 1, 'stopping adds the time to Spent and logs it');
  // switching tasks stops the first timer
  await page.click('[data-act=timer-start]');
  await page.evaluate(() => { db.timer.startedAt = new Date(Date.now() - 10 * 60000).toISOString(); });
  await page.click('[data-act=close-drawer]');
  await page.click('.row:has-text("Call supplier") .row-title').catch(async () => { await page.click('#showDone'); await page.click('.row:has-text("Call supplier") .row-title'); });
  await page.click('[data-act=timer-start]');
  await page.waitForTimeout(300);
  tdb = await getDb();
  assert(tdb.timer.taskId === tdb.tasks.find(t => t.title === 'Call supplier').id && tdb.tasks.find(t => t.id === bt3.id).time.length === 2, 'starting another timer stops and logs the first');
  // a timer left running overnight asks first
  await page.evaluate(() => { db.timer.startedAt = new Date(Date.now() - 14 * 3600000).toISOString(); save(true); });
  await page.waitForTimeout(400);
  await page.reload();
  assert(await page.locator('.timer-pill').count() === 1, 'timer keeps running after a reload');
  dismissNext = true;
  await page.click('.timer-pill [data-act=timer-stop]');
  await page.waitForTimeout(200);
  assert((await getDb()).timer, 'cancelling the long-timer question keeps it running');
  promptAnswer = '2h';
  await page.click('.timer-pill [data-act=timer-stop]');
  await page.waitForTimeout(300);
  tdb = await getDb();
  const cs3 = tdb.tasks.find(t => t.title === 'Call supplier');
  assert(!tdb.timer && cs3.time.slice(-1)[0].h === 2, 'long timer: log the hours you type');
  await page.click('[data-act=timer-open]').catch(() => {});
  await page.evaluate(id => openDrawer(id), cs3.id);
  const sp = cs3.spent;
  await page.hover('.tlog-r'); await page.click('.tlog-r [data-act=tlog-del]');
  await page.waitForTimeout(250);
  assert(Math.abs(((await getDb()).tasks.find(t => t.id === cs3.id).spent || 0) - (sp - 2)) < 0.01, 'removing a time entry takes it off Spent');
  await page.click('[data-act=close-drawer]');

  // dark + mobile
  await page.click('[data-act=theme]');
  await page.click('[data-view=today]');
  await page.screenshot({ path: OUT + '/shot-dark.png' });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(600); // let the sidebar finish sliding closed
  await page.screenshot({ path: OUT + '/shot-mobile.png' });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  assert(sw <= 390, 'no horizontal page scroll on phone width');

  assert(errs.length === 0, 'no console errors ' + errs.join(' | '));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
