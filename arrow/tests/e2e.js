const { chromium } = require('playwright-core');
const path_ = require('path');
const APP_URL = 'file://' + path_.resolve(__dirname, '..', 'index.html');
const OUT = process.env.SHOT_DIR || require('os').tmpdir();
const addDaysNode = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  let dismissNext = false;
  page.on('dialog', d => { if (dismissNext) { dismissNext = false; d.dismiss(); } else d.accept(); });
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
  assert(await page.locator('.content .row').count() > 0, 'B cycles timeline -> list');
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
