/**
 * Render docs/index.html in real Chromium and screenshot each component, so we
 * can SEE the output instead of guessing.
 *
 * Requires Playwright (devDependency):
 *   npm install && npx playwright install chromium
 *   npm run shots                 # full page + per-component shots -> .shots/
 *
 * The docs page loads orbit + orbit-kit from the unpkg CDN; this script
 * intercepts those requests and serves the LOCAL build instead, so screenshots
 * always reflect your working tree.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.resolve(here, '../.shots');
const orbitDist = path.resolve(here, '../node_modules/@zumer/orbit/dist');
fs.mkdirSync(outDir, { recursive: true });

// ES modules can't load over file:// (CORS), so serve the project over HTTP.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const galleryUrl = `http://127.0.0.1:${server.address().port}/docs/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });

// Serve the CDN packages from the local working tree:
//   @zumer/orbit     -> node_modules/@zumer/orbit/dist/<file>
//   @zumer/orbit-kit -> <repo>/src/<file>
await page.route('**/unpkg.com/**', (route) => {
  const m = new URL(route.request().url()).pathname.match(/@zumer\/(orbit-kit|orbit)@[^/]*\/(.+)$/);
  if (!m) return route.continue();
  const [, pkg, rel] = m;
  const file = pkg === 'orbit' ? path.join(orbitDist, path.basename(rel)) : path.join(root, rel);
  try {
    route.fulfill({ contentType: rel.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(file, 'utf8') });
  } catch { route.continue(); }
});

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(galleryUrl, { waitUntil: 'networkidle' });
// Give the custom elements + CDN a beat to upgrade and the animations to settle.
await page.waitForTimeout(1500);

// Full page.
await page.screenshot({ path: path.join(outDir, '00-full.png'), fullPage: true });

// Clean per-component shots via element.screenshot (robust, no clip math).
const cells = await page.$$('.cell');
let n = 0;
for (const cell of cells) {
  const name = (await cell.evaluate((c) => (c.querySelector('o-gauge,o-donut,o-rings,o-meter,o-knob,o-menu,o-compass,o-instrument,o-clock,o-radar')?.tagName || 'cell')
    + '-' + (c.querySelector('code')?.textContent || c.querySelector('small')?.textContent || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 22))).toLowerCase();
  try { await cell.screenshot({ path: path.join(outDir, `cell-${String(++n).padStart(2, '0')}-${name}.png`) }); }
  catch (e) { console.log(`  (skip ${name}: ${e.message.split('\n')[0]})`); }
}

// Drive the concentric menu so we can see a real expansion.
const m3 = await page.$('#menu3');
if (m3) {
  await page.evaluate(() => document.getElementById('menu3')._activateAt(0, 1)); // open "Format"
  await page.waitForTimeout(350);
  await m3.screenshot({ path: path.join(outDir, 'menu-concentric-1-format-open.png') });
  await page.evaluate(() => document.getElementById('menu3')._activateAt(1, 2)); // open "Align"
  await page.waitForTimeout(350);
  await m3.screenshot({ path: path.join(outDir, 'menu-concentric-2-align-open.png') });
}

console.log(`shot ${n} cells + concentric menu + full page -> .shots/`);
console.log(errors.length ? `CONSOLE ERRORS:\n  ${errors.slice(0, 12).join('\n  ')}` : 'no console errors');
await browser.close();
server.close();
