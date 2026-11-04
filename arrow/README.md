# Arrow

An offline project and task manager for one computer. It's a single file
(`index.html`) with no internet connection, account, install or server needed.

## Open it
Double-click `index.html` (Chrome or Edge recommended). Bookmark it, or in
Chrome/Edge use **⋮ → Save and share → Create shortcut** to get a desktop icon.

Always open it **the same way, from the same place**. The browser stores the
data per location, so a copy in another folder, or the same file opened
through a local server, starts out empty.

## Where your data lives
In this browser's local storage on this computer. It survives restarts, but
**clearing browsing data / site data for files deletes it**. So:

- Click **Backup** in the sidebar now and then. It downloads
  `arrow-backup-YYYY-MM-DD.json`. The sidebar turns red after 7 days
  without a backup.
- **Restore** loads a backup file (older `axon-tasks-backup-…` files from
  before the rename work too). It replaces the current data, and you can
  undo it from the message that appears.

## How it's organised
Arrow is **project-first**. It opens on **Projects**, a card for each project
showing progress, open / in-progress / blocked / overdue counts and the next
task due. Click a card (or a project in the sidebar) to work inside it.

**Across projects** (Today, Upcoming, Inbox, All tasks) are helper views
that pull tasks from every project, grouped by project. When you add a task
there, pick its project in the box next to it (Arrow remembers your choice).

## Features
- **Projects** with colour, description, progress bar, archive and delete.
- **Tasks** with status (To do / In progress / Blocked / Done), priority,
  due date, tags, subtasks and notes.
- **Views:** Projects overview, each project, and the helper views Today
  (due today, overdue, or in progress), Upcoming, Inbox (tasks with no
  project) and All tasks.
- **List** view (group by due date / status / project / priority),
  **Board** view (drag cards between status columns), or
  **Tree** view: a map of project → tasks → subtasks like Axon's tree.
  The project is always the root; helper views show one tree per project.
  Drag to pan, scroll to zoom, use −/+ on a node to collapse or expand it,
  tick tasks and subtasks right on the map, click a task to open it.
- Search across titles, notes, tags, projects and subtasks; filter by priority.
- Light and dark theme.

## Quick add
Type in the "Add a task" box:

| Type | Effect |
|---|---|
| `#purchasing` | adds tag `purchasing` |
| `!low` `!med` `!high` `!urgent` (or `!1`–`!4`) | sets priority |
| `@today` `@tomorrow` `@fri` `@+3` `@2026-12-01` | sets due date |

Example: `Order fasteners #purchasing !high @fri`

## Keyboard
`N` new task · `/` search · `B` switch list → board → tree · `Esc` close panel
