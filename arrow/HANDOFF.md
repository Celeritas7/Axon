# Arrow — developer handoff

Read this before continuing development in a new chat or session.

## What it is and why
- **Name:** Arrow (formerly "Axon Tasks"; renamed at the owner's request, and
  the folder moved from `axon-tasks/` to `arrow/`). The localStorage key is
  still `axonTasks.v1` on purpose: renaming it would make existing data
  disappear. Don't change it without a migration that copies the old key.
- A **separate offline app** for managing the owner's projects and tasks on
  **one computer**. It is **not** the Axon BOM tree builder (the repo root),
  doesn't replace it, and doesn't switch modes with it. It has no BOM fields.
- The owner's requirements: works with no internet, no account, no server,
  data kept on the local machine.
- It follows Axon's "Datum" look closely (owner asked for "as clean as
  Axon"): reference is `../axon-redesign/design_handoff_datum/` (README +
  `reference/`). Tokens, top app bar (no sidebar), breadcrumbs, `.cluster`
  button groups, project cards with a status edge, and Axon-style tree nodes
  (level fill + left bar, mono meta, sequence badge, status dot, level header
  pills, vertical zoom stack). IBM Plex Sans/Mono are **embedded as base64
  woff2** in `<style id="plexFonts">` (OFL, see `FONTS-LICENSE.txt`), so no
  network is needed. Don't edit that block by hand.

## Project-first (owner's direction)
The app is organised around **projects**; Today / Upcoming / Inbox / All tasks
are helpers. Concretely: launch opens the last project or the `projects`
overview (helper views are never restored on launch); the sidebar lists
projects first and helpers under "Across projects"; helper views group by
project by default; helper-view quick add has a project picker
(`#quickProj`, remembered in `settings.lastProject`, `''` = Inbox); the tree
is always rooted on a project (one tree per project in helper views). Keep
new features consistent with this.

## Files
| File | Purpose |
|---|---|
| `index.html` | The entire app: inline CSS and JS, no dependencies, no build. Opened by double-click (`file://`). |
| `README.md` | User-facing guide (how to open, backups, quick-add syntax, shortcuts). |
| `tests/e2e.js` | Browser end-to-end test (Playwright). |
| `HANDOFF.md` | This file. |
| `FONTS-LICENSE.txt` | SIL OFL 1.1 for the embedded IBM Plex fonts. |

## Hard constraints (keep these)
1. **No network requests at all**: no CDN scripts, fonts, analytics or APIs.
2. **Single file** that works from `file://` (no ES-module imports from
   other files, no service worker). Don't use `crypto.randomUUID`, which isn't
   reliable on `file://`; use the existing `uid()`.
3. **Never lose user data.** Any change to the data shape must still load
   older saves and older backup files. Do this through the `normalize*`
   functions, and bump `version` with a migration if needed.
4. Escape all user text with `esc()` before putting it in HTML.

## Architecture (`index.html` script, in order)
- **CONSTANTS**: `STORE_KEY = 'axonTasks.v1'` (kept from the old name; do not rename), `STATUSES`
  (todo/doing/blocked/done), `PRIORITIES` (0 None … 4 Urgent),
  `PROJECT_COLORS`, `ICON` paths with the `ic()` helper.
- **HELPERS**: local-date helpers (dates are stored as local `YYYY-MM-DD`
  strings, never UTC), `fmtDue`, `esc`, `uid`.
- **STORE**: `emptyDb`, `normalizeTask`, `normalizeProject`, `normalizeDb`
  (also checks that imported data has the right shape), `seedDb` (the sample
  "Getting started" project on first run), `loadDb`. `save()` is debounced
  by 150 ms and also flushed on `beforeunload`.
- **UI STATE**: the `ui` object (view, layout, search, filters, open task).
  View and layout are kept in `db.settings`.
- **TASK QUERIES**: `inView(task, view)` holds each view's rules, then
  `matchesFilters`, `SORTS`, `visibleTasks`, `groupTasks` / `dueBucket`.
- **MUTATIONS**: `updateTask` (sets or clears `completedAt` when the status
  changes), `createTask`, `deleteTask` (with undo toast), `toggleDone`,
  `parseQuick` / `quickAdd`.
- **RENDER**: `renderSidebar` (now draws the top app bar: logo, breadcrumbs,
  helper-view buttons), `renderFoot` (save pill + backup/restore/theme),
  `renderTopbar` (page head: eyebrow, title, toolbar),
  `renderContent` (list, board or tree), `renderDrawer` (task details).
  Everything re-renders from state with `innerHTML`. Edits made in the drawer
  call `refreshBehindDrawer()`, which never re-renders the drawer itself, so
  typing isn't interrupted.
- **RENDER: PROJECTS OVERVIEW**: `projectStats`, `projectCardHtml`,
  `projectsOverviewHtml` (the home screen, view id `projects`).
