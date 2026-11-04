# Axon Tasks — developer handoff

Read this before continuing development in a new chat or session.

## What it is and why
- A **separate offline app** for managing the owner's projects and tasks on
  **one computer**. It is **not** the Axon BOM tree builder (the repo root),
  doesn't replace it, and doesn't switch modes with it. It has no BOM fields.
- The owner's requirements: works with no internet, no account, no server,
  data kept on the local machine.
- It uses Axon's "Datum" look (IBM Plex fonts with system-font fallback,
  electric-blue accent, light and dark themes), with the tokens copied from
  `../css/styles.css`.

## Files
| File | Purpose |
|---|---|
| `index.html` | The entire app: inline CSS and JS, no dependencies, no build. Opened by double-click (`file://`). |
| `README.md` | User-facing guide (how to open, backups, quick-add syntax, shortcuts). |
| `tests/e2e.js` | Browser end-to-end test (Playwright). |
| `HANDOFF.md` | This file. |

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
- **CONSTANTS**: `STORE_KEY = 'axonTasks.v1'`, `STATUSES`
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
- **RENDER**: `renderSidebar`, `renderFoot`, `renderTopbar`,
  `renderContent` (list or board), `renderDrawer` (task details).
  Everything re-renders from state with `innerHTML`. Edits made in the drawer
  call `refreshBehindDrawer()`, which never re-renders the drawer itself, so
  typing isn't interrupted.
- **MODALS / BACKUP / THEME / TOAST**: `projectModal`, `exportBackup`,
  `importBackup` (replaces all data, with undo), `applyTheme`, `toast`.
- **EVENTS**: delegated `click` / `input` / `change` / `submit` / `keydown`
  handlers keyed on `data-act`, `data-view`, `data-layout`, `data-task` and
  element ids. There is also HTML5 drag-and-drop for the board, a `storage`
  event listener to keep several open tabs in sync, and a midnight re-render.

## Data model (localStorage `axonTasks.v1`, and the backup JSON)
```js
{ version: 1,
  projects: [{ id, name, color, description, archived, createdAt }],
  tasks: [{ id, projectId|null, title, notes, status, priority /*0-4*/, due /*YYYY-MM-DD|null*/,
            tags: [string], subtasks: [{ id, title, done }], createdAt, updatedAt, completedAt|null }],
  settings: { theme: 'light'|'dark'|null, view, layout: 'list'|'board', lastBackup /*ISO|null*/ } }
```

## Testing
```bash
npm i playwright-core@1          # in a scratch directory, not the repo
NODE_PATH=<scratch>/node_modules CHROME_PATH=<chromium binary> SHOT_DIR=<scratch> node axon-tasks/tests/e2e.js
```
In Claude Code cloud sessions, Chromium is at
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`. The test covers projects,
quick-add parsing, drawer edits, subtasks, board drag, show-done, search,
reload persistence, backup and restore, undo delete, dark mode, and phone
width. It also writes screenshots to `SHOT_DIR`; look at them after UI
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
