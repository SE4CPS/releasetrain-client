# Releasetrain Client

Static browser client for Releasetrain. It renders software release activity,
CVE advisories, and Reddit and Stack Overflow discussion signals from the
Releasetrain REST API. The API itself lives in a separate repository
(releasetrain-server); this repository contains only the front end.

## Architecture

The entire application is a single self contained file, `src/index.html`, with
inline CSS and JavaScript and no build time framework. The build step is a
straight copy of `src/` to `dist/` performed by Grunt. `dist/` is committed but
is regenerated on every Docker build, so treat `src/` as the source of truth.

Runtime dependencies (Chart.js, vis-network, pako) are loaded from a CDN on
demand. The API base URL is hardcoded in `src/index.html` as `API_BASE`
(`https://releasetrain.io/api/`).

## Requirements

* Node.js LTS

## Install

```bash
git clone https://github.com/SE4CPS/releasetrain-client.git
cd releasetrain-client
npm install
```

## Scripts

| Script          | Action                                                        |
| --------------- | ------------------------------------------------------------ |
| `npm run dev`   | Serve `src/` on `http://127.0.0.1:8080` with caching off.   |
| `npm run build` | Copy `src/` to `dist/` (Grunt `default` task).              |
| `npm start`     | Serve the built `dist/` on `http://127.0.0.1:8080`.         |
| `npm run prod`  | `build` then `start`.                                       |
| `npm test`      | Jest.                                                       |
| `npm run lint`  | ESLint with `--fix`.                                        |

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

The image runs `npm install`, `npm test`, and `npm run build`, then serves
`dist/` on port 8080.

## API

Endpoint documentation is available in the running app under the Docs view, and
live at `https://releasetrain.io/api`.

## Contributing

Keep pull requests focused. Edit `src/index.html` only; do not hand edit
`dist/`. Run `npm run build` before committing so `dist/` stays in sync.

Issues: https://github.com/SE4CPS/releasetrain-client/issues

## License

ISC. See `LICENSE`.