- **RENDER: TREE**: a node-link diagram modelled on Axon's tree view
  (`js/graph.js` at the repo root), but plain SVG with no D3, so it stays
  offline. `treeModel` returns one root per project (just the current project on a
  project page, every project with matching tasks in helper views) →
  tasks → subtasks; `layoutTree` places columns by depth and centres each
  parent on its children; `nodeSvg` / `linkPath` draw it; `wireTree` adds
  pan (pointer drag), wheel zoom and a capture-phase click guard so a pan
  doesn't count as a click. Colour mode (`ui.tree.color`: level/status/project) and pan/zoom/collapsed
  state live in `ui.tree`
  (session only, not saved); it auto-fits when the view changes.
- **TEMPLATES** (checklists): `parseTemplate(text)` → sections with
  children; `checklistFromTemplate` flattens to subtask titles
  ("Section › item"); `loadChecklist` (task, skips duplicates);
  `applyTemplateToProject` (mode `one` = one task with the checklist, `many` =
  a task per section). `templatesHtml`, `templateModal`, `useTemplateModal`.
  A save with no `templates` field gets the sample checklist once (in
  `normalizeDb`). `confirmDone(t)` asks before marking a task done while
  subtasks are unticked; it is used by toggle, the drawer status select and
  board drops.
- **PHASES**: `project.phases` (ordered) and `task.phaseId`; `normalizeDb`
  clears a phaseId that isn't in the task's project. Helpers `phaseOf`,
  `phaseStats`, `currentPhase` (first phase with open work). UI:
  `phaseStripHtml` (filter chips; `ui.phase` = null | 'none' | id, reset by
  `setView`), `phasesModal` (add/rename/reorder/remove; removed phases leave
  their tasks with no phase), drawer `#dPhase`, quick-add `#quickPhase`
  (remembered per project in `ui.quickPhase`), list group mode `phase`
  (default on a project with phases), tree level `phase` on project pages
  only (helper-view trees stay project → task), template mode `phases`.
- **DEPENDENCIES**: `task.dependsOn` (ids; `normalizeDb` drops unknown ids,
  reads ignore ids of deleted tasks so undo-delete restores links).
  `depsOf`, `openDeps` ("waiting"), `dependentsOf`, `wouldCycle` (the picker
  never offers a task that would create a loop), `announceReady` (toast after
  a task is finished). `confirmDone` warns about open dependencies as well as
  unticked subtasks. Drawer section `depsHtml`; list/board `.wait` chip;
  tree `depLinks` draws dashed arrows in the gap left of the task column
  (only between tasks that are both visible).
- **CSV EXPORT**: `csvModal` (scope "here" = `shownTasks(includeDone)`:
  view + phase + search/priority filters; or all tasks), `csvRows` (sorted
  by project order, phase, then the current sort), `csvCell` (RFC 4180
  quoting; leading = + - @ tab CR get a ' to stop formula injection),
  `exportCsv` (UTF-8 BOM, CRLF). Columns in `CSV_COLUMNS`.
- **MANUAL ORDER**: `task.order` + `SORTS.manual` (unplaced tasks after,
  oldest first). Rows (`.rows .row`, grip handle) and board cards use the
  shared HTML5 drag handlers: drop on a row/card → `placeIn` the visible ids
  and `applyOrder` (10, 20, 30…); `groupPatch` moves the task into the target
  row's group (status/phase/priority/project); `useManualSort` switches and
  remembers the sort (`settings.sort`, excluded from `bodyOf`).
- **RECURRING**: `normalizeRepeat`, `stepDate` (weekdays only when every
  is 1; months/years keep `monthDay`, clamped to short months), `nextDue`
  (fixed schedules skip missed dates), `repeatLabel`, `presetRepeat` /
  `presetKey`. Every status change goes through `afterStatusChange(t, prev)`:
  done → `spawnNext` (new task, repeat moves to it, `t.nextId` set) or
  `announceReady`; reopened → `undoSpawn` removes the untouched next one.
  Quick add `*daily` … `*yearly`. Drawer `repeatHtml`.
- **EFFORT**: `task.estimate` / `task.spent` in hours. `parseHours` accepts
  4h, 1.5, 30m, 90 min, 2d (8h/day, `HOURS_PER_DAY`), 1d 4h; `fmtH` prints
  them. `effortOf(tasks)` → { est, done, left (open est − spent, ≥0), spent,
  over, counted, pct }; used by `effortLine` (project head), phase strip,
  phase tree nodes, project cards, helper-view heads and timeline groups.
  Quick add `~4h`; template lines may end in `~3h` (`splitEstimate`).
  `SORTS.effort`.
- **CALENDAR** (layout `calendar`): `calRange` (42-day Monday-first month
  grid or 7-day week from `ui.cal.anchor`), `calShift`, `calendarHtml` (tasks
  by due date, repeat previews via `stepDate`, per-day effort, undated strip).
  Chips use the board's HTML5 drag & drop (`.cal-chip[data-cal]` → `.cal-day`
  drop changes due, shifts start, toast with undo). `cal-add` pre-fills quick
  add with `@date`.
