# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities through GitHub private vulnerability reporting
on this repository, or by email to the maintainer listed in `package.json`.
Please do not open a public issue for security reports.

Include steps to reproduce, affected views or endpoints, and the impact you
observed. Expect an acknowledgement within a few business days.

## Scope

This repository is the static browser client only. It ships no server code and
stores no credentials. The REST API and its data store live in
`releasetrain-server`.

The client loads a small number of third party libraries from public CDNs at
runtime (Chart.js, vis-network, mermaid, pako). Versions are pinned in
`src/index.html`.
