# Axon Phase 4 — install

Drop-in module implementing the §6 derived UX features from
`axon-redesign/design_handoff_datum/README.md`. No existing logic is modified —
everything hooks in from one new JS module + one CSS file.

Already in the live app (skipped here): **working level filter** (≤Ln select)
and **color by level / status / group** (Color select).

## 1. Copy files
- `phase4/js/phase4.js.txt` → `Axon/js/phase4.js` (drop the `.txt` — it only keeps
  this design-system project's compiler from bundling the file)
- `phase4/css/phase4.css` → `Axon/css/phase4.css`

## 2. Edit `Axon/index.html` (2 lines)
In `<head>`, after the existing stylesheet link:
```html
<link rel="stylesheet" href="css/phase4.css">
```
At the bottom, after the app module:
```html
<script type="module" src="js/phase4.js"></script>
```

## 3. Edit `Axon/js/graph.js` (1 line, optional but recommended)
In `initZoom()`, after `svg.call(zoomBehavior);` (~line 46) add:
```js
window._axGetZoom = () => zoomBehavior;
```
This lets jump-to-node **center + zoom on the node**. Without it, jumping
falls back to fit-to-screen + highlight halo.

## 4. Supabase (optional)
Run `phase4/sql/add-flagged-column.sql` to persist node flags in
`logi_nodes.flagged` (shared across users). Without it flags stay
localStorage-only, exactly as today.

## What you get
- **⌘K / Ctrl+K palette** — searches assemblies, this tree's nodes (name /
  part № / seq tag), plus a live where-used query across all assemblies in
  the DB; Enter jumps to the node (loads the other assembly if needed).
  Also a search button in the header.
- **Interactive legend** — click a level or status chip to isolate (dims
  non-matches); click again to clear.
- **Theme toggle** — sun/moon button in the header sets `data-theme="dark"`
  (your Blueprint CSS), persisted in localStorage.
- **Roll up** button — parent statuses derived from children
  (BLOCKED > IN_PROGRESS > NOT_STARTED > DONE). View-only: originals are
  restored when toggled off. *Caveat: while ON, the BOM status dropdowns show
  derived values — don't bulk-edit statuses with roll-up on.*
- **Crit path** button — highlights the chain from the deepest blocked node
  to the root in red and dims the rest.
- **Tidy** button — clears saved positions of unlocked nodes so the tree
  layout recomputes clean columns, then fits to screen. View-only until you
  hit Save Positions.
- **Issues** button — right-hand panel listing orphans, missing part №,
  qty = 0, and blocked nodes; click a row to jump to that node.
- **BOM extended qty** — the BOM overlay gains a Units field (persisted per
  assembly) and each part row shows `= N` (qty × ancestor qtys × units).
- **Flag sync** — flagging a node also writes `logi_nodes.flagged` (if the
  column exists) and flags load from the DB on assembly open.

## Notes
- Overlays (isolate / crit path) re-apply automatically after every graph
  re-render via a MutationObserver — no changes to `renderGraph()`.
- The palette's where-used query uses your existing Supabase client and RLS;
  if the query fails it degrades silently to local results.
