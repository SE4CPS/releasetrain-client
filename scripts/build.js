'use strict';

/*
 * Build = copy src/ to dist/. The client is a set of static files with no
 * transform step; dist/ exists only so a plain file server has a single root
 * to serve. dist/ is generated and git-ignored.
 */

const { rmSync, cpSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const src = resolve(root, 'src');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });
cpSync(src, dist, { recursive: true });

console.log('build: copied src/ -> dist/');