- **TIMELINE** (Gantt, layout `timeline`): `tlSpan` (start..due, either may
  be missing), `timelineRows` (phase groups on a project page, project groups
  in helper views), `timelineHtml` (HTML bars on a CSS-gradient day grid,
  an SVG overlay for dependency arrows, today line), `wireTimeline` (drag to
  move / resize by whole days, scroll memory per view+scale). Scale in
  `ui.tl.scale` (`TL_SCALE` px/day). A drag sets `ui.tl.dragEnd` so the
  click that follows is ignored. Drawer has `#dStart`; start/due are kept in
  order. Conflict = dependent starts before an unfinished prerequisite's due.
- **Tree direction**: right-to-left like Axon (`layoutTree` mirrors the
  columns; links run from a child's right edge to its parent's left edge;
  the collapse handle sits on the parent's left edge).
- **SAVE TO A FILE** (File System Access API; Chrome/Edge, works on
  `file://`): localStorage stays the main store; `save()` also schedules
  `writeFile` (700 ms) when the data really changed. `db.savedAt` is bumped
  only when `bodyOf(db)` changes (view/layout/lastBackup don't count), so
  opening or browsing never looks like an edit. The file handle lives in
  IndexedDB (`idbHandle`), the savedAt last synced with the file in
  localStorage `arrow.fileSavedAt` (`fsKnown`). `writeFile` re-reads the file
  first and stops with state `conflict` if its savedAt isn't the known one.
  `fsStartup` → `fsSync`: same stamp = in sync; only the file changed = load it
  (with undo); only local changed = write; both = `conflict` (pill → 
  `conflictModal`: load file / keep browser). States in `fs.state`: none, ok,
  saving, permission (pill → `fsReconnect`, needs a click), conflict, error.
  UI: `storageModal` (from the pill). e2e mocks `showSaveFilePicker`.
- **MODALS / BACKUP / THEME / TOAST**: `projectModal`, `exportBackup`,
  `importBackup` (replaces all data, with undo), `applyTheme`, `toast`.
- **EVENTS**: delegated `click` / `input` / `change` / `submit` / `keydown`
  handlers keyed on `data-act`, `data-view`, `data-layout`, `data-task` and
  element ids. There is also HTML5 drag-and-drop for the board, a `storage`
  event listener to keep several open tabs in sync, and a midnight re-render.

## Data model (localStorage `axonTasks.v1`, and the backup JSON)
```js
{ version: 1,
  projects: [{ id, name, color, description, archived, phases: [{ id, name }] /*ordered*/, createdAt }],
  templates: [{ id, name, text /*one item per line; indented = sub-item*/, createdAt }],
  tasks: [{ id, projectId|null, phaseId|null /*one of its project's phases*/, dependsOn: [taskId] /*must be done first*/, start /*YYYY-MM-DD|null*/, estimate /*hours|null*/, spent /*hours|null*/,
            repeat: { every, unit: 'day'|'week'|'month'|'year', weekdays: [0-6], monthDay, from: 'due'|'done' }|null,
            nextId /*occurrence created when this was done*/, order /*manual position|null*/, title, notes, status, priority /*0-4*/, due /*YYYY-MM-DD|null*/,
            tags: [string], subtasks: [{ id, title, done }], createdAt, updatedAt, completedAt|null }],
  settings: { theme: 'light'|'dark'|null, sort /*remembered*/, view /*'projects'|'project:<id>'|helper*/, layout: 'list'|'board'|'tree'|'timeline'|'calendar',
              lastBackup /*ISO|null*/, lastProject /*id|''|null*/ } }
```

## Testing
```bash
npm i playwright-core@1          # in a scratch directory, not the repo
NODE_PATH=<scratch>/node_modules CHROME_PATH=<chromium binary> SHOT_DIR=<scratch> node arrow/tests/e2e.js
```
In Claude Code cloud sessions, use `CHROME_PATH=/opt/pw-browsers/chromium`
(the versioned folder names under `/opt/pw-browsers/` change between images). The test covers projects,
quick-add parsing, drawer edits, subtasks, board drag, show-done, search,
reload persistence, backup and restore, undo delete, the tree view
(collapse, subtask ticks, pan, click-to-open), dark mode, and phone width. It also writes screenshots to `SHOT_DIR`; look at them after UI
changes. Extend the test whenever you add a feature.

## Known limitations
- Data is per browser and per file location. Opening the file from another
  folder or another browser starts out empty, until you connect the same
  data file there (Chrome/Edge). Without a data file, backups are the only
  protection against the browser's site data being cleared.
- Data-file sync is "last saved wins with a prompt", not a merge: if two
  computers both change things, the owner picks one side.
- No reminders, notifications or attachments. Effort is
  entered by hand (no timer).
- `confirm()` dialogs are used for destructive actions (good enough for a
  personal tool).

## Ideas backlog (check with the owner before building)
Built since the first handoff: tree view, project-first layout, Axon look,
checklist templates, phases, dependencies, timeline, effort, save to a file,
recurring tasks, calendar, manual ordering, CSV export.
Still open:
- Optional import of projects from the online Axon app (Supabase).

## Git
Work happens on branch `ccr-8774c6ce-u43j92` of `celeritas7/axon`. It isn't
merged to `main` yet. Don't open a PR unless the owner asks.
