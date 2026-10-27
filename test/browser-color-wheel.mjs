/** <o-color-wheel> in a real browser (Chromium): rendering, pointer, keyboard, swatches, forms, events. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orbit = path.resolve(process.env.ORBIT_DIR || (existsSync(path.join(root, '../orbit/dist/orbit.js')) ? path.join(root, '../orbit') : path.join(root, 'node_modules/@zumer/orbit')));
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>o-color-wheel</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/o-color-wheel.js"></script>
      <body><button id="before">Before</button><main id="fixtures"></main></body></html>`);
    return;
  }
  const directory = pathname.startsWith('/orbit/') ? path.join(orbit, 'dist') : pathname.startsWith('/kit/') ? path.join(root, 'src') : null;
  const filename = directory && path.resolve(directory, pathname.replace(/^\/(orbit|kit)\//, ''));
  if (!filename || !filename.startsWith(directory + path.sep)) { response.writeHead(404).end(); return; }
  try { response.setHeader('content-type', filename.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(readFileSync(filename)); } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.text().includes('[orbit]')) errors.push(`${message.type()}: ${message.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => customElements.whenDefined('o-color-wheel'));
  const mount = async (html) => {
    await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html);
    await page.evaluate(() => Orbit.ready());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ ${title}`); };
  const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

  await test('renders the ring, the square and the handles where the color is', async () => {
    await mount('<o-color-wheel id="c" size="240px" value="#00ff00"></o-color-wheel>');
    const box = await page.locator('#c > .bigbang').boundingBox();
    const thumb = center(await page.locator('#c .ok-cw-hue-thumb').boundingBox());
    const c = center(box);
    const angle = (Math.atan2(thumb.x - c.x, c.y - thumb.y) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(angle - 120) < 1.5, `hue handle at 120° (${angle})`);
    const area = await page.locator('#c .ok-cw-area').boundingBox();
    const dot = center(await page.locator('#c .ok-cw-area-thumb').boundingBox());
    assert.ok(Math.abs(dot.x - (area.x + area.width)) < 1.5 && Math.abs(dot.y - area.y) < 1.5, 'full saturation and brightness: top right');
    assert.ok(Math.abs(center(area).x - c.x) < 1 && Math.abs(center(area).y - c.y) < 1, 'square centered');
    assert.equal(await page.locator('#c .ok-cw-hue-thumb').getAttribute('aria-valuetext'), '120 degrees, vivid green');
    assert.equal(await page.locator('#c').getAttribute('role'), 'group');
    await mount('<o-color-wheel id="n" value="rebeccapurple"></o-color-wheel>');
    assert.equal(await page.locator('#n').evaluate((el) => el.value), '#663399', 'named colors in a browser');
  });

  await test('dragging the ring sets the hue, dragging the square sets saturation and brightness', async () => {
    await mount('<o-color-wheel id="c" size="240px" value="#ff0000"></o-color-wheel>');
    await page.evaluate(() => { window.log = []; for (const t of ['input', 'change']) document.addEventListener(t, (e) => window.log.push(t)); });
    const box = await page.locator('#c > .bigbang').boundingBox();
    const c = center(box), r = box.width / 2 * 10.65 / 12;
    await page.mouse.move(c.x, c.y - r);
    await page.mouse.down();
    await page.mouse.move(c.x + r, c.y, { steps: 4 });
    await page.mouse.move(c.x, c.y + r, { steps: 4 });
    await page.mouse.up();
    assert.equal(await page.locator('#c').evaluate((el) => el.value), '#00ffff', 'bottom of the ring is cyan');
    let log = await page.evaluate(() => window.log);
    assert.ok(log.filter((t) => t === 'input').length >= 2 && log.at(-1) === 'change' && log.filter((t) => t === 'change').length === 1);
    const area = await page.locator('#c .ok-cw-area').boundingBox();
    await page.mouse.click(area.x + area.width * .5, area.y + area.height * .75);
    const hsv = await page.locator('#c').evaluate((el) => el._hsv);
    assert.ok(Math.abs(hsv.s - .5) < .02 && Math.abs(hsv.v - .25) < .02 && Math.round(hsv.h) === 180, JSON.stringify(hsv));
    assert.equal(await page.evaluate(() => document.activeElement.dataset.part), 'area');
  });

  await test('keyboard: arrows move hue, saturation and brightness; Shift moves ten', async () => {
    await mount('<o-color-wheel id="c" value="#ff0000"></o-color-wheel>');
    await page.evaluate(() => { window.keys = []; for (const t of ['input', 'change']) document.addEventListener(t, (e) => window.keys.push([t, e.detail.value])); });
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Hue');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-valuenow')), '11');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#c').evaluate((el) => el.value), '#ff0000');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-valuenow')), '359', 'hue wraps');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Saturation and brightness');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ArrowDown');
    const text = await page.evaluate(() => document.activeElement.getAttribute('aria-valuetext'));
    assert.match(text, /^Saturation 90%, brightness 99%, .+, #[0-9a-f]{6}$/);
    const log = await page.evaluate(() => window.keys);
    assert.ok(log.length >= 10 && log.every(([, v]) => /^#[0-9a-f]{6}$/.test(v)), JSON.stringify(log));
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#c').evaluate((el) => el.contains(document.activeElement)), false, 'two tab stops');
  });

  await test('swatches: a ring of satellites, one tab stop, arrows, pick with Enter or a click', async () => {
    await mount(`<o-color-wheel id="c" size="280px" value="#ffb547" swatches='["#4fd1c5","#ffb547",{"color":"#ff7a6b","label":"Coral"},"#a78bfa"]'></o-color-wheel>`);
    assert.equal(await page.locator('#c .ok-cw-swatch').count(), 4);
    assert.equal(await page.locator('#c .ok-cw-swatch[aria-pressed="true"]').getAttribute('data-hex'), '#ffb547');
    const tops = await page.locator('#c .ok-cw-swatch').evaluateAll((list) => list.map((b) => Math.round(b.getBoundingClientRect().top)));
    assert.ok(tops[0] < tops[1] && tops[2] > tops[1], 'spread around the ring from the top');
    await page.evaluate(() => { window.picks = []; document.addEventListener('change', (e) => window.picks.push(e.detail.value)); });
    await page.locator('#c .ok-cw-area-thumb').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'teal, #4fd1c5');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Coral, #ff7a6b');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#c').evaluate((el) => el.value), '#ff7a6b');
    await page.locator('#c .ok-cw-swatch').nth(3).click();
    assert.deepEqual(await page.evaluate(() => window.picks), ['#ff7a6b', '#a78bfa']);
    assert.equal(await page.locator('#c .ok-cw-swatch[aria-pressed="true"]').getAttribute('data-hex'), '#a78bfa');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.hex), '#a78bfa', 'focus returns to the last swatch');
  });

  await test('forms: submits in its format, resets, follows a disabled fieldset; value from code fires nothing', async () => {
    await mount(`<form id="form"><fieldset id="set">
      <o-color-wheel name="hex" value="#1e90ff"></o-color-wheel>
      <o-color-wheel name="hsl" format="hsl" value="#1e90ff"></o-color-wheel>
      <o-color-wheel id="rgb" name="rgb" format="rgb" value="#1e90ff"></o-color-wheel>
    </fieldset></form>`);
    const data = () => page.locator('#form').evaluate((form) => Object.fromEntries(new FormData(form)));
    assert.deepEqual(await data(), { hex: '#1e90ff', hsl: 'hsl(210, 100%, 56%)', rgb: 'rgb(30, 144, 255)' });
    await page.evaluate(() => { window.formLog = []; document.addEventListener('input', () => window.formLog.push(1)); });
    await page.locator('#rgb').evaluate((el) => { el.value = 'hsl(0, 100%, 50%)'; });
    assert.equal(await page.evaluate(() => window.formLog.length), 0);
    assert.equal((await data()).rgb, 'rgb(255, 0, 0)');
    await page.locator('#rgb .ok-cw-hue-thumb').focus();
    await page.keyboard.press('PageUp');
    assert.equal((await data()).rgb, 'rgb(255, 42, 0)');
    await page.locator('#form').evaluate((form) => form.reset());
    assert.equal((await data()).rgb, 'rgb(30, 144, 255)', 'reset goes back to the value attribute, like a native input');
    await page.locator('#set').evaluate((set) => { set.disabled = true; });
    assert.deepEqual(await data(), {});
    assert.deepEqual(await page.locator('#rgb').evaluate((el) => [el.matches(':disabled'), el.querySelector('.ok-cw-hue-thumb').tabIndex, el.getAttribute('aria-disabled')]), [true, -1, 'true']);
    await page.locator('#set').evaluate((set) => { set.disabled = false; });
    assert.equal(await page.locator('#rgb .ok-cw-hue-thumb').evaluate((n) => n.tabIndex), 0);
  });

  await test('disabled ignores the pointer; no [orbit] warnings at small and large sizes', async () => {
    await mount('<o-color-wheel id="c" disabled value="#ff0000"></o-color-wheel><o-color-wheel size="120px" swatches=\'["red","blue"]\'></o-color-wheel><o-color-wheel size="420px" thickness="2.6"></o-color-wheel>');
    const area = await page.locator('#c .ok-cw-area').boundingBox();
    await page.mouse.click(area.x + 5, area.y + area.height - 5);
    assert.equal(await page.locator('#c').evaluate((el) => el.value), '#ff0000');
    await page.waitForTimeout(150);
  });
  await page.close();
  console.log('o-color-wheel browser tests passed.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
