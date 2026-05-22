# releasetrain-client Agent Rules

Read this before acting on any prompt.

---

## Stack

- Vanilla JavaScript (no framework, no bundler)
- Single HTML entry point: `src/index.html`
- One inline `<script>` block (non-module) handles all in-page view logic
- `src/app.js` is an ES module used only for PlantUML and forecast integrations — it is NOT imported by the inline script
- Styles live entirely in the `<style>` block inside `src/index.html` plus `src/app.css` and `src/reset.css`
- Build: Grunt copies `src/` to `dist/` verbatim — no transpilation, no minification

---

## After every code change

1. Run `npx grunt` from `releasetrain-client/` to sync `src/` to `dist/`.
2. Add a changelog bullet to the current version entry in `#changelogView` inside `src/index.html`.
3. Bump the version in the topbar brand (`<em>vX.Y.Z</em>`) and in `package.json` once per day maximum. If a version was already bumped today, add to the existing entry rather than creating a new one.

### End-of-task commit and push

Run this sequence after every completed task:

```bash
npx grunt                                      # sync src/ to dist/
git add src/index.html package.json dist/      # stage only known-safe paths
git commit -m "short description of change"
git push origin master
```

Rules:
- Stage specific paths by name. Never use `git add -A` or `git add .` — the repo may contain `.env` or other secrets.
- Write the commit message in the imperative: "add org namespace share links", not "added".
- Confirm with the user before running `git push origin master`. The push is the only irreversible step.

### User account and bookmark changes

When modifying the Account view (`#usersView`) or user/bookmark JS module:
- Any change to the login/register/logout flow must also update `uaRender()` if visible state is affected.
- Any new authenticated feature must call `uaToken()` to gate visibility (hide when not logged in).
- Bookmark endpoints follow the pattern `API_BASE + "bookmarks/..."` with `requireAuth`; share links (`?share=<shareId>`) use `API_BASE + "bookmarks/share/<shareId>"` without auth.
- The topbar chip (`#ua-topbar-user`) is updated by `uaUpdateTopbar()`, called from `uaUpdateSidebar()` and `uaRender()`.

---

## Self-update rule

When a correction or confirmed approach from a chat session is clearly reusable, update this file immediately. Specifically:
- If a rule was violated and the user corrected it: add or sharpen the relevant rule.
- If an unusual approach was confirmed by the user: document it so the same judgment can be reproduced without re-deriving.
- If a pattern was applied repeatedly across multiple changes in a session: extract it as an explicit rule.
- Do not save ephemeral task details (what was fixed today, PR descriptions, current bug context).
- Place new rules in the section they relate to. If no section fits, add a new one before `## What not to do`.

---

## Topbar persistent state

Features that must be visible on every page regardless of active view (e.g. login status) go in the topbar as a chip or badge element:

1. Add `<span id="myChip" style="display:none">` between `.brand` and `.topbar-spacer` in the topbar HTML.
2. Write a dedicated `updateMyChip()` function that reads state and sets `chip.style.display` and `chip.textContent`.
3. Call `updateMyChip()` from both the feature's `render()` function and the sidebar update function.
4. On page load (at the bottom of the inline script, after all other init), call `updateMyChip()` to restore state for returning users.
5. Add a click handler on the chip that navigates to the relevant view.

Current instance: `#ua-topbar-user` chip, updated by `uaUpdateTopbar()`, called from `uaUpdateSidebar()` and `uaRender()`.

---

## Gated UI elements

UI elements that require a logged-in session:
- Default to `style="display:none"` in HTML.
- Show/hide them inside `uaRender()` based on `uaToken()`.
- Also restore visibility on page load: check `uaToken()` and set `display` directly in the init block at the bottom of the script. Do not rely solely on `uaRender()` being called on load.

Current instance: `#ua-bm-save-btn` in the sidebar.

---

## Page-load side effects

Use a self-invoking async function for actions that must fire exactly once on page load and may involve a `fetch`:

```js
(async function myHandler() {
  const param = new URLSearchParams(location.search).get("myParam");
  if (!param) return;
  // fetch and restore state
})();
```

Place these at the bottom of the inline script, after all event listeners but before `</script>`. Do not use `DOMContentLoaded` — the script is already deferred by its position at the bottom of `<body>`.

Current instance: `uaBmHandleShare()` which reads `?share=` and restores a saved search.

---

## Clipboard copy pattern

Always pair `navigator.clipboard.writeText()` with a `prompt()` fallback:

```js
navigator.clipboard.writeText(text).then(() => {
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = orig; }, 1500);
}).catch(() => {
  prompt("Copy this link:", text);
});
```

