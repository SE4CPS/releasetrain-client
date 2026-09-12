# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository
(the `releasetrain-client` frontend: a single large `src/index.html`).

## Keeping this file current

**When the user gives an instruction that's a reusable correction or general convention (not a one-off
for the task at hand), add it here as a documented rule in the same turn, without waiting to be asked
separately.** Use judgment on what counts as reusable versus a one-off content edit. This file should
always reflect the current, real conventions of the repo, not lag behind what's actually been established.

## Standing conventions

- **Every commit bumps the version and adds a changelog entry.** The version string appears in two spots
  in `src/index.html`: the `<a class="brand" ... data-app-version="X.Y.Z">` header tag, and a new
  `.cl-release` block at the top of the in-app changelog list (`.cl-ver-minor` for a feature, `.cl-ver-patch`
  for a fix/tweak; reuse whichever existing `cl-tag-*` classes fit: `feat`/`fix`/`ux`/`perf`/`docs`).
  Never skip this, even for a small fix.
- **No dash used as emphasis** in code, comments, commit messages, or user-visible copy: split into two
  sentences or use a colon/semicolon/comma instead. Legitimate uses stay: arithmetic
  (`Date.now() - t.startedAt`), numeric ranges, hyphenated compound words, and a bare `&mdash;`/`—` used as
  a literal "no value"/"false" table-cell glyph (e.g. `askRenderBenchmarkTable`'s "no source data" cells),
  which is a placeholder symbol, not a rhetorical aside. Sweep the diff before every commit for **both**
  forms: the literal hyphen (`git diff -U0 -- src/index.html | grep -E '^\+' | grep ' - '`) **and** a real
  em/en dash or its HTML entity (`git diff -U0 -- src/index.html | grep -E '^\+' | grep -E '—|–|&mdash;|&ndash;'`).
  Checking only the first one is not enough: two em-dash-as-emphasis instances from this session's own
  earlier commits (in code comments, using `—` directly rather than a hyphen) went unnoticed for several
  commits before a broader sweep caught them, precisely because the usual grep only ever looked for `' - '`.
- **Commit directly to `master`**: no feature-branch workflow unless asked.
- **State exact pull/restart instructions after every push** (this is served live).
- **Keep server/client duplicate logic in sync by hand, with a comment noting the duplication.** E.g. the
  comparison-question entity-extraction regexes (`ASK_COMPARISON_LEADIN_RX`/`ASK_COMPARISON_TRAILER_RX`
  here mirror `COMPARISON_LEADIN_RX`/`COMPARISON_TRAILER_RX` in `releasetrain-server/src/ask.js`); when
  fixing one side, check whether the other needs the identical fix.
- **Mermaid gotchas** (the Ask agentic-workflow diagram uses Mermaid):
  - Mermaid stamps an inline `style="max-width:NNNpx"` on the `<svg>` it renders, which overrides an
    external CSS `width:100%` rule at equal specificity regardless of source order. Clear
    `svgEl.style.maxWidth = "none"` after inserting the rendered SVG if it needs to stretch to fill its
    container.
  - A `%%{init: {...}}%%` directive as the first line of a diagram's source scopes that config to just
    that one render, not the global `mermaid.initialize()` call; other Mermaid usages on the page
    (e.g. the docs view) are unaffected.
  - A compact `flowchart LR` with a feedback/back-edge (e.g. a dotted "retry" edge) can visually overlap
    the main flow line; tune `flowchart.nodeSpacing`/`rankSpacing` in the init directive to give it room.
- **GLOBAL RULE — avoid scrolling wherever it isn't actually necessary (mobile's own page scroll is the
  normal exception); never scroll horizontally, anywhere, at any width.** Favor a layout that reflows
  (stacks, wraps, shrinks) over one that's fixed-width and needs a scrollbar to reach the rest of it. This
  applies at every width, not just mobile, but check mobile specifically since a narrow viewport is where a
  fixed-width layout hits this first. When a piece of content genuinely can't reflow (a wide technical
  table, a diagram, a code block: the standard exception, same as the Teaching-lab repo's own
  `artifact-design` convention), give *that element itself* its own small `overflow-x:auto` box so the
  scroll stays contained to it, never the page or view around it. Before reaching for that exception, ask
  whether the content could instead become a stacked list/CSS-grid block; see `askRenderBenchmarkTable`'s
  comment and `askCompareLegendHTML`'s stacked-fact-card layout (replaced an earlier `min-width:760px`
  6-column table that only fit with a horizontal scrollbar) for the preferred pattern. `#ua-se-list`'s admin
  search-events table is a deliberate, narrower exception: a genuinely dense multi-field data table for an
  admin/debug audience, where a real table is the right tool and reformatting it into cards would hurt
  scanability for no real benefit; its scroll is fully self-contained (`overflow-x:auto` on the table's own
  wrapper only) and tightened further on mobile (smaller cell max-width/font, one column hidden) so it needs
  that scroll as rarely as possible. Check any layout change against a narrow viewport, especially anything
  using `position:sticky`/fixed heights on desktop that might trap scrolling content on mobile (e.g. the
  feed panel's mobile scroll fix).
- **Keep it simple when adding UI, per explicit user direction** ("keep it simple but good"): don't
  over-build a feature beyond what was asked.
- **A real `<table>` doesn't fit the answer rail's narrow column (~360px, see `ASK_RAIL_MIN_WIDTH`'s own
  comment).** When a rail panel needs tabular comparison data, use a CSS-grid block instead (see
  `askRenderBenchmarkTable`'s own comment): a compact header row per item plus a full-width row below it,
  not a wide multi-column `<table>` that would need horizontal scroll or shrink illegibly.
- **A UI element added inside a `<summary>` (a Refresh button, etc.) needs its click handler to call
  `e.stopPropagation()`**, or clicking it also toggles the parent `<details>` open/closed via the browser's
  native summary click handling, since the click bubbles up to it.
- **Every collapsible section on the Account page (admin or not) is a closed-by-default `<details>`/
  `<summary class="ua-admin-header">` block** (`.ua-admin-details`), not an always-open `<div>`/`.ua-card`.
  This covers the 4 admin-only sections (System overview, Settings, All users, Search & Ask activity) and
  the 5 profile sections above them (Change password, Model provider keys, Organization namespaces,
  Bookmarks, Installed versions), added after the page grew long enough that reaching the admin sections
  meant scrolling past several always-open cards first. `.ua-admin-header`'s summary row (chevron, bold
  title, optional muted count, optional right-aligned Refresh button) is the one consistent header shape for
  all of these; don't reintroduce the older per-section inline-styled `<summary>` pattern for a new one. A
  genuinely urgent/always-relevant item (the registration notice banner, the accounts/queries stat line)
  stays outside any `<details>`, always visible, rather than hidden behind a click. A `<button>` inside the
  summary needs `e.stopPropagation()` on its own click handler (see the dedicated rule below); this is
  already wired generically via `.ua-admin-details summary button`, so a new section reusing this class
  gets it for free.
- **New admin-tunable values go through the existing generic settings mechanism**
  (`GET`/`PUT /api/admin/settings`, `UA_SETTINGS_META` on the client), not a bespoke new endpoint/markup;
  see the Settings section in `ua-admin-section`. `UA_SETTINGS_META` supports three shapes per key: a plain
  number (`min`/`max`, renders `<input type=number>`), a fixed enum (`options: [{value,label}]`, renders a
  `<select>` so an invalid value can't be typed), or a flag (`type: "boolean"`, renders a checkbox).
- **GLOBAL RULE — a value baked into many synchronous computations at module load (the feed's own
  `LOOKBACK_DAYS` is the concrete case) can still track a live server-side setting; it just needs its own
  small public (no-auth) read endpoint and a `let`-not-`const` variable, not a bespoke new admin-settings UI
  entry.** `LOOKBACK_DAYS`/`LOOKBACK_MS`/`LOOKBACK_AGO`/`LOOKBACK_WEEKS` used to be plain `const`s computed
  once at script load; per explicit request they now track `askRecentWindowDays` (the same admin-configurable
  value `UA_SETTINGS_META.askRecentWindowDays` already exposed for the Ask feature) instead of carrying a
  second, separately-hardcoded number that only ever coincidentally matched. The mechanism: all four became
  `let`s; `setLookbackDays(days)` recomputes every derived value plus the sidebar's `#sbActivityLabel` text
  from one input; `fetchAndApplyLookbackDays()` reads the new public `GET /api/ask/recent-window-days`
  (app.js) and calls it, swallowing its own errors so a failed fetch just leaves `LOOKBACK_DAYS` at its
  current value (28, the fallback, on a first load) rather than breaking the feed; and a single
  `lookbackDaysReady` promise (the one call to `fetchAndApplyLookbackDays()`, not one per consumer) is
  `await`-ed by both `boot()` and the independent top-level `loadHomeStats()` IIFE before either builds
  anything sized off `LOOKBACK_DAYS`. Those two run concurrently at page load, not one after another, so
  without a shared promise the second one to resolve could win the fallback value in a genuine race. Any
  future value with the same shape (a scalar already exposed via `UA_SETTINGS_META` that a synchronous,
  module-load computation elsewhere also wants live) should follow this same pattern: one small public
  endpoint, `let`s instead of `const`s, one `setX()` recomputation function, one shared ready-promise every
  concurrent consumer awaits.
- **Per-view menu visibility is admin-configurable** (`viewGraphVisible`, `viewArchVisible`, etc.; see
  `VIEW_NAV_LINKS` and the matching `TOGGLEABLE_VIEWS` in `releasetrain-server/src/app.js`), fetched from
  the public `GET /api/views/visibility` (not the admin-only settings route, since every visitor's nav
  depends on it) and applied by hiding the corresponding `<a class="nav-link">`. "Home" and "Account" are
  deliberately never toggleable, on both client and server: hiding either breaks core navigation or can
  lock an admin out of the panel that controls this setting. Hiding a nav link doesn't block the view's own
  `#/hash` route if navigated to directly; this only controls what's reachable from the menu, matching what
  was actually asked for.
- **A grouped set of controls (Filters + Stats, say) that's growing unwieldy inside the ☰ menu drawer gets
  its own dedicated toggle/panel instead**, per explicit request ("I want them to have their own view which
  I can toggle"). See `#filtersPanel`/`filtersToggleBtn` (🎚️, in the topbar next to ☰): same `.sidebar`
  off-canvas mechanics as the menu drawer, just mirrored to the opposite edge (`.filters-panel`, right
  instead of left) and with its own toggle button, not a second control on the same one. Opening one panel
  closes the other (see `setSidebarOpen`/`setFiltersPanelOpen`), so only one off-canvas drawer is ever open
  at once even though they're independently triggerable. When a per-view control block (Graph/Arch/Docs
  controls, etc.) isn't the thing that's actually crowded, it's fine to leave it inside the ☰ drawer as-is;
  this pattern is for a specific "this got too big for where it lives" complaint, not a mandate to give
  every sidebar section its own drawer preemptively.
- **GLOBAL RULE — any custom `<summary>` style in this file must explicitly declare `flex-direction: row`
  whenever it sets `display: flex`/`inline-flex`.** The global bare `summary { display: flex; flex-direction:
  column; ... }` rule sets a default of `column`; a more specific selector that redeclares `display` but not
  `flex-direction` still loses that one property to the global rule (CSS wins per-property, not per-rule), so
  the chevron and label render as two centered, stacked lines instead of one row. This bit `.ua-admin-header`
  first, then turned out to already be latent in nearly every other custom summary style in the file
  (`.sb-details`, `.sb-stat-head`, `.toggle-more`, docsView's endpoint/architecture summaries, cveView's
  details/legend/post-summary toggles, and two inline-styled ones) once actually checked. When adding a new
  collapsible section anywhere, set `flex-direction: row` on its summary rule from the start rather than
  discovering this the same way.
- **GLOBAL RULE — never let two elements say the same thing in a row.** A prominent, specific message (an
  emptyState block reading "No results found for the last 28 days") followed immediately by a smaller,
  generic one saying essentially the same thing (a `#sentinel` row reading "🔍 No results") reads as a
  visible bug even though each element is individually correct: it happened when `#sentinel`'s
  infinite-scroll status text and `#emptyState`'s own message both render whenever the feed comes back
  empty, since neither was written with the other in mind. Fix this class of bug at the display layer
  (a CSS rule or a shared visibility check covering every codepath that can trigger the collision), not by
  patching just the one call site that happened to be flagged. `#emptyState.show ~ #sentinel { display:
  none; }` is the concrete fix for that instance: one rule silences `#sentinel` under `#emptyState`
  regardless of which of the several places in this file sets its text to a "no results" variant, rather
  than hunting down and patching each one individually. When adding a new status/empty/loading indicator,
  check what else is already visible in the same moment before assuming it needs its own message.
- **A flex-column parent stretches its children to its own full cross-axis width by default**
  (`align-items: stretch`), even a child whose own `display` is `inline-block`. A short badge/pill/chip
  placed inside one needs `align-self: flex-start` on the child itself, or it silently renders as an oddly
  wide, mostly-empty shape instead of a compact one, sized to its own container's width rather than its own
  content. Check for this whenever a small inline element looks "stretched" or "strange" inside a
  `flex-direction: column` container. (`.ua-profile-info`'s role badge needed exactly this fix once, back
  when that container was a column; it's since become a row per request, so `align-items: center` on the row
  now does the equivalent job and the badge no longer carries its own `align-self` override. That's the
  current, correct state, not a regression of this rule.)
- **A date shown anywhere in an Ask answer is friendly, not a raw ISO string.** `friendlyDate`/
  `daysAgoFromYmd`/`friendlyDateAgo` in `releasetrain-server/src/ask.js` render "Aug 26" or "Aug 26 (17d
  ago)" instead of "2026-08-26", and the system prompt fed to the model uses the same helpers (a model
  tends to echo the date phrasing it's given straight into its own final answer, so feeding it an
  already-readable date is what actually controls the final text, not post-processing free-form model
  output afterward). A rolling recency window states its actual day count explicitly ("in the tracked
  14-day window"), not a vague "recent window" with no size given, per explicit request. No client-side
  mirror needed here: this formatting only ever happens server-side, baked into the answer text before it's
  sent.
- **A weekly release workflow (`.github/workflows/weekly-release.yml`) tags and publishes a GitHub Release
  for whatever version is currently on master**, reading the version from `data-app-version` and using
  `gh release create --generate-notes` for the release notes (this repo's commit messages are already
  real/technical, so auto-generated notes come out genuinely useful, not filler). No version-bumping logic
  lives in the workflow itself; that's still done by hand per commit, per the rule above.

## Related repos

- `releasetrain-server`: the Node/Express API this client calls; `src/ask.js` holds the Ask
  pipeline/comparison logic this file has regex mirrors of.
- `releasetrain-bot`: the Python scraper/maintainer scripts populating the data this client displays.
