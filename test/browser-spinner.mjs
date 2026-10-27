/**
 * <o-spinner> in a real browser (Chromium): geometry, motion, reduced motion,
 * determinate progress and aria. Fails on page errors, console errors and
 * [orbit] warnings. Run: ORBIT_DIR=../orbit node test/browser-spinner.mjs
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
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>o-spinner</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/o-spinner.js"></script>
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
  await page.evaluate(() => Promise.all(['o-arc', 'o-spinner'].map((t) => customElements.whenDefined(t))));
  return page;
};
const mount = async (page, html) => {
  await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html);
  await page.evaluate(() => Orbit.ready());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ ${title}`); };

try {
  const page = await open('no-preference');

  await test('every variant draws inside its box, at any size', async () => {
    await mount(page, `<o-spinner id="ring" size="96px"></o-spinner><o-spinner id="dots" variant="dots" size="96px"></o-spinner>
      <o-spinner id="seg" variant="segments" size="96px"></o-spinner><o-spinner id="orb" variant="orbit" size="96px"></o-spinner>
      <o-spinner id="tiny" size="20px"></o-spinner>`);
    for (const id of ['ring', 'dots', 'seg', 'orb']) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(Math.abs(box.width - 96) < 1 && Math.abs(box.height - 96) < 1, `${id} is 96px square (${box.width}×${box.height})`);
    }
    const tiny = await page.locator('#tiny').boundingBox();
    assert.ok(Math.abs(tiny.width - 20) < 1 && Math.abs(tiny.height - 20) < 1, 'size 20px');
    const d = await page.locator('#ring .ok-value').first().evaluate((n) => n.shadowRoot.querySelector('#orbitShape')?.getAttribute('d') || '');
    assert.ok(d.length > 10, 'ring arc has an SVG path');
    // Dots sit on a circle around the center.
    const dots = await page.locator('#dots').evaluate((host) => {
      const c = host.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      return [...host.querySelectorAll('.ok-spin-dot')].map((d) => { const r = d.closest('.satellite').getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy); });
    });
    assert.equal(dots.length, 8);
    assert.ok(Math.max(...dots) - Math.min(...dots) < 1 && dots[0] > 30, `dots on one circle: ${dots.map(Math.round)}`);
    const angles = await page.locator('#seg').evaluate((host) => [...host.querySelectorAll('.ok-spin-tick')].map((t) => getComputedStyle(t).transform));
    assert.equal(new Set(angles).size, 12, 'twelve ticks, each at its own angle');
  });

  await test('it moves with CSS animations; paused stops them', async () => {
    await mount(page, '<o-spinner id="s"></o-spinner><o-spinner id="d" variant="dots"></o-spinner>');
    const names = await page.locator('#s').evaluate((host) => [...host.querySelectorAll('.ok-spin-rotor')].map((n) => getComputedStyle(n).animationName));
    assert.deepEqual(names, ['ok-spin-turn', 'ok-spin-turn']);
    const timing = await page.locator('#s .ok-spin-rotor.is-lead').evaluate((n) => getComputedStyle(n).animationTimingFunction);
    assert.match(timing, /cubic-bezier/, 'the lead arc eases, so the pair stretches');
    await page.locator('#s').evaluate((n) => n.setAttribute('speed', '2'));
    assert.equal(await page.locator('#s .ok-spin-rotor').first().evaluate((n) => getComputedStyle(n).animationDuration), '2.2s', 'speed scales the cycle');
    await page.locator('#d').evaluate((n) => n.setAttribute('paused', ''));
    assert.equal(await page.locator('#d .ok-spin-dot').first().evaluate((n) => getComputedStyle(n).animationPlayState), 'paused');
  });

  await test('progressbar semantics, not a tab stop', async () => {
    await mount(page, '<o-spinner id="s" label="Saving"></o-spinner>');
    const s = page.getByRole('progressbar', { name: 'Saving' });
    assert.equal(await s.getAttribute('aria-busy'), 'true');
    assert.equal(await s.getAttribute('aria-valuenow'), null);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'after');
  });

  await test('progress: indeterminate until value is set, then glides to it', async () => {
    await mount(page, '<o-spinner id="p" variant="progress" readout size="120px"></o-spinner>');
    assert.equal(await page.locator('#p .ok-spin-rotor').count(), 2, 'spins without a value');
    await page.locator('#p').evaluate((n) => { n.value = 20; });
    assert.equal(await page.locator('#p .ok-spin-rotor').count(), 0);
    assert.equal(await page.locator('#p').getAttribute('aria-valuenow'), '20');
    assert.equal(await page.locator('#p .ok-spin-readout').textContent(), '20%');
    await page.locator('#p').evaluate((n) => n.setAttribute('value', '80'));
    const mid = Number(await page.locator('#p .ok-spin-fill').evaluate((n) => new Promise((r) => setTimeout(() => r(n.getAttribute('value')), 90))));
    assert.ok(mid > 20 && mid < 80, `in between while gliding (${mid})`);
    await page.waitForFunction(() => document.querySelector('#p .ok-spin-fill').getAttribute('value') === '80.00');
    assert.equal(await page.locator('#p').getAttribute('aria-valuetext'), '80%');
    await page.locator('#p').evaluate((n) => { n.value = 100; });
    assert.equal(await page.locator('#p').getAttribute('aria-busy'), 'false');
    await page.locator('#p').evaluate((n) => { n.value = null; });
    assert.equal(await page.locator('#p .ok-spin-rotor').count(), 2, 'back to indeterminate');
  });

  await test('format and locale reach the readout', async () => {
    await mount(page, '<o-spinner id="p" variant="progress" readout value="0.42" max="1" format="percent" decimals="1" locale="de-DE"></o-spinner>');
    assert.equal((await page.locator('#p .ok-spin-readout').textContent()).replace(/\s/g, ' '), '42,0 %');
  });

  await test('themes and color attributes', async () => {
    await mount(page, '<div class="ok-theme-light"><o-spinner id="a"></o-spinner></div><o-spinner id="b" theme="dark" color="rgb(1, 2, 3)"></o-spinner><o-spinner id="c"></o-spinner>');
    const fill = (id) => page.locator(`#${id} .ok-value`).first().evaluate((n) => getComputedStyle(n).getPropertyValue('--o-fill').trim());
    assert.equal(await fill('a'), '#0d9488');
    assert.equal(await fill('b'), 'rgb(1, 2, 3)');
    assert.equal(await fill('c'), '#4fd1c5');
  });
  await page.close();

  const calm = await open('reduce');
  await test('reduced motion: nothing turns, the drawing breathes', async () => {
    await mount(calm, '<o-spinner id="r"></o-spinner><o-spinner id="d" variant="dots"></o-spinner><o-spinner id="o" variant="orbit"></o-spinner><o-spinner id="p" variant="progress" value="10"></o-spinner>');
    assert.equal(await calm.locator('#r .ok-spin-rotor').first().evaluate((n) => getComputedStyle(n).animationName), 'ok-spin-breathe');
    assert.equal(await calm.locator('#r .ok-spin-rotor.is-lead').evaluate((n) => getComputedStyle(n).visibility), 'hidden');
    assert.equal(await calm.locator('#d .ok-spin-dot').first().evaluate((n) => getComputedStyle(n).animationName), 'ok-spin-breathe');
    assert.equal(await calm.locator('#o .ok-spin-path.is-outer').evaluate((n) => getComputedStyle(n).animationName), 'none');
    assert.equal(await calm.locator('#o .ok-spin-planet').evaluate((n) => getComputedStyle(n).animationName), 'ok-spin-breathe');
    await calm.locator('#p').evaluate((n) => n.setAttribute('value', '70'));
    assert.equal(await calm.locator('#p .ok-spin-fill').getAttribute('value'), '70.00', 'no glide');
  });

  await test('dev-orbit finds nothing to explain', async () => {
    // Inside .dev-orbit, Orbit checks every ring and explains misuse in the console.
    await mount(calm, '<div class="dev-orbit"><o-spinner></o-spinner><o-spinner variant="dots"></o-spinner><o-spinner variant="segments"></o-spinner><o-spinner variant="orbit"></o-spinner><o-spinner variant="progress" value="5" readout></o-spinner></div>');
    await calm.waitForTimeout(100);
  });
  console.log('o-spinner browser tests passed (chromium).');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
