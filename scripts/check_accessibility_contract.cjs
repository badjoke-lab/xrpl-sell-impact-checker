const assert = require('node:assert/strict');
const fs = require('node:fs');

const runtime = fs.readFileSync('shared/accessibility.js', 'utf8');
const css = fs.readFileSync('shared/accessibility.css', 'utf8');
const nav = fs.readFileSync('shared/nav.js', 'utf8');

assert.equal(runtime.includes('Skip to main content'), true);
assert.equal(runtime.includes('table-scroll-region'), true);
assert.equal(runtime.includes("button:not([type])"), true);
assert.equal(runtime.includes('noopener'), true);
assert.equal(css.includes(':focus-visible'), true);
assert.equal(css.includes('min-height:44px'), true);
assert.equal(css.includes('prefers-reduced-motion:reduce'), true);
assert.equal(css.includes('overflow-x:auto'), true);
assert.equal(css.includes('@media(max-width:700px)'), true);
assert.equal(nav.includes("import('/shared/accessibility.js')"), true);

console.log('Accessibility and mobile contract checks passed.');
