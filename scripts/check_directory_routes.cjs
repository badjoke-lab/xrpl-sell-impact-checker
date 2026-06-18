const assert = require('node:assert/strict');
const fs = require('node:fs');

const apps = fs.readFileSync('apps/index.html', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const routes = [
  '/apps/privacy-zk-watch/',
  '/apps/proof-anchor-checker/',
  '/apps/institutional-readiness-radar/',
];

for (const route of routes) {
  assert.equal(apps.includes(`href="${route}"`), true, `Apps directory missing ${route}`);
  assert.equal(sitemap.includes(`https://xsic.badjoke-lab.com${route}`), true, `Sitemap missing ${route}`);
  assert.equal(fs.existsSync(`${route.slice(1)}index.html`), true, `Route file missing ${route}`);
}
assert.equal(apps.includes('Six execution and market-context tools'), true);
assert.equal(apps.includes('Four bounded research and visualization tools'), true);

console.log('Apps directory and public-route checks passed.');
