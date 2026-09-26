# Releasetrain Client

[![CI](https://github.com/SE4CPS/releasetrain-client/actions/workflows/ci.yml/badge.svg)](https://github.com/SE4CPS/releasetrain-client/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/SE4CPS/releasetrain-client)](https://github.com/SE4CPS/releasetrain-client/releases)
[![License: ISC](https://img.shields.io/github/license/SE4CPS/releasetrain-client)](LICENSE)

Static browser client for Releasetrain: software release activity, CVE
advisories, and Reddit/Stack Overflow discussion signals from the
Releasetrain REST API (lives in the separate `releasetrain-server` repo).

## Architecture

A static page with no build-time framework or bundler:

- `src/index.html`: markup only. No `<style>`, no inline styles, no inline scripts.
- `src/styles.css`: all CSS. Values that only exist at runtime are set from JS as `--rt-*` custom properties.
- `src/js/*.js`: all JavaScript, as plain classic scripts loaded in order by `index.html` (they share one global scope, like one big script). `core.js` first, feature files in the middle (`ask*.js`, `graph.js`, `arch.js`, `feed.js`, `cve.js`, `account.js`, ...), and `main.js` last: it holds the start-up code, which needs every earlier file's functions to exist. Put new start-up calls in `main.js`, not in a feature file.

Third-party runtime libraries (Chart.js, vis-network, mermaid, pako) load from a CDN at pinned versions. `npm run build` copies `src/` to `dist/` (git-ignored) and stamps the version into the asset URLs; `src/` is the source of truth. `npm run lint` (`scripts/lint-css.js`) enforces the no-inline-CSS/JS rules.

The API base resolves from, in order: a `?api=` query param, the
`<meta name="api-base">` tag in `src/index.html`, then the built-in default
`https://releasetrain.io/api/`.

## Install & run

```bash
git clone https://github.com/SE4CPS/releasetrain-client.git
cd releasetrain-client
npm install
npm run dev   # serves src/ at http://127.0.0.1:8080
```

Node.js 18+ required. Playwright needs its browser once: `npx playwright install chromium`.

| Script | Action |
| --- | --- |
| `npm run dev` | Serve `src/` directly, caching off. |
| `npm run build` | Copy `src/` to `dist/`, stamp the version. |
| `npm run check` | Build, lint, and run the Playwright smoke suite (what CI runs). |

## Views

Feed is the default view; every other view is reachable from the top nav or a `view` query param.

| View | URL | Contents |
| --- | --- | --- |
| Feed | `/` | Grouped release cards, filters, activity chart. |
| Graph | `/?view=graph` | Component/release/post graph. |
| Arch | `/?view=arch` | Layered architecture diagram. |
| CVE | `/?view=cve` | CVE timeline. |
| Risk Report | `/?view=risk` | Community risk summary. |
| Docs | `/?view=docs` | API reference. |
| Account | `/?view=account` | Sign-in, saved searches, admin panel. |

Filters are shareable via URL, e.g. `/?q=chrome,firefox`.

## Docker

```bash
docker build -t releasetrain-client .
docker run --rm -p 8080:8080 releasetrain-client
```

## Contributing

Edit files under `src/` only. `dist/` is generated; never commit it. See
[CONTRIBUTING.md](CONTRIBUTING.md). Issues: [github.com/SE4CPS/releasetrain-client/issues](https://github.com/SE4CPS/releasetrain-client/issues).

## License

ISC. See [LICENSE](LICENSE).
