// Compare the two menu themes (color vs mono) — single + concentric, side by side.
// Requires Playwright (devDependency): npm install && npx playwright install chromium
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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 2 });
// Serve the CDN packages (orbit + orbit-kit) from the local working tree.
await page.route('**/unpkg.com/**', (route) => {
  const m = new URL(route.request().url()).pathname.match(/@zumer\/(orbit-kit|orbit)@[^/]*\/(.+)$/);
  if (!m) return route.continue();
  const [, pkg, rel] = m;
  const file = pkg === 'orbit' ? path.join(orbitDist, path.basename(rel)) : path.join(root, rel);
  try { route.fulfill({ contentType: rel.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(file, 'utf8') }); }
  catch { route.continue(); }
});
await page.goto(`http://127.0.0.1:${port}/docs/index.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const ITEMS = JSON.stringify([
  { label: 'File', children: [{ label: 'New', value: 'n' }, { label: 'Open', value: 'o' }, { label: 'Save', value: 's' }] },
  { label: 'Edit', children: [{ label: 'Cut', value: 'x' }, { label: 'Copy', value: 'c' }, { label: 'Paste', value: 'v' }] },
  { label: 'View', children: [{ label: 'In', value: 'i' }, { label: 'Out', value: 'd' }] },
  { label: 'Help', value: 'h' }
]);

async function shoot(name, html, action) {
  await page.evaluate(({ html }) => {
    let d = document.getElementById('shotbox');
    if (d) d.remove();
    d = document.createElement('div');
    d.id = 'shotbox';
    d.style.cssText = 'position:fixed;left:0;top:0;background:#0b0f16;padding:24px;z-index:9999;';
    d.innerHTML = html;
    document.body.appendChild(d);
  }, { html });
  await page.waitForTimeout(500);
  if (action) { await page.evaluate(action); await page.waitForTimeout(500); }
  const el = await page.$('#shotbox > *');
  await el.screenshot({ path: path.join(outDir, `menu-${name}.png`) });
}

// theme=color
await shoot('A-color-single', `<o-menu id="m" theme="color" label="MENU" range="270" size="300px" items='${ITEMS}'></o-menu>`);
await shoot('A-color-concentric', `<o-menu id="m" theme="color" expand="concentric" label="EDIT" size="320px" items='${ITEMS}'></o-menu>`,
  () => document.getElementById('m')._activateAt(0, 1));
// theme=mono
await shoot('B-mono-single', `<o-menu id="m" theme="mono" label="MENU" range="270" size="300px" items='${ITEMS}'></o-menu>`,
  () => document.getElementById('m')._activateAt(0, 1)); // mark one active to show the accent
await shoot('B-mono-concentric', `<o-menu id="m" theme="mono" expand="concentric" label="EDIT" size="320px" items='${ITEMS}'></o-menu>`,
  () => document.getElementById('m')._activateAt(0, 1));

console.log('menu theme shots -> .shots/menu-A-*.png (color) and menu-B-*.png (mono)');
await browser.close();
server.close();
