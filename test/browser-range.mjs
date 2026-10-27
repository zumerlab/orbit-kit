/** <o-range> in Chromium: rendering, pointer, keys, forms and events. Fails on console errors and [orbit] warnings. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orbit = path.resolve(process.env.ORBIT_DIR || (existsSync(path.join(root, '../orbit/dist/orbit.js')) ? path.join(root, '../orbit') : path.join(root, 'node_modules/@zumer/orbit')));
for (const file of ['orbit.js', 'orbit.css']) assert.ok(existsSync(path.join(orbit, 'dist', file)), `Missing ${orbit}/dist/${file}; build Orbit first or set ORBIT_DIR.`);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>o-range</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/orbit-kit.js"></script>
      <body><button id="before">Before</button><main id="fixtures"></main></body></html>`);
    return;
  }
  const directory = pathname.startsWith('/orbit/') ? path.join(orbit, 'dist') : pathname.startsWith('/kit/') ? path.join(root, 'src') : null;
  const filename = directory && path.resolve(directory, pathname.replace(/^\/(orbit|kit)\//, ''));
  if (!filename || !filename.startsWith(directory + path.sep)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('content-type', filename.endsWith('.css') ? 'text/css' : 'text/javascript');
    response.end(readFileSync(filename));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.text().includes('[orbit]')) errors.push(`${message.type()}: ${message.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => Promise.all(['o-arc', 'o-range'].map((tag) => customElements.whenDefined(tag))));
  const settle = () => page.evaluate(() => Orbit.ready().then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const mount = async (html) => { await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html); await settle(); };
  const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ chromium: ${title}`); };
  // A point on the dial: angle clockwise from 12 o'clock, radius in lanes (orbit-12 is the edge).
  const at = (selector, angle, lanes) => page.locator(`${selector} .bigbang`).evaluate((box, [a, r]) => {
    const b = box.getBoundingClientRect(), k = b.width / 24, rad = a * Math.PI / 180;
    return { x: b.left + b.width / 2 + Math.sin(rad) * r * k, y: b.top + b.height / 2 - Math.cos(rad) * r * k };
  }, [angle, lanes]);
  const center = (locator) => locator.evaluate((n) => { const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  const near = (p, q, tolerance = 3) => assert.ok(Math.hypot(p.x - q.x, p.y - q.y) <= tolerance, `expected ${JSON.stringify(p)} near ${JSON.stringify(q)}`);
  const log = () => page.evaluate(() => {
    window.log = [];
    if (window.logging) return;
    window.logging = true;
    for (const type of ['input', 'change']) document.addEventListener(type, (e) => window.log.push([type, e.detail.value]));
  });

  await test('renders the band, handles on the band and the span readout', async () => {
    await mount('<o-range id="r" mode="time" hours="24" start="22:30" end="06:45" size="300px" start-label="Bedtime" end-label="Wake up"></o-range>');
    // The band center line sits 1.2 lanes in from the edge (thickness 2.4).
    near(await center(page.locator('#r [data-handle="start"]')), await at('#r', 337.5, 10.8));
    near(await center(page.locator('#r [data-handle="end"]')), await at('#r', 101.25, 10.8));
    assert.equal(await page.locator('#r .ok-range-span').textContent(), '8h15min');
    assert.equal(await page.locator('#r .ok-range-times').textContent(), '22:30 – 06:45');
    assert.equal(Number(await page.locator('#r .ok-range-band').getAttribute('value')).toFixed(2), (495 / 1440 * 100).toFixed(2));
    assert.equal(await page.getByRole('slider', { name: 'Bedtime' }).getAttribute('aria-valuetext'), '22:30, span 8 h 15 min');
    assert.equal(await page.getByRole('group', { name: 'Time range' }).count(), 1);
  });

  await test('dragging a handle follows the pointer and fires input, then change', async () => {
    await mount('<o-range id="r" mode="time" hours="24" start="22:00" end="06:00" size="300px"></o-range>');
    await log();
    const from = await center(page.locator('#r [data-handle="end"]'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (const angle of [100, 110, 120]) { const p = await at('#r', angle, 10.8); await page.mouse.move(p.x, p.y); }
    await page.mouse.up();
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '22:00-08:00');
    const events = await page.evaluate(() => window.log);
    assert.ok(events.filter(([t]) => t === 'input').length >= 1);
    assert.deepEqual(events.at(-1), ['change', '22:00-08:00']);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.handle), 'end');
  });

  await test('a handle dragged past midnight keeps counting; min-span pushes the other one', async () => {
    await mount('<o-range id="r" mode="time" hours="24" start="22:00" end="23:00" min-span="60" size="300px"></o-range>');
    const from = await center(page.locator('#r [data-handle="start"]'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (const angle of [340, 350, 0, 15]) { const p = await at('#r', angle, 10.8); await page.mouse.move(p.x, p.y); }
    await page.mouse.up();
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '01:00-02:00');
  });

  await test('dragging the band moves both ends; a tap on the track brings the closer handle', async () => {
    await mount('<o-range id="r" start="20" end="60" range="360" size="300px"></o-range>');
    const grab = await at('#r', 144, 10.8); // value 40, mid band
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (const angle of [160, 180]) { const p = await at('#r', angle, 10.8); await page.mouse.move(p.x, p.y); }
    await page.mouse.up();
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '30-70');
    const tap = await at('#r', 288, 10.8); // value 80
    await page.mouse.click(tap.x, tap.y);
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '30-80');
  });

  await test('keys move one handle; Shift moves both; Home and End respect the span', async () => {
    await mount('<o-range id="r" start="20" end="80" min-span="10"></o-range>');
    await log();
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Start');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('PageUp');
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '31-80');
    await page.keyboard.press('Shift+ArrowLeft');
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '30-79');
    await page.keyboard.press('End');
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '90-100');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#r').evaluate((n) => n.value), '0-10');
    assert.deepEqual((await page.evaluate(() => window.log)).slice(0, 2), [['input', '21-80'], ['change', '21-80']]);
    assert.equal(await page.getByRole('slider', { name: 'End' }).getAttribute('aria-valuenow'), '10');
  });

  await test('forms: submits the pair, resets, follows a disabled fieldset', async () => {
    await mount(`<form id="form"><fieldset id="set"><o-range name="sleep" mode="time" start="23:00" end="07:00"></o-range></fieldset></form>`);
    const data = () => page.locator('#form').evaluate((form) => Object.fromEntries(new FormData(form)));
    assert.deepEqual(await data(), { sleep: '23:00-07:00' });
    await page.getByRole('slider', { name: 'End' }).focus();
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await data(), { sleep: '23:00-07:05' });
    assert.equal(await page.locator('o-range').getAttribute('end'), '07:05');
    await page.locator('#form').evaluate((form) => form.reset());
    assert.deepEqual(await data(), { sleep: '23:00-07:00' });
    await page.locator('#set').evaluate((set) => { set.disabled = true; });
    assert.deepEqual(await page.locator('o-range').evaluate((n) => [n.matches(':disabled'), n.querySelector('[data-handle]').tabIndex]), [true, -1]);
    assert.deepEqual(await data(), {});
    await page.locator('#set').evaluate((set) => { set.disabled = false; });
  });

  await test('12-hour dial, numbers with wrap, themes and a partial arc render without warnings', async () => {
    await mount(`<o-range mode="time" hours="12" start-icon="moon" end-icon="bell"></o-range>
      <o-range wrap min="0" max="360" start="300" end="60" unit="°"></o-range>
      <div class="ok-theme-light"><o-range id="light" start="10" end="40" range="240" format="percent"></o-range></div>`);
    assert.equal(await page.locator('o-range').first().locator('.ok-range-num.is-major').first().textContent(), '12AM');
    assert.equal(await page.locator('#light .ok-value').evaluate((n) => getComputedStyle(n).getPropertyValue('--o-fill').trim()), '#0d9488');
    assert.equal(await page.locator('#light .ok-range-span').textContent(), '30%');
  });
  console.log('o-range browser tests passed (chromium).');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
