/** <o-sunburst> in a real browser (Chromium): arcs, hover, zoom, keyboard, events, format. */
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
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname); } catch { response.writeHead(400).end(); return; }
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Sunburst</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif;background:#0c0f13;color:#e8edf2}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/orbit-kit.js"></script>
      <body><button id="before">Before</button><main id="fixtures"></main></body></html>`);
    return;
  }
  const directory = pathname.startsWith('/orbit/') ? path.join(orbit, 'dist') : pathname.startsWith('/kit/') ? path.join(root, 'src') : null;
  if (!directory) { response.writeHead(404).end(); return; }
  const filename = path.resolve(directory, pathname.replace(/^\/(orbit|kit)\//, ''));
  if (!filename.startsWith(directory + path.sep)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('content-type', filename.endsWith('.css') ? 'text/css' : 'text/javascript');
    response.end(readFileSync(filename));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const DATA = [
  { label: 'Work', children: [{ label: 'Meetings', value: 12 }, { label: 'Focus', children: [{ label: 'Code', value: 14 }, { label: 'Docs', value: 5 }, { label: 'Review', value: 3 }] }, { label: 'Email', value: 8 }] },
  { label: 'Home', children: [{ label: 'Cooking', value: 8 }, { label: 'Chores', value: 9 }, { label: 'Family', value: 14 }] },
  { label: 'Rest', value: 20 }
];
const chart = (attrs = '') => `<o-sunburst id="sb" size="420px" label="Week" unit=" h" ${attrs} data='${JSON.stringify(DATA)}'></o-sunburst>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.text().includes('[orbit]')) errors.push(`${message.type()}: ${message.text()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => Promise.all(['o-arc', 'o-sunburst'].map((tag) => customElements.whenDefined(tag))));
  const settle = () => page.evaluate(() => Orbit.ready().then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
  const mount = async (html) => { await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html); await settle(); };
  const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ chromium: ${title}`); };
  const sb = page.locator('#sb');
  /** Angular span [start, end] of a node's arc, in degrees, from Orbit's own layout. */
  const span = (key) => page.locator(`#sb o-arc[data-key="${key}"]`).evaluate((arc) => { const a = arc.getAttributes(); return [a.stackOffset, a.stackOffset + a.arcAngle]; });
  /** The point in the middle of a node's arc, in page pixels. */
  const point = (key) => page.locator(`#sb o-arc[data-key="${key}"]`).evaluate((arc) => {
    const a = arc.getAttributes(), box = arc.closest('.bigbang').getBoundingClientRect();
    const ring = arc.parentElement.getBoundingClientRect();
    const r = ring.width / 2 - (a.arcHeight / 2) * (ring.width / 2) / a.orbitRadius;
    const angle = (a.stackOffset + a.arcAngle / 2) * Math.PI / 180;
    return { x: box.left + box.width / 2 + r * Math.sin(angle), y: box.top + box.height / 2 - r * Math.cos(angle) };
  });

  await test('renders one ring per depth with nested spans and fitting labels', async () => {
    await mount(chart());
    assert.equal(await page.locator('#sb .ok-sb-ring').count(), 3);
    const [work, focus, code] = [await span('0'), await span('0.1'), await span('0.1.0')];
    assert.ok(Math.abs(work[0]) < .01 && Math.abs(work[1] - 42 / 93 * 360) < .01, `Work spans ${work}`);
    assert.ok(focus[0] >= work[0] - .01 && focus[1] <= work[1] + .01, 'Focus inside Work');
    assert.ok(Math.abs(code[0] - focus[0]) < .01, 'Code starts where Focus starts');
    const rest = await span('2');
    assert.ok(Math.abs(rest[1] - 360) < .01, 'the ring is full');
    // Rest ends early: its spacer keeps the outer ring aligned and draws nothing.
    assert.equal(await page.locator('#sb .ok-sb-spacer').count(), 7);
    assert.equal(await sb.locator('o-arc[data-key="0"]').textContent(), 'Work');
    assert.equal(await sb.locator('o-arc[data-key="0.1.2"]').textContent(), '', 'too small for its label');
    assert.equal(await sb.locator('o-arc[data-key="1"]').evaluate((a) => a.hasAttribute('flip')), true, 'lower half reads upright');
    assert.match(await sb.locator('.ok-sb-value').textContent(), /^93 h$/);
    assert.equal(await sb.locator('.ok-sb-path').textContent(), 'Week');
    assert.equal(await sb.locator('o-arc[data-key="0.0"]').evaluate((a) => getComputedStyle(a).getPropertyValue('--o-fill')), 'color-mix(in oklab, #4fd1c5 83%, #fff)');
  });

  await test('hover lights a branch and shows its path, value and share', async () => {
    const p = await point('0.1');
    await page.mouse.move(p.x, p.y);
    await page.waitForFunction(() => document.querySelector('#sb').dataset.lit === '0.1');
    const lit = await sb.locator('o-arc.is-lit').evaluateAll((arcs) => arcs.map((a) => a.dataset.key));
    assert.deepEqual(lit.sort(), ['0', '0.1', '0.1.0', '0.1.1', '0.1.2']);
    assert.equal(await sb.locator('.ok-sb-path').textContent(), 'Work › Focus');
    assert.equal(await sb.locator('.ok-sb-value').textContent(), '22 h');
    assert.equal(await sb.locator('.ok-sb-share').textContent(), '24% of Week');
    assert.equal(await sb.locator('o-arc[data-key="1"]').evaluate((a) => getComputedStyle(a).opacity), '0.3');
    await page.mouse.move(2, 2);
    await page.waitForFunction(() => !('lit' in document.querySelector('#sb').dataset));
  });

  await test('click drills into a branch, the hub goes back up; select and navigate fire', async () => {
    await sb.evaluate((node) => { window.events = []; for (const type of ['select', 'navigate']) node.addEventListener(type, (e) => window.events.push([type, e.detail.labels ?? null, e.detail.path, e.detail.value ?? null])); });
    const p = await point('0');
    await page.mouse.click(p.x, p.y);
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), [0]);
    assert.deepEqual(await page.evaluate(() => window.events), [['select', ['Work'], [0], 42], ['navigate', null, [0], null]]);
    const focus = await span('0.1');
    assert.ok(Math.abs(focus[0] - 12 / 42 * 360) < .01 && Math.abs(focus[1] - 34 / 42 * 360) < .01, `Focus fills its share of Work: ${focus}`);
    assert.equal(await sb.locator('o-arc[data-key="1"]').count(), 0, 'slices outside the branch leave the ring');
    assert.equal(await sb.locator('.ok-sb-ring[data-depth="1"]').evaluate((r) => r.classList.contains('is-off')), true);
    assert.equal(await sb.locator('.ok-sb-ring[data-depth="2"]').evaluate((r) => r.style.getPropertyValue('--o-orbit-number')), '6.4', 'the children move in to the first ring');
    await page.mouse.move(2, 2);
    assert.equal(await sb.locator('.ok-sb-path').textContent(), '‹ Work');
    assert.equal(await sb.locator('.ok-sb-share').textContent(), '45% of Week');
    // A leaf selects without zooming.
    const leaf = await point('0.0');
    await page.mouse.click(leaf.x, leaf.y);
    assert.deepEqual(await sb.evaluate((node) => node.path), [0]);
    assert.equal(await sb.locator('o-arc[data-key="0.0"]').evaluate((a) => a.classList.contains('is-selected')), true);
    await sb.locator('.ok-sb-hub').click();
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), []);
    assert.equal(await sb.locator('.ok-sb-node').count(), 3 + 6 + 3, 'everything is back');
    assert.deepEqual((await page.evaluate(() => window.events)).map((e) => e[0]), ['select', 'navigate', 'select', 'navigate']);
  });

  await test('keyboard: arrows move through the tree, Enter drills, Escape goes up', async () => {
    await mount(chart());
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    const active = () => sb.evaluate((node) => document.getElementById(node.getAttribute('aria-activedescendant'))?.getAttribute('aria-label'));
    assert.equal(await sb.getAttribute('role'), 'tree');
    assert.equal(await sb.getAttribute('aria-label'), 'Week');
    assert.equal(await active(), 'Work: 42 h, 45% of Week');
    await page.keyboard.press('ArrowRight');
    assert.equal(await active(), 'Home: 31 h, 33% of Week');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await active(), 'Rest: 20 h, 22% of Week', 'wraps around');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('End');
    assert.equal(await active(), 'Email: 8 h, 19% of Work');
    assert.equal(await sb.locator('o-arc.is-focus').getAttribute('data-key'), '0.2');
    assert.equal(await sb.locator('.ok-sb-path').textContent(), 'Work › Email', 'the hub follows keyboard focus');
    await page.keyboard.press('ArrowDown');
    assert.equal(await active(), 'Work: 42 h, 45% of Week');
    await page.keyboard.press('Enter');
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), [0]);
    assert.equal(await active(), 'Meetings: 12 h, 29% of Work', 'focus moves to the first child');
    await page.keyboard.press('ArrowDown');
    assert.equal(await active(), 'Work: 42 h, 45% of Week', 'Down from the first ring reaches the middle');
    assert.equal(await sb.locator('.ok-sb-hub').evaluate((hub) => hub.classList.contains('is-focus')), true);
    await page.keyboard.press('ArrowDown');
    assert.equal(await active(), 'Work: 42 h, 45% of Week', 'and stops there');
    await page.keyboard.press('ArrowUp');
    assert.equal(await active(), 'Meetings: 12 h, 29% of Work');
    await page.keyboard.press('Escape');
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), []);
    assert.equal(await active(), 'Work: 42 h, 45% of Week', 'focus returns to the branch');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sb');
  });

  await test('Up past the visible rings zooms in; the tree fallback mirrors the data', async () => {
    await mount(chart('levels="2"'));
    assert.equal(await sb.locator('.ok-sb-ring:not(.is-off)').count(), 2);
    await sb.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), [0, 1]);
    assert.equal(await sb.evaluate((node) => document.getElementById(node.getAttribute('aria-activedescendant')).getAttribute('aria-label')), 'Code: 14 h, 64% of Focus');
    const tree = await sb.locator('[role="treeitem"]').evaluateAll((items) => items.map((li) => [li.getAttribute('aria-level'), li.getAttribute('aria-posinset'), li.getAttribute('aria-setsize'), li.hasAttribute('aria-expanded')]));
    assert.equal(tree.length, 12);
    assert.deepEqual(tree[0], ['1', '1', '3', true]);
    assert.deepEqual(tree[3], ['3', '1', '3', false]);
    assert.equal(await sb.locator('.ok-sb-tree').evaluate((ul) => ul.getBoundingClientRect().width), 1, 'visually hidden, still in the accessibility tree');
    assert.equal(await sb.locator('.bigbang').getAttribute('aria-hidden'), 'true');
  });

  await test('the zoom animates between layouts without [orbit] warnings', async () => {
    const motion = await browser.newPage({ viewport: { width: 900, height: 700 } });
    motion.on('console', (message) => { if (message.type() === 'error' || message.text().includes('[orbit]')) errors.push(message.text()); });
    motion.on('pageerror', (error) => errors.push(error.message));
    await motion.goto(`http://127.0.0.1:${server.address().port}/`);
    await motion.locator('#fixtures').evaluate((node, html) => { node.innerHTML = html; }, chart());
    await motion.evaluate(() => customElements.whenDefined('o-sunburst').then(() => Orbit.ready()));
    const samples = await motion.evaluate(async () => {
      const node = document.querySelector('#sb'), seen = [];
      node.zoom([0]);
      const moving = node.classList.contains('is-moving');
      for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 70)); seen.push(Number(node.querySelector('o-arc[data-key="0.1"]').getAttribute('value'))); }
      await new Promise((r) => setTimeout(r, 600));
      return { moving, seen, after: node.classList.contains('is-moving'), label: node.querySelector('o-arc[data-key="0.1"]').textContent };
    });
    assert.ok(samples.moving, 'labels hide while moving');
    assert.ok(samples.seen.some((v) => v > 22 / 93 * 100 + 1 && v < 22 / 42 * 100 - 1), `values pass through in-between shares: ${samples.seen}`);
    assert.equal(samples.after, false);
    assert.equal(samples.label, 'Focus');
    await motion.close();
  });

  await test('format, locale and formatter reach the hub and the tree', async () => {
    await mount(chart('format="percent"').replace(' unit=" h"', ''));
    assert.equal(await sb.locator('.ok-sb-value').textContent(), '100%');
    assert.equal(await sb.locator('[data-key="0"][role="treeitem"]').getAttribute('aria-label'), 'Work: 45%, 45% of Week');
    await mount(`<div lang="de"><o-sunburst id="sb" currency="EUR" data='[{"label":"A","value":1234.5},{"label":"B","value":200}]'></o-sunburst></div>`);
    assert.equal((await sb.locator('.ok-sb-value').textContent()).replace(/\s/g, ' '), '1.434,50 €');
    await sb.evaluate((node) => { node.formatter = (value, { kind }) => `${Math.round(value)} pts`; });
    assert.equal(await sb.locator('.ok-sb-value').textContent(), '1435 pts');
    assert.equal((await sb.locator('[data-key="1"][role="treeitem"]').getAttribute('aria-label')).replace(/\s/g, ' '), 'B: 200 pts, 14 % of the total');
  });

  await test('data updates keep the zoom; themes and custom colors apply', async () => {
    await mount(chart('theme="light"'));
    await sb.evaluate((node) => node.zoom([1]));
    await settle();
    await sb.evaluate((node, data) => { node.data = data; }, [DATA[0], { ...DATA[1], color: 'rgb(255, 0, 0)' }, DATA[2]]);
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), [1]);
    assert.equal(await sb.locator('o-arc[data-key="1.0"]').evaluate((a) => getComputedStyle(a).getPropertyValue('--o-fill')), 'color-mix(in oklab, rgb(255, 0, 0) 83%, #fff)');
    assert.equal(await sb.locator('o-arc[data-key="1.0"]').textContent(), 'Cooking');
    await sb.evaluate((node) => node.reset());
    await settle();
    assert.deepEqual(await sb.evaluate((node) => node.path), []);
    await sb.evaluate((node) => { node.data = []; });
    await settle();
    assert.equal(await sb.locator('o-arc').count(), 0);
    assert.equal(await sb.evaluate((node) => node.tabIndex), -1, 'nothing to focus in an empty chart');
  });

  console.log('Sunburst browser suite passed in chromium.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
