# releasetrain-client Agent Rules

Read this before acting on any prompt.

---

## Output style

- No hyphens or dashes in written prose or UI text. Use commas, colons, or rewrite the sentence instead.
- Keep all text technical. Describe what the system does, not what value it delivers. No product marketing language.

---

## After every code change

1. Run `npx grunt` from `releasetrain-client/` to sync `src/` to `dist/`.
2. Add a changelog bullet to the current version entry in `#changelogView` inside `src/index.html`.
3. Bump the version in the topbar brand (`<em>vX.Y.Z</em>`) and in `package.json` once per day maximum. If a version was already bumped today, add to the existing entry rather than creating a new one.

### Version bump rule
| Change type | Bump |
|---|---|
| New feature | minor |
| Bug fix, style, or docs | patch |

---

## Docs view rules

- Section headings use `:` as separator, not `·` or `--`.
- No brand name (`ReleaseTrain.io`, `ReleaseTrain`) in prose. Use repo names (`releasetrain-client`, `releasetrain-server`, etc.) or plain descriptions.

---

## Security

Never commit or log tokens from `.env` files.
