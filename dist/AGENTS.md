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

---

## CSS conventions

- All view-specific CSS goes in the single `<style>` block in `src/index.html`.
- Use the design tokens from `:root` (`--brand`, `--border`, `--muted`, `--surface`, `--bg`, `--radius`, etc.). Do not hardcode colour values.
- Place styles for a new view directly before the `/* ── Docs view ── */` comment block or adjacent to the existing view's own CSS section.
- Do not add external CSS frameworks or new CDN stylesheet links.

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

## What not to do

- Do not split or add a second `<script>` block in `src/index.html`. All in-page view logic belongs in the single existing `<script>` tag.
- Do not add `import` / `export` statements inside the inline script block (it is not a module).
- Do not introduce a JS bundler, Webpack, Vite, or similar toolchain without explicit approval.
- Do not add Mongoose, jQuery Ajax, or any library that duplicates the native `fetch` API.
- Do not refactor existing view activate/deactivate functions when adding a new view. Add the new functions alongside, then wire them in.
- Do not add comments explaining what the code does. Only add a comment when the why is non-obvious.
