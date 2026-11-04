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

- Click the **download** button (top right) now and then. It saves
  `arrow-backup-YYYY-MM-DD.json`. The green **Saved locally** pill turns
  red (**Backup due**) after 7 days without a backup; clicking it backs up too.
- The **upload** button (top right) restores a backup file (older `axon-tasks-backup-…` files from
  before the rename work too). It replaces the current data, and you can
  undo it from the message that appears.

## How it's organised
Arrow is **project-first** and laid out like Axon. It opens on **Projects**,
a card for each project with its status, progress and the next task due.
Click a card to work inside it; the breadcrumb at the top takes you back.

**Today, Upcoming, Inbox and All tasks** (buttons in the top bar) are helper
views that pull tasks from every project, grouped by project. When you add a task
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
  **Tree** view: a map of project → tasks → subtasks in Axon's tree style
  (level colours, numbered badges 1, 1a…, level headers), reading right to
  left like Axon: the project is on the right. The project is always the root; helper views show one tree per project. Colour nodes by
  level, status or project.
  Drag to pan, scroll to zoom, use −/+ on a node to collapse or expand it,
  click a node's status dot to tick it off, click a task to open it.
- Search across titles, notes, tags, projects and subtasks; filter by priority.
- Light and dark theme.

## Phases
Split a project into stages done in order, e.g. **Design → Purchase → Build
→ Test**. On a project page click **Phases** to add, rename, reorder or
remove them (or use the Design · Purchase · Build · Test preset).

- The **phase strip** under the project title shows each phase's progress;
  the current phase is highlighted. Click a phase to show only its tasks.
- New tasks go into the phase picked next to the add box; move a task with
  **Phase** in its details.
- The list groups by phase, and the **tree** gets a Phases level between the
  project and its tasks (numbered 1, 1.1, 1.1a…).
- A template can create phases: **From template → A phase for each section**.
- Project cards show which phase you're in.

## Checklist templates
Keep the things you must always check as **templates** (top bar →
**Templates**). Write one item per line; indent a line (Tab or 2 spaces) to
make it a sub-item of the line above, e.g.

```
Before starting
  Drawing revision confirmed
  Parts available
Before closing
  Self-review done
  Tested against the requirement
```

Use a template in either of two ways:
- **In a task:** open the task and pick **Load checklist from template…**.
  Every item is added as a subtask to tick off.
- **In a project:** click **From template**, then choose *one task with the
  checklist* or *a task for each section*.

If you mark a task done while checklist items are still unticked, Arrow asks
first and lists what's left, so nothing is missed. **Save as template** in a
task turns its subtasks into a new template. A sample "Work quality
checklist" is included; edit it to suit your work.

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
