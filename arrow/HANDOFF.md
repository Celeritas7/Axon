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
- **Tree direction**: right-to-left like Axon (`layoutTree` mirrors the
  columns; links run from a child's right edge to its parent's left edge;
  the collapse handle sits on the parent's left edge).
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
  tasks: [{ id, projectId|null, phaseId|null /*one of its project's phases*/, dependsOn: [taskId] /*must be done first*/, title, notes, status, priority /*0-4*/, due /*YYYY-MM-DD|null*/,
            tags: [string], subtasks: [{ id, title, done }], createdAt, updatedAt, completedAt|null }],
  settings: { theme: 'light'|'dark'|null, view /*'projects'|'project:<id>'|helper*/, layout: 'list'|'board'|'tree',
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
  folder or another browser starts out empty. Backups are the only
  protection against the browser's site data being cleared.
- The board has no manual ordering within a column; cards follow the chosen
  sort.
- No recurring tasks, reminders, notifications, attachments or time tracking.
- `confirm()` dialogs are used for destructive actions (good enough for a
  personal tool).

## Ideas backlog (not started; check with the owner before building)
- Save automatically to a file the owner chooses (File System Access API in
  Chrome/Edge), so data also lives outside the browser.
- Recurring tasks (daily, weekly, monthly).
- Manual drag ordering in the list and board.
- Task dependencies ("blocked by").
- Calendar or week view.
- CSV export of tasks.
- Optional import of projects from the online Axon app (Supabase).

## Git
Work happens on branch `ccr-8774c6ce-u43j92` of `celeritas7/axon`. It isn't
merged to `main` yet. Don't open a PR unless the owner asks.
