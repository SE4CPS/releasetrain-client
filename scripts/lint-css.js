'use strict';

/*
 * CSS architecture lint: presentation lives in src/styles.css only.
 *
 * Fails on, in any src/*.html or src/*.js file:
 *   - a <style> block
 *   - a style="..." attribute, except one that only sets --rt-* custom
 *     properties (runtime values such as a computed width or color)
 *   - element.style.<property> reads or writes (setProperty of a --custom
 *     property is the one allowed use)
 *   - cssText and setAttribute("style", ...)
 *   - inline <script> code or on...= event-handler attributes (all JS lives in
 *     src/js/)
 *
 * Toggle visibility with classList / setDisplay(), and style with a class
 * defined in styles.css. Plain Node, no dependencies.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');
const files = [];
(function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/[.](html|js)$/.test(entry.name)) files.push(full);
  }
})(srcDir);

const problems = [];

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.resolve(__dirname, '..'), file);
  const add = (index, msg) => problems.push(`${rel}:${lineOf(text, index)}  ${msg}`);

  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)) add(m.index, 'inline <script>: move the code to a file in src/js/');
    for (const m of text.matchAll(/\son(?:click|change|input|submit|key\w+|load|error|mouse\w+|focus|blur)=/g)) add(m.index, 'inline event handler: use addEventListener in src/js/');
  } else {
    for (const m of text.matchAll(/["'`]<[a-z][^>]*\son(?:click|change|input|submit|key\w+|load|error|mouse\w+|focus|blur)=/g)) add(m.index, 'inline event handler in a template: use addEventListener');
  }

  for (const m of text.matchAll(/<style[\s>]/g)) add(m.index, '<style> block: move it to src/styles.css');

  for (const m of text.matchAll(/\sstyle=(?:"([^"]*)"|'([^']*)')/g)) {
    const value = (m[1] !== undefined ? m[1] : m[2]).trim();
    const decls = value.split(';').map((d) => d.trim()).filter(Boolean);
    const onlyRuntimeVars = decls.length > 0 && decls.every((d) => /^--rt-[\w-]+\s*:/.test(d));
    if (!onlyRuntimeVars) add(m.index, `inline style="${value.slice(0, 50)}": use a class in styles.css`);
  }

  for (const m of text.matchAll(/\.style\.(\w+)/g)) {
    if (m[1] === 'setProperty') continue;
    add(m.index, `.style.${m[1]}: use classList, setDisplay() or a --rt-* variable`);
  }
  for (const m of text.matchAll(/\.style\.setProperty\(\s*(["'])(?!--rt-|--topbar-h|--console-left)/g)) {
    add(m.index, 'style.setProperty is only for --rt-* custom properties');
  }
  for (const m of text.matchAll(/cssText|setAttribute\(\s*["']style["']/g)) {
    add(m.index, `${m[0]}: use a class in styles.css`);
  }
}

if (problems.length) {
  console.error(`CSS lint: ${problems.length} problem(s). All styling belongs in src/styles.css.\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`CSS lint: ok (${files.length} files checked)`);
