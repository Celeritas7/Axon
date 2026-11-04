const { chromium } = require('playwright-core');
const path_ = require('path');
const APP_URL = 'file://' + path_.resolve(__dirname, '..', 'index.html');
const OUT = process.env.SHOT_DIR || require('os').tmpdir();
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
  page.on('dialog', d => d.accept());
  await page.goto(APP_URL);
  const assert = (c, m) => { if (!c) { throw new Error('FAIL: ' + m); } console.log('ok -', m); };

  assert(await page.title() === 'Arrow', 'app is named Arrow');
  assert(await page.locator('.row').count() >= 1, 'seed tasks shown in Today');
  await page.screenshot({ path: OUT + '/shot-today.png' });

  // new project
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
