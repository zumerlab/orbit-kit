/**
 * <o-radar-chart> in a real browser (Chromium): geometry, hover, keyboard,
 * legend, events, transitions and the table fallback. Fails on page errors,
 * console errors and [orbit] warnings.
 * Run: ORBIT_DIR=../orbit node test/browser-radar-chart.mjs
 */
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
  const pathname = new URL(request.url, 'http://local').pathname;
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>o-radar-chart</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/o-radar-chart.js"></script>
      <body><button id="before">Before</button><main id="fixtures"></main><button id="after">After</button></body></html>`);
    return;
  }
  const directory = pathname.startsWith('/orbit/') ? path.join(orbit, 'dist') : pathname.startsWith('/kit/') ? path.join(root, 'src') : null;
  const filename = directory && path.resolve(directory, pathname.replace(/^\/(orbit|kit)\//, ''));
  if (!filename || !filename.startsWith(directory + path.sep)) { response.writeHead(404).end(); return; }
  try { response.setHeader('content-type', filename.endsWith('.css') ? 'text/css' : 'text/javascript'); response.end(readFileSync(filename)); } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
const errors = [];
const open = async (reducedMotion) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, reducedMotion });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().includes('[orbit]')) errors.push(`${m.type()}: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => Promise.all(['o-radar-chart'].map((t) => customElements.whenDefined(t))));
  return page;
};
const mount = async (page, html) => {
  await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html);
  await page.evaluate(() => Orbit.ready());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ ${title}`); };


const AXES = '["Speed","Power","Range","Cost","Comfort","Safety"]';
const TWO = `data='${AXES}' series='[{"label":"Alpha","values":[80,60,90,40,70,100]},{"label":"Beta","values":[50,90,40,80,60,30]}]'`;
/** Screen geometry: the chart center, the web radius, and polar positions of selectors. */
const polar = (page, id, selector) => page.locator(`#${id}`).evaluate((host, sel) => {
  const b = host.querySelector('.bigbang').getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  return [...host.querySelectorAll(sel)].map((n) => {
    const r = n.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
    return { d: Math.hypot(x, y) / (b.width / 2), a: (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360 };
  });
}, selector);
const near = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) <= tol;

