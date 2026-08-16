# Axon Phase 5 — install

Drop-in module implementing **§7 Revision diff** from
`axon-redesign/design_handoff_datum/README.md` — the one feature deferred from
phase 4 because it needs a backend table. No existing logic is modified;
everything hooks in from one new JS module + one CSS file (same pattern as
phase 4). It formalises the manual `Temp/index_R000…R007.html` snapshot habit.

## 1. Supabase (required for shared revisions)
Run `phase5/sql/create-revisions-table.sql` in the Supabase SQL editor. It
creates `logi_revisions` (frozen `{nodes, links}` JSONB snapshots per assembly).

*Without it the module still works* — snapshots fall back to localStorage
(this browser only, capped at 8 per assembly) and the panel shows a warning.

## 2. Copy files
- `phase5/js/phase5.js.txt` → `Axon/js/phase5.js` (drop the `.txt` — it only
  keeps this design-system project's compiler from bundling the file)
- `phase5/css/phase5.css` → `Axon/css/phase5.css`

## 3. Edit `Axon/index.html` (2 lines)
In `<head>`, after the phase-4 stylesheet link:
```html
<link rel="stylesheet" href="css/phase5.css">
```
At the bottom, after the phase-4 module:
```html
<script type="module" src="js/phase5.js"></script>
```

Phase 4's `window._axGetZoom` hook (INSTALL step 3 of phase 4) is reused here
for jump-to-node centering; without it, jumps fall back to fit-to-screen.

## What you get
- **Revisions** button on the tree toolbar → a right-hand panel listing this
  assembly's revisions (label, date, author, note), newest first. Labels
  auto-number `R000, R001…` and are editable before saving.
- **Save revision** — freezes the live tree (nodes: name / part № / seq tag /
  status / qty; links: parent / child / qty / fastener) into one snapshot row.
- **Compare vs live** — select one revision → diff against the current tree.
  Added and changed nodes are highlighted **on the tree itself** (green ring =
  added, dashed amber = changed); removed nodes are listed in the modal.
- **Compare two revisions** — select two rows → snapshot-to-snapshot diff
  (older → newer).
- **Diff modal** — summary chips (+added / −removed / ~changed) and grouped
  sections: Added · Removed · Re-parented · Status · Qty & fasteners ·
  Renamed · Part №. Rows for nodes that still exist jump to the node.
- **Delete** — hover a row for the trash icon (confirm prompt; snapshots are
  not recoverable).

## Notes
- Everything is **view-only** — a diff never writes to `logi_nodes`/`logi_links`.
- **Roll-up caveat:** phase 4's Roll up button rewrites statuses in memory
  (view-only). Saving a revision while it is ON freezes the *derived* statuses.
  Turn Roll up off before saving a revision.
- Positions (`tree_x/tree_y`), collapse state, locks, and flags are deliberately
  **not** snapshotted — a revision records the BOM structure, not the canvas.
- The tree highlight re-applies after every graph re-render via a
  MutationObserver and clears when the diff modal closes.