The clipboard API is unavailable in non-secure contexts and on some mobile browsers.

---

### Version bump rule

| Change type | Bump |
|---|---|
| New feature or new view | minor |
| Bug fix, style, or docs | patch |

---

## Adding a new in-page view

Every view follows this exact four-part pattern. Do not deviate.

### 1: Sidebar controls block

Add inside the `<aside class="sidebar">` element, after the last existing `*Controls` div:

```html
<div id="myControls" style="display:none">
  <div class="sidebar-section">
    <div class="sidebar-label">Label</div>
    <!-- description or controls for this view -->
  </div>
</div>
```

### 2: View panel

Add inside `<main id="main-content">`, before `<section class="panel" id="feedPanel">`:

```html
<div id="myView" style="display:none">
  <!-- view content -->
</div><!-- /#myView -->
```

### 3: Nav link

Add inside `<nav class="nav-links" id="navLinks">`, before the external GitHub link:

```html
<a id="myLink" class="nav-link" href="#" title="Description">Emoji Label</a>
```

Add `"myLink"` to the `EL` array at the top of the inline script:

```js
["feed", ..., "ackLink", "usersLink", "myLink", ...]
  .forEach(id => { EL[id] = document.getElementById(id); });
```

### 4: Activate / deactivate functions

```js
let MY_ACTIVE = false;

function activateMy() {
  if (G_ACTIVE)   deactivateGraph();
  if (A_ACTIVE)   deactivateArch();
  if (CV_ACTIVE)  deactivateCve();
  if (DB_ACTIVE)  deactivateDashboard();
  if (D_ACTIVE)   deactivateDocs();
  if (ACK_ACTIVE) deactivateAck();
  if (CL_ACTIVE)  deactivateChangelog();
  if (UA_ACTIVE)  deactivateUsers();
  MY_ACTIVE = true;
  setViewParam("myview");
  document.getElementById("myView").style.display = "block";
  document.getElementById("feedPanel").style.display = "none";
  document.getElementById("myControls").style.display = "";
  document.getElementById("feedSidebarSections").style.display = "none";
  EL.myLink.classList.add("nav-active");
}

function deactivateMy() {
  MY_ACTIVE = false;
  setViewParam("");
  document.getElementById("myView").style.display = "none";
  document.getElementById("feedPanel").style.display = "";
  document.getElementById("myControls").style.display = "none";
  document.getElementById("feedSidebarSections").style.display = "";
  EL.myLink.classList.remove("nav-active");
}

EL.myLink.addEventListener("click", e => {
  e.preventDefault();
  if (MY_ACTIVE) { deactivateMy(); return; }
  activateMy();
});
```

Also add `if (MY_ACTIVE) deactivateMy();` to every other existing `activate*()` function and to the brand and home-link click handlers.

---

## API integration

The API base URL is defined as a constant at the top of the inline script:

```js
const API_BASE = "https://releasetrain.io/api/";  // trailing slash
```

Always call `API_BASE + "path/without/leading/slash"`.

### Auth headers

The user session is stored in `localStorage`:

| Key | Value |
|---|---|
| `rt_token` | JWT string returned by `POST /api/auth/login` |
| `rt_user` | JSON-encoded `{ id, email, role, name }` object |

To make an authenticated request:

```js
const headers = { "Content-Type": "application/json" };
const token = localStorage.getItem("rt_token");
if (token) headers["Authorization"] = "Bearer " + token;
fetch(API_BASE + "some/path", { headers });
```

### Auth endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `auth/register` | none |
| POST | `auth/login` | none |
| POST | `auth/logout` | Bearer |
| GET | `users/me` | Bearer |
| GET | `users/` | Bearer + admin |
| PUT | `users/:id` | Bearer (self or admin) |
| DELETE | `users/:id` | Bearer + admin |

### Bookmark endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `bookmarks/` | Bearer | Returns `{ data: [...] }` for the signed-in user |
| POST | `bookmarks/` | Bearer | Body: `{ name, url }`. Returns `{ id, shareId }` |
| DELETE | `bookmarks/:id` | Bearer | Deletes own bookmark only |
| GET | `bookmarks/share/:shareId` | none | Returns `{ name, url }` for share link resolution |

Share links use the format `?share=<shareId>` on the page URL. On load the inline script calls `uaBmHandleShare()` which fetches the share endpoint and restores the search.

---

## CSS conventions

