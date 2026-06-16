# Handoff: Axon UI Redesign — "Datum" theme

## Overview
This package contains a **high-fidelity design reference** for restyling the Axon Tree-Builder app
(projects → assemblies → BOM tree, with BOM / Pickup / Assistant views) into a cohesive visual
system called **Datum**: a precise, light, engineering-tool look built on **IBM Plex Sans + IBM Plex
Mono**, an electric-blue accent, and a harmonized level/status colour palette.

It also adds a set of UX upgrades (global search, interactive legend, light/dark theme, status
roll-up, critical path, auto-tidy, color-by-group, working level filter, issues panel, rolled-up BOM
quantities, node drag/lock/flag, assembly management). The **revision-diff** and **barcode-scan**
features were intentionally left out of this base bundle and should be a later phase (see
§7 — they need a backend change).

## About the design files (read this first)
The files in `reference/` are a **design reference prototype**, NOT production code to copy in.
They are written in **React + in-browser Babel with hard-coded demo data** (`data.js` →
`window.AXON`). The real Axon app is a **different stack**:

| | Reference prototype | Real Axon app |
|---|---|---|
| Rendering | React + Babel (JSX) | **vanilla JS + D3** (SVG tree) |
| Data | hard-coded `window.AXON` | **Supabase** (`logi_projects`, `logi_assemblies`, `logi_nodes`, `logi_links`) |
| Tree nodes | HTML `<div>`s | D3-drawn SVG in `js/graph.js` |

### 🔴 Golden rule — DO NOT replace files. Port in place.
Do **not** drop these files into the app or swap `styles.css` for `redesign.css`. That would delete
the Supabase wiring and the D3 tree. Instead, **edit the real app's existing files** to adopt the
Datum look while keeping all current behavior and the live database. The reference is the *target*;
your job is to make the real app match it.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, and shadows below are final — match them exactly.

---

## 1. Recommended order of work (lowest risk first)
1. **`css/styles.css`** — reskin everything via the Datum tokens. ~80% of the look, pure CSS, no logic
   touched, fully reversible. Do this first and ship it on its own.
2. **`index.html`** — replace emoji control buttons with the line-icon SVG set (see `reference/icons.jsx`).
3. **`js/graph.js`** — update the D3 node/link **drawing attributes** to match Datum nodes (fill + left
   colour bar, mono part numbers, fully-visible sequence badge, fastener-link colour). Data flow
   unchanged — only `.attr()` values and appended shapes change.
4. *(optional, later)* the derived UX features in §6, then the revision-diff backend in §7.

---

## 2. Design tokens — paste these into `css/styles.css`
Define once on `:root` (light/Datum) with a `[data-theme="dark"]` override (Blueprint). Everything
else references the variables.

```css
:root {
  /* surfaces & ink */
  --bg:#eef2f7; --canvas:#f6f8fb; --surface:#ffffff; --surface-2:#f1f4f8; --surface-3:#e8edf3;
  --border:#e0e6ee; --border-2:#d2dae4;
  --ink:#101720; --ink-2:#56616f; --ink-3:#8d97a4;
  /* accent */
  --accent:#1f6feb; --accent-2:#1559c4; --accent-soft:#e7f0fe; --on-accent:#ffffff;
  /* control chrome */
  --ctl:#ffffff; --ctl-border:#d6dde6; --ctl-hover:#f2f5f9;
  --header-bg:#ffffff; --header-ink:#101720;
  /* shape */
  --radius:9px; --radius-sm:6px;
  --shadow-card:0 1px 2px rgba(16,23,32,.04), 0 4px 14px rgba(16,23,32,.06);
  --shadow-pop:0 8px 30px rgba(16,23,32,.14);
  /* tree canvas */
  --tree-bg:#fbfcfe; --grid:rgba(31,111,235,.06); --grid-strong:rgba(31,111,235,.10);
  --link:#aeb9c7; --node-fill:#ffffff; --node-text:#16202c;

  /* LEVEL palette — bar (saturated) + fill (soft). Keep the L1..L8 meaning. */
  --lv1-bar:oklch(0.60 0.13 150); --lv1-fill:oklch(0.95 0.045 150);  /* green  */
  --lv2-bar:oklch(0.58 0.15 300); --lv2-fill:oklch(0.95 0.045 300);  /* violet */
  --lv3-bar:oklch(0.58 0.14 245); --lv3-fill:oklch(0.95 0.045 245);  /* blue   */
  --lv4-bar:oklch(0.60 0.11 190); --lv4-fill:oklch(0.95 0.045 190);  /* teal   */
  --lv5-bar:oklch(0.72 0.13 85);  --lv5-fill:oklch(0.95 0.055 90);   /* amber  */
  --lv6-bar:oklch(0.66 0.15 55);  --lv6-fill:oklch(0.95 0.055 60);   /* orange */
  --lv7-bar:oklch(0.62 0.17 25);  --lv7-fill:oklch(0.95 0.05 25);    /* red    */
  --lv8-bar:oklch(0.62 0.01 250); --lv8-fill:oklch(0.94 0.004 250);  /* gray   */

  /* STATUS — map the app's enum to these */
  --st-done:oklch(0.62 0.14 150);     /* DONE        */
  --st-wip:oklch(0.74 0.14 80);       /* IN_PROGRESS */
  --st-blocked:oklch(0.60 0.20 25);   /* BLOCKED     */
  --st-orphan:oklch(0.58 0.16 300);   /* orphan / NOT_STARTED */
}

/* Dark "Blueprint" theme (wire to a sun/moon toggle) */
[data-theme="dark"] {
  --bg:#0c1119; --canvas:#0e141d; --surface:#141c28; --surface-2:#1a2433; --surface-3:#22303f;
  --border:#26303f; --border-2:#33445a;
  --ink:#e8eef7; --ink-2:#9aabc1; --ink-3:#65758c;
  --accent:#4f9df3; --accent-2:#75b4f7; --accent-soft:rgba(79,157,243,.14); --on-accent:#08111f;
  --ctl:#1a2433; --ctl-border:#2c3a4d; --ctl-hover:#22303f;
  --header-bg:#10171f; --header-ink:#e8eef7;
  --shadow-card:0 1px 0 rgba(255,255,255,.03), 0 8px 26px rgba(0,0,0,.45);
  --shadow-pop:0 12px 40px rgba(0,0,0,.6);
  --tree-bg:#0b1018; --grid:rgba(99,150,210,.10); --grid-strong:rgba(99,150,210,.16);
  --link:#3a4c63; --node-fill:#16202e; --node-text:#e8eef7;
  /* level fills become dark tints, bars stay luminous — see reference/redesign.css `.dir-b` block */
}
```

