/*
 * Build = copy src/ to dist/ and stamp the version. The client is a set of
 * static files with no transform step; dist/ exists only so a plain file
 * server has a single root to serve. dist/ is generated and git-ignored.
 */

const { rmSync, cpSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const src = resolve(root, 'src');
const dist = resolve(root, 'dist');
const distIndex = resolve(dist, 'index.html');

const { version } = require(resolve(root, 'package.json'));

rmSync(dist, { recursive: true, force: true });
cpSync(src, dist, { recursive: true });

// Single-source the version: package.json is authoritative, index.html carries
// a placeholder that the build fills in.
let html = readFileSync(distIndex, 'utf8');
html = html
  .replace(/data-app-version="[^"]*"/, `data-app-version="${version}"`)
  .replace(/(<a class="brand"[^>]*>Releasetrain <em>)v[^<]*(<\/em>)/, `$1v${version}$2`);
writeFileSync(distIndex, html);

console.log(`build: copied src/ -> dist/ (version ${version})`);
