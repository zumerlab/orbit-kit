import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

/** Shared local-only package routing for optional visual capture scripts. */
export async function createCaptureContext(viewport) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const orbit = path.resolve(process.env.ORBIT_DIR || path.join(root, 'node_modules/@zumer/orbit'));
  for (const file of ['orbit.css', 'orbit.js']) assert.ok(fs.existsSync(path.join(orbit, 'dist', file)), `Missing ${orbit}/dist/${file}; build Orbit first or set ORBIT_DIR.`);
  const outDir = path.join(root, '.shots');
  fs.mkdirSync(outDir, { recursive: true });
  const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css' };
  const errors = [];
  const server = http.createServer((request, response) => {
    let relative;
    try { relative = decodeURIComponent(new URL(request.url, 'http://local').pathname); } catch { response.writeHead(400).end(); return; }
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end('not found'); return; }
    response.writeHead(200, { 'content-type':types[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  let browser;
  const close = async () => { try { if (browser) await browser.close(); } finally { await new Promise(resolve => server.close(resolve)); } };
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport, deviceScaleFactor:2 });
    page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/unpkg.com/**', async route => {
      const url = new URL(route.request().url());
      const match = url.pathname.match(/^\/@zumer\/(orbit-kit|orbit)@[^/]+\/(.+)$/);
      if (!match) { errors.push(`No local mapping for ${url.pathname}`); await route.abort(); return; }
      const [,pkg,relative] = match;
      const directory = pkg === 'orbit' ? orbit : root;
      const filename = path.resolve(directory, relative);
      try {
        assert.ok(filename.startsWith(directory + path.sep), 'Package path escapes local root');
        await route.fulfill({ contentType:types[path.extname(filename)] || 'application/octet-stream', headers:{'access-control-allow-origin':'*','cache-control':'no-store'}, body:fs.readFileSync(filename) });
      } catch(error) {
        errors.push(`Local asset unavailable: ${filename}: ${error.message}`);
        await route.abort();
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/docs/index.html`, { waitUntil:'networkidle' });
    const assertClean = () => assert.deepEqual(errors, [], `Capture failed with browser/local asset errors:\n${errors.join('\n')}`);
    assertClean();
    console.log(`Capturing kit ${root}/src against Orbit ${orbit}/dist`);
    return { page, outDir, errors, assertClean, close };
  } catch(error) { await close(); throw error; }
}