**Typography:** load IBM Plex Sans (400/500/600/700) + IBM Plex Mono (400/500/600) from Google Fonts.
Body/UI = Plex Sans. **Use Plex Mono for all data:** part numbers, sequence tags, quantities, counts,
levels (`L2`), the `db` indicator, and table numerals (`font-feature-settings:'tnum'`).

---

## 3. `css/styles.css` — map real elements to Datum
Keep the existing selectors; change their declarations. Key mappings (full reference in
`reference/redesign.css` + `reference/prototype.css`):

- **`.header`** — drop the dark navy gradient → `background:var(--header-bg)`, `color:var(--header-ink)`,
  `border-bottom:1px solid var(--border)`. Wordmark "Axon" 16px/600 with a 22px rounded-square
  accent logomark. Group the dense controls into clustered segments: a bordered `.group` wrapper
  (`border:1px solid var(--ctl-border); border-radius:var(--radius-sm)`) holding 30×30 icon buttons
  separated by 1px dividers; selects become `.axe-select` pills.
- **Buttons** — `.header-btn`: 30px tall, `--radius-sm`, `var(--ctl)` bg, `var(--ctl-border)`. Primary
  = `var(--accent)` bg / `var(--on-accent)`. Remove the per-button material colours (#3498db etc.).
- **`.project-card`** — `var(--surface)`, `1px solid var(--border)`, `--radius`, `--shadow-card`; a 3px
  left **accent edge** coloured by status; 42px rounded-square icon tile; name 15px/600; meta in mono;
  footer = thin progress bar + `%` (mono) + a Visible/Hidden switch + edit/delete on hover. Hover:
  `translateY(-3px)` + `--shadow-pop`.
- **`.assembly-card`** — same system, `cols3` grid.
- **`.legend`** — `var(--surface)`, hairline bottom border, 11px; swatches 11px/3px radius. Make each
  swatch chip **clickable to isolate** that level/status (dim non-matches) — see §6.
- **`.bom-table` / BOM overlay** — overlay = centered `.modal` card (`max-width:940px`, `--radius` 14px,
  `--shadow-pop`) NOT full-bleed dark. Group header rows tinted by `--lv*-bar`; part rows in a CSS grid
  with mono `#`, editable seq pill, item, mono part №, qty, **Ext** (rolled qty), status dot. Sticky
  column header in `--surface-2`.
- **`.side-panel`** — `var(--surface)`, left hairline, slides in `translateX`. Field labels 9.5px/600
  uppercase `--ink-3`; inputs 30px `--ctl`/`--ctl-border`, focus ring `0 0 0 3px var(--accent-soft)`.
  Status = segmented pills.
- **`.context-menu`** — `var(--surface)`, `--border-2`, `--shadow-pop`, 10px radius; 12.5px rows with a
  14px leading icon; danger row in `--st-blocked`.
- **`.chat-panel`** — drop the purple gradient; header = `var(--surface)` + hairline, accent send button,
  bubbles `var(--surface-2)` (bot) / `var(--accent)` (user).
- **Toasts / modals / zoom controls** — `var(--surface)`, `--border-2`, `--shadow-pop`, `--radius-sm`.

---

## 4. `js/graph.js` — D3 node & link drawing
Match the Datum node. For each node `<g>`:
- **Card:** rounded `rect` (rx 9), `fill = var(--lvN-fill)` (or status tint when colour-mode=status),
  `stroke=var(--border-2)`, Datum `--shadow-card` (use a subtle SVG drop-shadow or a 1px inner stroke).
- **Left colour bar:** a 4px `rect` at the card's left edge, `fill=var(--lvN-bar)`, with **left corners
  rounded** to the card radius (so it reads as a clipped bar). *(This is the detail that was clipped
  before — see §5.)*
- **Name:** Plex Sans 12px/600 `--node-text`. **Part number:** Plex Mono 9.5px `--ink-3`.
- **Sequence badge:** a 22px circle at the **top-right corner, half-outside the card** (`cx≈+w/2-? `,
  offset so ~half overflows), `fill=var(--accent)`, white Plex-Mono 10px text = `sequence_tag` (e.g.
  "1a"). It must render **fully** (don't clip it — the SVG has no overflow issue, but make sure the
  node `<g>` isn't inside a clipped group).
- **Status dot:** 7px circle bottom-right (or top-left per current app), `fill=var(--st-*)`.
- **Collapse handle:** an 18px circle on the right edge for parents, accent stroke, `–` / child-count.
- **Qty badge:** keep the existing `×N` chip but restyle to a small mono pill.
- **Links:** cubic bezier, `stroke=var(--link)`, `stroke-width:1.6`, `fill:none`, round caps. **Fastener
  links** (links with a `fastener`/`qty>1` value): `stroke=var(--accent)` and a small white rounded
  label chip at the midpoint showing `fastener ×qty` (e.g. `CBE8-20 ×2`).
- **Level headers / group bands:** pill labels (`Level 1/2/3`) in `--surface`/`--border-2`; optional
  dashed group separators between L2 bands.

---

## 5. The "sequence circle was half-hidden" fix
In the prototype the node had `overflow:hidden` (to clip the fill/bar to rounded corners), which also
clipped the badge poking past the corner. Fix = `overflow:visible` on the node + round the colour bar's
left corners so it still looks clean. In **D3/SVG** the equivalent: don't place nodes inside a
`clip-path`/clipped `<g>`, and round the bar `rect`'s left corners — then the badge shows in full while
still straddling the edge (matching the user's reference).

---

## 6. New UX features (all **derived** — no schema change)
These read the existing `logi_nodes`/`logi_links` graph; implement as view logic:
- **⌘K search** across projects/assemblies/parts + **where-used** (query `part_number` across
  assemblies) + jump-to-node (select + center).
- **Interactive legend** — click a level/status to isolate (dim others).
- **Light/Dark theme** toggle → set `data-theme` on the root.
- **Status roll-up** — parent status derived from children (BLOCKED > IN_PROGRESS > DONE).
- **Critical path** — chain from deepest blocked node to root; highlight nodes + links.
- **Auto-tidy** — recompute `tree_x/tree_y` into clean columns, parents centered on children.
- **Color by level / status / group** (group = L2 sub-assembly).
- **Working level filter** (≤L1…≤Ln hides deeper nodes).
- **Issues panel** — orphans, missing `part_number`, `qty=0`, blocked.
- **Rolled-up BOM qty** — `qty × Π(ancestor qty) × units`, with a units field + total.
- **Node drag / lock / flag** — `is_locked` already exists; **flag** is currently localStorage-only,
  add a `flagged boolean` column to share it.

## 7. Revision diff (separate phase — needs backend)
Diff requires **frozen BOM snapshots** to compare against (live rows are mutable). Add:
```sql
create table logi_revisions (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid references logi_assemblies(id) on delete cascade,
  label text, note text,
  created_at timestamptz default now(), created_by text,
  snapshot jsonb           -- frozen { nodes:[...], links:[...] }
);
```
On "Save revision", serialize the assembly's node+link graph into `snapshot`. Diff = compare two
snapshots (or one snapshot vs. the live graph) by node id → added / removed / re-parented / status /
qty / renamed. This formalizes the manual `R000…R007` snapshots in your `Temp/` folder.

---

## 8. Design tokens quick list
- Radii: card 9px, control 6px, pills 100px. Dark theme same.
- Shadows: card `0 1px 2px /.04 + 0 4px 14px /.06`; pop `0 8px 30px /.14`.
- Spacing: page padding 22–24px; card padding 16px; toolbar gap 10px; control height 30px.
- Type scale: page title 19/600, card name 15/600, body 12–13, labels 9.5–11 uppercase, mono data 10–12.

## 9. Files in this bundle (`reference/`)
- `index.html` — entry (loads the others)
- `redesign.css` — **all Datum tokens + component styles** (light `.dir-a` + dark `.dir-b` + Graphite `.dir-c`)
- `prototype.css` — interactive states, overlays, command palette, menus, BOM, pickup, etc.
- `app.jsx` — the React app (read for layout/behaviour/structure; do **not** port React — recreate in vanilla/D3)
- `data.js` — demo data shape (`window.AXON`) — mirrors the real `logi_*` fields
- `icons.jsx` — the line-icon SVG path set that replaces the emoji controls

Open `reference/index.html` to see the target running.
