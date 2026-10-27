/** <o-wheel> in a real browser (Chromium): rendering, spins, keyboard, events, reduced motion. */
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
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>o-wheel</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/o-wheel.js"></script>
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
  for (const motion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: motion });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.text().includes('[orbit]')) errors.push(`${message.type()}: ${message.text()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => customElements.whenDefined('o-wheel'));
    const mount = async (html) => {
      await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html);
      await page.evaluate(() => Orbit.ready());
    };
    const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ ${motion}: ${title}`); };
    // The item under the pointer, from the rotor's real rotation.
    const under = (sel) => page.locator(sel).evaluate((el) => {
      const cfg = el.readConfig();
      const turn = el.querySelector('.ok-wheel-rotor').getAnimations().length ? NaN : parseFloat(getComputedStyle(el.querySelector('.ok-wheel-rotor')).rotate);
      const at = ((-turn % 360) + 360) % 360;
      return cfg.bounds.findIndex((b) => at >= b.start && at < b.end);
    });
    const items = '["Pizza","Tacos","Sushi","Ramen","Curry","Burgers","Salad","Pho"]';

    await test('renders segments, labels, pegs, pointer and button without [orbit] warnings', async () => {
      await mount(`<o-wheel id="w" items='${items}'></o-wheel><o-wheel labels="along" items='["A","B","A very long label that cannot fit"]'></o-wheel><o-wheel controls="false" pegs="false" items='[{"label":"x","weight":2},"y"]'></o-wheel>`);
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#w .ok-wheel-seg').count(), 8);
      assert.equal(await page.locator('#w .ok-wheel-label').count(), 8);
      assert.equal(await page.locator('#w .ok-wheel-peg').count(), 8);
      assert.equal(await under('#w'), 0, 'the first item starts under the pointer');
      const box = await page.locator('#w > .bigbang').boundingBox();
      const pointer = await page.locator('#w .ok-wheel-pointer').boundingBox();
      assert.ok(Math.abs(pointer.x + pointer.width / 2 - (box.x + box.width / 2)) < 1.5, 'pointer centered');
      assert.ok(pointer.y >= box.y - 1 && pointer.y < box.y + box.height * .1, 'pointer at the top, inside the box');
      assert.equal(await page.locator('#w').getByRole('button', { name: 'Spin', exact: true }).count(), 1);
      // Labels on the left half turn over so they read upright.
      assert.equal(await page.locator('#w .ok-wheel-label.is-flipped').count(), 3);
      const along = await page.locator('o-wheel[labels="along"] .ok-wheel-text').allTextContents();
      assert.ok(along[2].endsWith('…'), 'long text along an arc is shortened');
    });

    await test('spin(index) lands on that item, fires spin, tick and result, and announces it', async () => {
      await mount(`<o-wheel id="w" duration="0.8" turns="2" items='${items}'></o-wheel>`);
      await page.evaluate(() => { window.log = []; for (const t of ['spin', 'tick', 'result']) document.addEventListener(t, (e) => window.log.push([t, e.detail.index ?? null])); });
      const result = await page.locator('#w').evaluate((el) => el.spin(5).then((r) => ({ index: r.index, label: r.label })));
      assert.deepEqual(result, { index: 5, label: 'Burgers' });
      assert.equal(await under('#w'), 5);
      const log = await page.evaluate(() => window.log);
      assert.equal(log[0][0], 'spin');
      assert.deepEqual(log.at(-1), ['result', 5]);
      const ticks = log.filter(([t]) => t === 'tick').length;
      if (motion === 'reduce') assert.ok(ticks >= 1 && ticks <= 8, `a short spin (${ticks} ticks)`);
      else assert.ok(ticks >= 16, `at least two turns of ticks (${ticks})`);
      assert.equal(await page.locator('#w .ok-sr').textContent(), 'Result: Burgers');
      assert.equal(await page.locator('#w .ok-wheel-seg.is-winner').getAttribute('data-index'), '5');
      assert.equal(await page.locator('#w').evaluate((el) => el.result.label), 'Burgers');
    });

    await test('random spins pick an item and the pointer agrees; spinning returns the same promise', async () => {
      await mount(`<o-wheel id="w" duration="0.3" turns="1" items='[{"label":"a","weight":5},"b",{"label":"c","weight":0.5}]'></o-wheel>`);
      for (let i = 0; i < 4; i++) {
        const [same, index] = await page.locator('#w').evaluate(async (el) => { const p = el.spin(); const q = el.spin(); const r = await p; return [p === q, r.index]; });
        assert.ok(same);
        assert.equal(await under('#w'), index);
      }
      if (motion === 'reduce') {
        const ms = await page.locator('#w').evaluate(async (el) => { el.setAttribute('duration', '5'); const t = performance.now(); await el.spin(); return performance.now() - t; });
        assert.ok(ms < 1500, `reduced motion keeps the spin short (${Math.round(ms)}ms)`);
      }
    });

    await test('keyboard: Enter and Space on the button; the wheel itself without controls', async () => {
      await mount(`<o-wheel id="w" duration="0.3" items='${items}'></o-wheel><o-wheel id="bare" controls="false" duration="0.3" items='["x","y"]'></o-wheel>`);
      await page.evaluate(() => { window.count = 0; document.addEventListener('result', () => window.count++); });
      await page.locator('#before').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'ok-wheel-spin ok-surface');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.count === 1);
      assert.equal(await page.locator('#w .ok-wheel-spin').getAttribute('aria-disabled'), 'false');
      await page.keyboard.press(' ');
      await page.waitForFunction(() => window.count === 2);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'bare');
      assert.equal(await page.locator('#bare').getAttribute('role'), 'button');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.count === 3);
    });

    await test('pointer: the face and the button spin, the corners do not; disabled does nothing', async () => {
      await mount(`<o-wheel id="w" duration="0.3" items='${items}'></o-wheel>`);
      await page.evaluate(() => { window.spins = 0; document.addEventListener('spin', () => window.spins++); window.spins = 0; });
      const box = await page.locator('#w > .bigbang').boundingBox();
      await page.mouse.click(box.x + 3, box.y + 3);
      assert.equal(await page.evaluate(() => window.spins), 0);
      await page.mouse.click(box.x + box.width * .5, box.y + box.height * .2);
      assert.equal(await page.evaluate(() => window.spins), 1);
      await page.locator('#w').evaluate((el) => el.spin());
      await page.locator('#w .ok-wheel-spin').click();
      assert.equal(await page.evaluate(() => window.spins), 2);
      await page.locator('#w').evaluate((el) => el.spin());
      await page.locator('#w').evaluate((el) => el.setAttribute('disabled', ''));
      assert.equal(await page.locator('#w').evaluate((el) => el.spin()), null);
      assert.equal(await page.locator('#w .ok-wheel-spin').getAttribute('aria-disabled'), 'true');
    });

    await test('remove-winner takes the winner out before the next spin', async () => {
      await mount(`<o-wheel id="w" remove-winner duration="0.3" items='["a","b","c"]'></o-wheel>`);
      const first = await page.locator('#w').evaluate((el) => el.spin(1).then((r) => r.label));
      assert.equal(first, 'b');
      assert.equal(await page.locator('#w .ok-wheel-seg').count(), 3, 'the winner stays on show until the next spin');
      const second = await page.locator('#w').evaluate((el) => el.spin().then((r) => r.label));
      assert.notEqual(second, 'b');
      assert.deepEqual(await page.locator('#w').evaluate((el) => el.items), ['a', 'c']);
      await page.evaluate(() => Orbit.ready());
    });

    if (motion === 'no-preference') {
      await test('the pointer flicks as pegs pass', async () => {
        await mount(`<o-wheel id="w" duration="1.2" items='${items}'></o-wheel>`);
        const flicks = await page.locator('#w').evaluate(async (el) => {
          const pointer = el.querySelector('.ok-wheel-pointer');
          let seen = 0;
          const animate = pointer.animate.bind(pointer);
          pointer.animate = (...args) => { seen++; return animate(...args); };
          await el.spin();
          return seen;
        });
        assert.ok(flicks >= 8, `the pointer flicked ${flicks} times`);
        const rotate = await page.locator('#w .ok-wheel-rotor').evaluate((n) => [n.getAnimations().length, n.style.rotate]);
        assert.equal(rotate[0], 0, 'no animation left on the rotor');
        assert.match(rotate[1], /deg$/);
      });
    }
    await page.close();
  }
  console.log('o-wheel browser tests passed.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
