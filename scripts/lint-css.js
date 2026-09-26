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
 *
 * Toggle visibility with classList / setDisplay(), and style with a class
 * defined in styles.css. Plain Node, no dependencies.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', 'src');
const files = fs
  .readdirSync(srcDir)
  .filter((f) => /\.(html|js)$/.test(f))
  .map((f) => path.join(srcDir, f));

const problems = [];

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.resolve(__dirname, '..'), file);
  const add = (index, msg) => problems.push(`${rel}:${lineOf(text, index)}  ${msg}`);

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
