# Releasetrain Client

Static browser client for Releasetrain. It renders software release activity,
CVE advisories, and Reddit and Stack Overflow discussion signals from the
Releasetrain REST API. The API itself lives in a separate repository
(releasetrain-server); this repository contains only the front end.

## Architecture

The application is one self contained file, `src/index.html`, with inline CSS
and JavaScript and no build time framework. Everything under `src/` is a static
asset. Third party runtime libraries (Chart.js, vis-network, mermaid, pako) load
from a CDN on demand at pinned versions.

`npm run build` copies `src/` to `dist/` via `scripts/build.js` and stamps the
`package.json` version into the page. `dist/` is generated, git ignored, and
only exists so a plain file server has a single root to serve. `src/` is the
source of truth.

The API base URL resolves from, in order: a `?api=` query parameter, the
`<meta name="api-base">` tag in `src/index.html`, then the built in default
`https://releasetrain.io/api/`. There is no server side code here; the API
lives in `releasetrain-server`.

## Requirements

* Node.js 18 or newer

## Install

```bash
git clone https://github.com/SE4CPS/releasetrain-client.git
cd releasetrain-client
npm install
```

## Scripts

| Script           | Action                                                        |
| ---------------- | ---------------------------------------------------------- |
| `npm run dev`    | Serve `src/` on `http://127.0.0.1:8080`, caching off.    |
| `npm run build`  | Copy `src/` to `dist/` and stamp the version.            |
| `npm start`      | Serve `dist/` on `http://127.0.0.1:8080`, caching off.   |
| `npm run prod`   | `build` then `start`.                                    |
| `npm run lint`   | Biome check on `scripts/` and `tests/`.                  |
| `npm run format` | Biome check with `--write` on `scripts/` and `tests/`.   |
| `npm test`       | `build` then Playwright smoke tests against `dist/`.     |
| `npm run check`  | `build`, `lint`, and Playwright tests. CI runs this.     |

Playwright needs browser binaries once: `npx playwright install chromium`.

## Testing

`tests/smoke.spec.js` loads the built page, visits every top level view, and
fails on any uncaught JavaScript error. It also checks that a shareable filter
parameter is applied on load. This is deliberately shallow; it stands in for a
real unit layer until `src/index.html` is split into modules.

CI (`.github/workflows/ci.yml`) runs `build`, `lint`, and the Playwright suite
on every push and pull request.

## Views

The feed is the default view. Every other view is reachable from the top
navigation and by a `view` query parameter.

| View        | URL                  | Contents                                                        |
| ----------- | -------------------- | ------------------------------------------------------------- |
| Feed        | `/`                  | Grouped release cards, quick filters, sidebar activity chart.  |
| Graph       | `/?view=graph`       | vis-network graph of components with their releases and posts. |
| Arch        | `/?view=arch`        | PlantUML stack diagram, layered hypervisor then OS then application. |
| CVE         | `/?view=cve`         | CVE timeline with NVD pipeline status.                         |
| Risk Report | `/?view=risk`        | Community risk summary.                                        |
| Docs        | `/?view=docs`        | API reference and system architecture diagrams.               |
| Changelog   | `/?view=changelog`   | Client change history.                                         |
| Release     | `/?view=release`     | Release outcome reports.                                       |
| Credits     | `/?view=credits`     | Acknowledgements.                                              |
| Account     | `/?view=account`     | Local inventory and saved searches.                            |

Filter state is shareable through the URL, for example `/?q=chrome,firefox`,
`/?type=llm`, and `/?type=hv`.

## Configuration

To point the client at a different API, edit `API_BASE` in `src/index.html`.
There are no environment variables and no server side configuration.

## Docker

```bash
docker build -t releasetrain-client .
docker run --rm -p 8080:8080 releasetrain-client
```

The image runs `npm ci --omit=dev` and `npm run build`, then serves `dist/` on
port 8080.

## API

Endpoint documentation is in the running app under the Docs view, and live at
`https://releasetrain.io/api`.

## Contributing

Edit files under `src/` only. `dist/` is generated; do not commit it. Keep pull
requests focused.

Issues: https://github.com/SE4CPS/releasetrain-client/issues

## License

ISC. See `LICENSE`.