- All view-specific CSS goes in the single `<style>` block in `src/index.html`.
- Use the design tokens from `:root` (`--brand`, `--border`, `--muted`, `--surface`, `--bg`, `--radius`, etc.). Do not hardcode colour values.
- Place styles for a new view directly before the `/* ── Docs view ── */` comment block or adjacent to the existing view's own CSS section.
- Do not add external CSS frameworks or new CDN stylesheet links.

---

## Mobile layout and scrolling

Every view must be scrollable and usable on mobile. Apply these rules to every view you add or modify:

1. Never set `overflow: hidden` or `position: fixed` on a view container without a corresponding `@media (max-width: 640px)` override that restores `position: static` and `height: auto`.
2. Grid layouts (`display: grid; grid-template-columns: 1fr 1fr`) must collapse to a single column on mobile:
   ```css
   @media (max-width: 640px) {
     #myView .my-grid { grid-template-columns: 1fr; }
   }
   ```
3. Do not set a fixed `height` or `max-height` that clips content on small screens without `overflow-y: auto` as a fallback.
4. The page body must always be scrollable on mobile. Do not lock `document.body.style.overflow` or `document.documentElement.style.overflow` unconditionally; if you must lock scroll for a desktop overlay, restore it in `deactivate*()` and add a guard so it only applies above the mobile breakpoint (`window.innerWidth > 640`).
5. Sidebar controls that appear in a view must wrap or stack on mobile; do not use `white-space: nowrap` or fixed widths that overflow the viewport.
6. Test that the view renders without horizontal scroll on a 375px wide viewport before marking the task complete.

---

## Output style

- No hyphens or dashes in written prose or UI text. Use commas, colons, or rewrite the sentence instead.
- Keep all text technical. Describe what the system does, not what value it delivers. No product marketing language.
- No brand name (`ReleaseTrain.io`, `ReleaseTrain`) in prose. Use repo names (`releasetrain-client`, `releasetrain-server`, etc.) or plain descriptions.
- Section headings in the docs view use `:` as separator, not `·` or `--`.

---

## Security

- Never commit or log tokens, passwords, or secrets from `.env` files.
- Never store raw passwords in `localStorage` or anywhere client-side.
- Always HTML-escape user-supplied strings before inserting them into `innerHTML`. Use a helper like:
  ```js
  s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
  ```
- Never construct `innerHTML` strings from unescaped API response data.
- Auth tokens from `localStorage` are readable by any JS on the page. Do not introduce third-party scripts that could exfiltrate them.

---

## Empty-state suggestions

Views that depend on a user-supplied search query (graph view, feed) must render a suggestion panel when no data is loaded, not a bare "no data" message.

The suggestion panel must:
1. Explain what the user needs to do in one short sentence.
2. Render a row of clickable suggestion chips. Each chip is an `<a href="/?q=<term>&view=<viewId>">` link so clicking navigates with the search pre-filled and the correct view active.
3. Use design tokens (`--brand`, `--border`, `--surface`, `--muted`) and inline styles only (no new CSS classes).

Example for the graph view (empty `nodes.DataSet`):
```js
const suggestions = ["linux","nginx","redis","kubernetes","openssl"];
const chips = suggestions.map(s =>
  `<a href="/?q=${encodeURIComponent(s)}&view=graph" style="...pill styles...">${s}</a>`
).join("");
container.innerHTML = `<div style="...centered column...">
  <div style="font-size:13px;color:var(--muted)">Search for a component to populate the graph, or pick a suggestion:</div>
  <div>${chips}</div>
</div>`;
```

Current instance: `gBuildAndRender()` in the graph module renders this panel when `nodes.length === 0`.

---

## CDN libraries

Load external libraries lazily via a `load*()` function that appends a `<script>` to `document.head`. Use these verified CDN URLs:

| Library | URL |
|---|---|
| vis-network 9.1.9 | `https://cdn.jsdelivr.net/npm/vis-network@9.1.9/standalone/umd/vis-network.min.js` |
| Chart.js | `https://cdn.jsdelivr.net/npm/chart.js` |
| pako 2.1.0 | `https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js` |

Do not use cdnjs paths for vis-network. The cdnjs path does not serve a standalone UMD bundle and will 404.

---

## What not to do

- Do not split or add a second `<script>` block in `src/index.html`. All in-page view logic belongs in the single existing `<script>` tag.
- Do not add `import` / `export` statements inside the inline script block (it is not a module).
- Do not introduce a JS bundler, Webpack, Vite, or similar toolchain without explicit approval.
- Do not add Mongoose, jQuery Ajax, or any library that duplicates the native `fetch` API.
- Do not refactor existing view activate/deactivate functions when adding a new view. Add the new functions alongside, then wire them in.
- Do not add comments explaining what the code does. Only add a comment when the why is non-obvious.
