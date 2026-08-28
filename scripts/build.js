'use strict';

/*
 * Build = copy src/ to dist/ and stamp the version. The client is a set of
 * static files with no transform step; dist/ exists only so a plain file
 * server has a single root to serve. dist/ is generated and git-ignored.
 *
 * Uses the platform's own copy tools rather than fs.cpSync so it runs on old
 * Node too (the deploy box is stuck on Node 12). No third-party deps.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const { version } = require(path.join(root, 'package.json'));

if (process.platform === 'win32') {
  // rmdir may fail if a sync client (OneDrive) holds a lock; xcopy /Y overwrites regardless.
  execSync(`rmdir /s /q "${dist}" 2>nul & xcopy "${src}" "${dist}" /E /I /Y /Q >nul`, {
    shell: 'cmd.exe',
  });
} else {
  execSync(`rm -rf "${dist}" && cp -R "${src}" "${dist}"`);
}

// Single-source the version: package.json is authoritative; index.html carries
// a placeholder the build fills in.
const indexPath = path.join(dist, 'index.html');
const html = fs
  .readFileSync(indexPath, 'utf8')
  .replace(/data-app-version="[^"]*"/, `data-app-version="${version}"`)
  .replace(
    /(<a class="brand"[^>]*>Releasetrain <em>)v[^<]*(<\/em>)/,
    `$1v${version}$2`,
  );
fs.writeFileSync(indexPath, html);

console.log(`build: copied src/ -> dist/ (version ${version})`);
