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

## Features
- **Projects** with colour, description, progress bar, archive and delete.
- **Tasks** with status (To do / In progress / Blocked / Done), priority,
  due date, tags, subtasks and notes.
- **Views:** Today (due today, overdue, or in progress), Upcoming, Inbox
  (tasks with no project), All tasks, and each project.
- **List** view (group by due date / status / project / priority) or
  **Board** view (drag cards between status columns).
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
`N` new task · `/` search · `B` switch list/board · `Esc` close panel
