# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository
(the `releasetrain-client` frontend — a single large `src/index.html`).

## Keeping this file current

**When the user gives an instruction that's a reusable correction or general convention (not a one-off
for the task at hand), add it here as a documented rule in the same turn, without waiting to be asked
separately.** Use judgment on what counts as reusable versus a one-off content edit. This file should
always reflect the current, real conventions of the repo, not lag behind what's actually been established.

## Standing conventions

- **Every commit bumps the version and adds a changelog entry.** The version string appears in two spots
  in `src/index.html`: the `<a class="brand" ... data-app-version="X.Y.Z">` header tag, and a new
  `.cl-release` block at the top of the in-app changelog list (`.cl-ver-minor` for a feature, `.cl-ver-patch`
  for a fix/tweak — reuse whichever existing `cl-tag-*` classes fit: `feat`/`fix`/`ux`/`perf`/`docs`).
  Never skip this, even for a small fix.
- **No dash used as emphasis** in code, comments, commit messages, or user-visible copy — split into two
  sentences or use a colon/semicolon/comma instead. Legitimate uses stay: arithmetic
  (`Date.now() - t.startedAt`), numeric ranges, hyphenated compound words. Sweep the diff before every
  commit: `git diff -U0 -- src/index.html | grep -E '^\+' | grep ' - '` (exclude legitimate arithmetic by eye).
- **Commit directly to `master`** — no feature-branch workflow unless asked.
- **State exact pull/restart instructions after every push** (this is served live).
- **Keep server/client duplicate logic in sync by hand, with a comment noting the duplication.** E.g. the
  comparison-question entity-extraction regexes (`ASK_COMPARISON_LEADIN_RX`/`ASK_COMPARISON_TRAILER_RX`
  here mirror `COMPARISON_LEADIN_RX`/`COMPARISON_TRAILER_RX` in `releasetrain-server/src/ask.js`) — when
  fixing one side, check whether the other needs the identical fix.
- **Mermaid gotchas** (the Ask agentic-workflow diagram uses Mermaid):
  - Mermaid stamps an inline `style="max-width:NNNpx"` on the `<svg>` it renders, which overrides an
    external CSS `width:100%` rule at equal specificity regardless of source order — clear
    `svgEl.style.maxWidth = "none"` after inserting the rendered SVG if it needs to stretch to fill its
    container.
  - A `%%{init: {...}}%%` directive as the first line of a diagram's source scopes that config to just
    that one render, not the global `mermaid.initialize()` call — other Mermaid usages on the page
    (e.g. the docs view) are unaffected.
  - A compact `flowchart LR` with a feedback/back-edge (e.g. a dotted "retry" edge) can visually overlap
    the main flow line; tune `flowchart.nodeSpacing`/`rankSpacing` in the init directive to give it room.
- **GLOBAL RULE — avoid scrolling wherever it isn't actually necessary (mobile's own page scroll is the
  normal exception); never scroll horizontally, anywhere, at any width.** Favor a layout that reflows
  (stacks, wraps, shrinks) over one that's fixed-width and needs a scrollbar to reach the rest of it — this
  applies at every width, not just mobile, but check mobile specifically since a narrow viewport is where a
  fixed-width layout hits this first. When a piece of content genuinely can't reflow (a wide technical
  table, a diagram, a code block — the standard exception, same as the Teaching-lab repo's own
  `artifact-design` convention), give *that element itself* its own small `overflow-x:auto` box so the
  scroll stays contained to it, never the page or view around it. Before reaching for that exception, ask
  whether the content could instead become a stacked list/CSS-grid block — see `askRenderBenchmarkTable`'s
  comment and `askCompareLegendHTML`'s stacked-fact-card layout (replaced an earlier `min-width:760px`
  6-column table that only fit with a horizontal scrollbar) for the preferred pattern. `#ua-se-list`'s admin
  search-events table is a deliberate, narrower exception: a genuinely dense multi-field data table for an
  admin/debug audience, where a real table is the right tool and reformatting it into cards would hurt
  scanability for no real benefit — its scroll is fully self-contained (`overflow-x:auto` on the table's own
  wrapper only) and tightened further on mobile (smaller cell max-width/font, one column hidden) so it needs
  that scroll as rarely as possible. Check any layout change against a narrow viewport, especially anything
  using `position:sticky`/fixed heights on desktop that might trap scrolling content on mobile (e.g. the
  feed panel's mobile scroll fix).
- **Keep it simple when adding UI, per explicit user direction** ("keep it simple but good") — don't
  over-build a feature beyond what was asked.
- **A real `<table>` doesn't fit the answer rail's narrow column (~360px, see `ASK_RAIL_MIN_WIDTH`'s own
  comment).** When a rail panel needs tabular comparison data, use a CSS-grid block instead (see
  `askRenderBenchmarkTable`'s own comment) — a compact header row per item plus a full-width row below it,
  not a wide multi-column `<table>` that would need horizontal scroll or shrink illegibly.
- **A UI element added inside a `<summary>` (a Refresh button, etc.) needs its click handler to call
  `e.stopPropagation()`**, or clicking it also toggles the parent `<details>` open/closed via the browser's
  native summary click handling, since the click bubbles up to it.
- **Admin panel sections are closed-by-default `<details>`/`<summary>` blocks** (`.ua-admin-details`), not
  always-open `<div>`s — added after the panel grew to 4+ sections and got too long to scan. A genuinely
  urgent/always-relevant item (the registration notice banner, the accounts/queries stat line) stays
  outside any `<details>`, always visible, rather than hidden behind a click.
- **New admin-tunable values go through the existing generic settings mechanism**
  (`GET`/`PUT /api/admin/settings`, `UA_SETTINGS_META` on the client), not a bespoke new endpoint/markup —
  see the Settings section in `ua-admin-section`. A value only becomes admin-configurable this way when it's
  a small, low-frequency scalar (like `askRecentWindowDays`); a value baked into many synchronous
  computations at module load (e.g. the feed's own `LOOKBACK_DAYS`) is a bigger, riskier lift and needs a
  real refactor plan first, not a quick wire-up.
- **A weekly release workflow (`.github/workflows/weekly-release.yml`) tags and publishes a GitHub Release
  for whatever version is currently on master**, reading the version from `data-app-version` and using
  `gh release create --generate-notes` for the release notes (this repo's commit messages are already
  real/technical, so auto-generated notes come out genuinely useful, not filler). No version-bumping logic
  lives in the workflow itself — that's still done by hand per commit, per the rule above.

## Related repos

- `releasetrain-server` — the Node/Express API this client calls; `src/ask.js` holds the Ask
  pipeline/comparison logic this file has regex mirrors of.
- `releasetrain-bot` — the Python scraper/maintainer scripts populating the data this client displays.