try {
  const page = await open('reduce');

  await test('points, spokes, web and labels line up', async () => {
    await mount(page, `<o-radar-chart id="c" size="360px" max="100" ${TWO}></o-radar-chart>`);
    const pts = await polar(page, 'c', '.ok-rc-series[data-series="0"] .ok-rc-dot');
    const values = [80, 60, 90, 40, 70, 100];
    pts.forEach((p, j) => {
      assert.ok(near(p.a, j * 60, 1.5), `point ${j} on its axis (${p.a})`);
      assert.ok(Math.abs(p.d - values[j] / 100 * 7.8 / 12) < .015, `point ${j} at its value (${p.d})`);
    });
    // Each chord of the outer level: midpoint between two spokes, at the apothem.
    const sides = await polar(page, 'c', '.ok-rc-level.is-outer > .side');
    assert.equal(sides.length, 6);
    for (const s of sides) {
      assert.ok(sides.length && [30, 90, 150, 210, 270, 330].some((a) => near(s.a, a, 1.5)), `chord midpoint between spokes (${s.a})`);
      assert.ok(Math.abs(s.d - 7.8 / 12 * Math.cos(Math.PI / 6)) < .015, `chord at the apothem (${s.d})`);
    }
    const labels = await polar(page, 'c', '.ok-rc-label');
    labels.forEach((l, j) => {
      assert.ok(near(l.a, j * 60, 12), `label ${j} on its axis (${l.a})`);
      assert.ok(l.d > 7.8 / 12 + .02, `label ${j} outside the web (${l.d})`);
    });
    const box = await page.locator('#c .bigbang').boundingBox();
    const outside = await page.locator('#c').evaluate((host) => {
      const b = host.querySelector('.bigbang').getBoundingClientRect();
      return [...host.querySelectorAll('.ok-rc-label')].filter((l) => { const r = l.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1; }).length;
    });
    assert.equal(outside, 0, 'labels stay inside the universe');
    assert.ok(Math.abs(box.width - 360) < 1);
  });

  await test('pentagon and triangle webs line up too', async () => {
    await mount(page, `<o-radar-chart id="p" data='["A","B","C","D","E"]' series='[{"values":[1,1,1,1,1]}]'></o-radar-chart><o-radar-chart id="t" data='["A","B","C"]' series='[{"values":[1,1,1]}]'></o-radar-chart>`);
    for (const [id, n] of [['p', 5], ['t', 3]]) {
      const sides = await polar(page, id, '.ok-rc-level.is-outer > .side');
      for (const s of sides) assert.ok(Array.from({ length: n }, (_, k) => (k + .5) * 360 / n).some((a) => near(s.a, a, 1.5)), `${id}: chord between spokes (${s.a})`);
      const pts = await polar(page, id, '.ok-rc-dot');
      pts.forEach((p) => assert.ok(Math.abs(p.d - 7.8 / 12) < .015, `${id}: full value on the outer web`));
    }
  });

  await test('hover shows the value through the shared format', async () => {
    await mount(page, `<o-radar-chart id="c" locale="de-DE" decimals="1" ${TWO}></o-radar-chart>`);
    await page.locator('#c .ok-rc-point[data-series="1"][data-axis="1"] .ok-rc-dot').hover({ force: true });
    const tip = page.locator('#c .ok-rc-tip');
    assert.equal(await tip.isVisible(), true);
    assert.equal((await tip.textContent()).replace(/\s/g, ' '), 'Beta · Power90,0');
    assert.equal(await page.locator('#c .ok-rc-series[data-series="0"]').evaluate((g) => g.classList.contains('is-dim')), true, 'the other series steps back');
    await page.mouse.move(2, 2);
    assert.equal(await tip.isVisible(), false);
  });

  await test('keyboard: one tab stop, arrows walk axes and series, Enter selects', async () => {
    await mount(page, `<o-radar-chart id="c" label="Cars" ${TWO}></o-radar-chart>`);
    await page.evaluate(() => { window.got = []; document.querySelector('#c').addEventListener('select', (e) => window.got.push(e.detail)); });
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    const label = () => page.evaluate(() => document.activeElement.getAttribute('aria-label'));
    assert.equal(await label(), 'Alpha, Speed: 80');
    await page.keyboard.press('ArrowRight');
    assert.equal(await label(), 'Alpha, Power: 60');
    await page.keyboard.press('ArrowUp');
    assert.equal(await label(), 'Beta, Power: 90');
    await page.keyboard.press('End');
    assert.equal(await label(), 'Beta, Safety: 30');
    await page.keyboard.press('ArrowRight');
    assert.equal(await label(), 'Beta, Speed: 50', 'wraps around');
    assert.equal(await page.locator('#c .ok-rc-tip').isVisible(), true, 'focus shows the tooltip');
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.got), [{ axis: 'Speed', series: 'Beta', value: 50, axisIndex: 0, seriesIndex: 1 }]);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('ok-rc-key')), true, 'Tab leaves the points for the legend');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await label(), 'Beta, Speed: 50', 'the chart remembers the last point');
    await page.locator('#c .ok-rc-point[data-series="0"][data-axis="3"] .ok-rc-dot').click({ force: true });
    assert.equal((await page.evaluate(() => window.got))[1].axis, 'Cost');
  });

  await test('legend toggles a series, fires toggle and never hides the last one', async () => {
    await mount(page, `<o-radar-chart id="c" ${TWO}></o-radar-chart>`);
    await page.evaluate(() => { window.toggles = []; document.querySelector('#c').addEventListener('toggle', (e) => window.toggles.push(e.detail)); });
    const alpha = page.getByRole('button', { name: 'Alpha' });
    assert.equal(await alpha.getAttribute('aria-pressed'), 'true');
    await alpha.click();
    assert.equal(await alpha.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#c .ok-rc-series[data-series="0"]').evaluate((g) => getComputedStyle(g).visibility), 'hidden');
    await page.getByRole('button', { name: 'Beta' }).click();
    assert.equal(await page.getByRole('button', { name: 'Beta' }).getAttribute('aria-pressed'), 'true', 'the last visible series stays');
    assert.deepEqual(await page.evaluate(() => window.toggles), [{ series: 'Alpha', seriesIndex: 0, hidden: true }]);
    assert.deepEqual(await page.locator('#c').evaluate((n) => n.hiddenSeries), [0]);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Beta/, 'hidden points are skipped');
    await page.keyboard.press('ArrowUp');
    assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Beta/);
    await page.locator('#c').evaluate((n) => n.setAttribute('series', '[{"label":"Alpha","values":[1,2,3,4,5,6]},{"label":"Beta","values":[6,5,4,3,2,1]}]'));
    assert.equal(await alpha.getAttribute('aria-pressed'), 'false', 'new values keep the legend state');
  });

  await test('screen readers get a figure and a data table', async () => {
    await mount(page, `<o-radar-chart id="c" label="Cars" format="percent" ${TWO}></o-radar-chart>`);
    assert.equal(await page.getByRole('figure', { name: 'Cars: 6 axes, 2 series' }).count(), 1);
    const table = page.getByRole('table', { name: 'Cars' });
    assert.equal(await table.count(), 1);
    assert.deepEqual(await table.locator('thead th').allTextContents(), ['Axis', 'Alpha', 'Beta']);
    assert.deepEqual(await table.locator('tbody tr').first().locator('th, td').allTextContents(), ['Speed', '80%', '50%']);
    const box = await page.locator('#c .ok-sr').boundingBox();
    assert.ok(box.width <= 1 && box.height <= 1, 'the table is visually hidden');
  });

  await test('themes and color attributes', async () => {
    await mount(page, `<div class="ok-theme-light"><o-radar-chart id="a" ${TWO}></o-radar-chart></div><o-radar-chart id="b" data='${AXES}' series='[{"values":[1,2,3,4,5,6],"color":"rgb(1, 2, 3)"}]'></o-radar-chart>`);
    assert.equal(await page.locator('#a .ok-rc-series').first().evaluate((g) => getComputedStyle(g).color), 'rgb(13, 148, 136)');
    assert.equal(await page.locator('#b .ok-rc-series').first().evaluate((g) => getComputedStyle(g).color), 'rgb(1, 2, 3)');
  });

  await test('dev-orbit finds nothing to explain', async () => {
    await mount(page, `<div class="dev-orbit"><o-radar-chart ${TWO}></o-radar-chart><o-radar-chart grid="circle" ${TWO}></o-radar-chart><o-radar-chart data='["A","B"]' series='[{"values":[1,2]}]'></o-radar-chart></div>`);
    await page.waitForTimeout(100);
  });
  await page.close();

  const moving = await open('no-preference');
  await test('new data glides from the old shape to the new one', async () => {
    await mount(moving, `<o-radar-chart id="c" max="100" duration="500" data='${AXES}' series='[{"values":[20,20,20,20,20,20]}]'></o-radar-chart>`);
    await moving.waitForTimeout(650);
    const points = () => moving.locator('#c .ok-rc-area').getAttribute('points');
    const before = await points();
    await moving.locator('#c').evaluate((n) => n.setAttribute('series', '[{"values":[100,100,100,100,100,100]}]'));
    await moving.waitForTimeout(120);
    const mid = await points();
    await moving.waitForTimeout(600);
    const after = await points();
    const top = (p) => -Number(p.split(' ')[0].split(',')[1]);
    assert.ok(Math.abs(top(before) - 7.8 * .2) < .01 && Math.abs(top(after) - 7.8) < .01, `ends: ${top(before)} → ${top(after)}`);
    assert.ok(top(mid) > top(before) + .2 && top(mid) < top(after) - .2, `in between: ${top(mid)}`);
  });
  await moving.close();
  console.log('o-radar-chart browser tests passed (chromium).');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
