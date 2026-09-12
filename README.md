# Releasetrain Client

[![CI](https://github.com/SE4CPS/releasetrain-client/actions/workflows/ci.yml/badge.svg)](https://github.com/SE4CPS/releasetrain-client/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/SE4CPS/releasetrain-client)](https://github.com/SE4CPS/releasetrain-client/releases)
[![License: ISC](https://img.shields.io/github/license/SE4CPS/releasetrain-client)](LICENSE)

Static browser client for Releasetrain: software release activity, CVE
advisories, and Reddit/Stack Overflow discussion signals from the
Releasetrain REST API (lives in the separate `releasetrain-server` repo).

## Architecture

One self-contained file, `src/index.html`: inline CSS/JS, no build-time
framework. Third-party runtime libraries (Chart.js, vis-network, mermaid,
pako) load from a CDN at pinned versions. `npm run build` copies `src/` to
`dist/` (git-ignored) and stamps the version; `src/` is the source of truth.

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
