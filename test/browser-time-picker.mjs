/** <o-time-picker> in Chromium: the dial, the fields, forms and events. Fails on console errors and [orbit] warnings. */
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
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>o-time-picker</title>
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
  await page.evaluate(() => Promise.all(['o-arc', 'o-time-picker'].map((tag) => customElements.whenDefined(tag))));
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

  const value = () => page.locator('#t').evaluate((n) => n.value);

  await test('renders the fields, the dial and the selector on the picked hour', async () => {
    await mount('<o-time-picker id="t" value="22:35" hours="12" size="300px"></o-time-picker>');
    assert.equal(await page.getByRole('spinbutton', { name: 'Hours' }).textContent(), '10');
    assert.equal(await page.getByRole('spinbutton', { name: 'Minutes' }).textContent(), '35');
    assert.equal(await page.getByRole('button', { name: 'PM' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#t .ok-tp-hours .is-selected').textContent(), '10');
    near(await center(page.locator('#t .is-outer .ok-tp-knob')), await at('#t', 300, 10));
    assert.equal(await page.getByRole('group', { name: 'Time, 10:35 PM' }).count(), 1);
  });

  await test('tap an hour, let go, then drag the minutes; input and change fire', async () => {
    await mount('<o-time-picker id="t" value="10:00" hours="12" size="300px"></o-time-picker>');
    await log();
    const three = await at('#t', 90, 10);
    await page.mouse.click(three.x, three.y);
    assert.equal(await value(), '03:00');
    assert.equal(await page.locator('#t').getAttribute('view'), 'minutes');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Minutes');
    const a = await at('#t', 60, 9), b = await at('#t', 132, 9);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2);
    await page.mouse.move(b.x, b.y);
    await page.mouse.up();
    assert.equal(await value(), '03:22');
    assert.ok(await page.locator('#t .is-outer .ok-tp-knob.is-between').count(), 'a minute between the labels shows a dot');
    const events = await page.evaluate(() => window.log);
    assert.deepEqual(events[0], ['input', '03:00']);
    assert.deepEqual(events[1], ['change', '03:00']);
    assert.deepEqual(events.at(-1), ['change', '03:22']);
  });

  await test('the 24-hour dial picks the inner ring near the center', async () => {
    await mount('<o-time-picker id="t" value="08:15" hours="24" size="300px"></o-time-picker>');
    const inner = await at('#t', 180, 7);
    await page.mouse.click(inner.x, inner.y);
    assert.equal(await value(), '18:15');
    await page.locator('#t').evaluate((n) => { n.view = 'hours'; });
    const outer = await at('#t', 0, 10);
    await page.mouse.click(outer.x, outer.y);
    assert.equal(await value(), '12:15');
    await page.locator('#t').evaluate((n) => { n.view = 'hours'; });
    const top = await at('#t', 0, 7);
    await page.mouse.click(top.x, top.y);
    assert.equal(await value(), '00:15');
  });

  await test('min and max: hours out of range are dimmed and cannot be picked', async () => {
    await mount('<o-time-picker id="t" value="10:00" hours="24" min="09:00" max="17:00" size="300px"></o-time-picker>');
    assert.equal(await page.locator('#t .ok-tp-hours .is-off').count(), 8, 'outer ring: 9 to 12 are in');
    assert.equal(await page.locator('#t .ok-tp-hours-inner .is-off').count(), 7, 'inner ring: 13 to 17 are in');
    const eight = await at('#t', 240, 10);
    await page.mouse.click(eight.x, eight.y);
    assert.equal(await value(), '10:00');
    assert.equal(await page.locator('#t').getAttribute('view'), 'minutes');
  });

  await test('keyboard: Tab through the fields, arrows, digits, Left / Right and A / P', async () => {
    await mount('<o-time-picker id="t" value="09:30" hours="12" minute-step="5"></o-time-picker>');
    await log();
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Hours');
    await page.keyboard.press('ArrowUp');
    assert.equal(await value(), '10:30');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#t').getAttribute('view'), 'minutes');
    await page.keyboard.press('ArrowDown');
    assert.equal(await value(), '10:25');
    await page.keyboard.type('4');
    await page.keyboard.type('5');
    assert.equal(await value(), '10:45');
    await page.keyboard.press('p');
    assert.equal(await value(), '22:45');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'AM');
    await page.keyboard.press('Enter');
    assert.equal(await value(), '10:45');
    assert.deepEqual((await page.evaluate(() => window.log)).slice(0, 2), [['input', '10:30'], ['change', '10:30']]);
    assert.equal(await page.getByRole('spinbutton', { name: 'Hours' }).getAttribute('aria-valuetext'), '10 AM');
  });

  await test('forms: required, submit, reset and a disabled fieldset', async () => {
    await mount('<form id="form"><fieldset id="set"><o-time-picker id="t" name="when" required hours="24"></o-time-picker></fieldset></form>');
    const data = () => page.locator('#form').evaluate((form) => Object.fromEntries(new FormData(form)));
    assert.equal(await page.locator('#form').evaluate((form) => form.checkValidity()), false);
    assert.equal(await page.getByRole('spinbutton', { name: 'Hours' }).textContent(), '--');
    const six = await at('#t', 180, 10);
    await page.mouse.click(six.x, six.y);
    assert.deepEqual(await data(), { when: '06:00' });
    assert.equal(await page.locator('#form').evaluate((form) => form.checkValidity()), true);
    await page.locator('#form').evaluate((form) => form.reset());
    assert.deepEqual(await data(), { when: '' });
    assert.equal(await page.locator('#t').getAttribute('view'), 'minutes', 'reset keeps the view');
    await page.locator('#t').evaluate((n) => { n.value = '07:45'; });
    await page.locator('#set').evaluate((set) => { set.disabled = true; });
    assert.deepEqual(await page.locator('#t').evaluate((n) => [n.matches(':disabled'), n.querySelector('[data-seg]').tabIndex]), [true, -1]);
    assert.deepEqual(await data(), {});
    await page.mouse.click(six.x, six.y);
    assert.equal(await value(), '07:45', 'a disabled dial ignores the pointer');
  });

  await test('themes render without warnings', async () => {
    await mount('<div class="ok-theme-light"><o-time-picker id="t" value="12:00" hours="24"></o-time-picker></div><o-time-picker theme="glass" value="18:40"></o-time-picker>');
    assert.equal(await page.locator('#t .ok-tp-knob').first().evaluate((n) => getComputedStyle(n).backgroundColor), 'rgb(13, 148, 136)');
  });
  console.log('o-time-picker browser tests passed (chromium).');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
