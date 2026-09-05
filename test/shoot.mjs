/** Capture the gallery and its cells into .shots/ using local kit/core assets.
 * ORBIT_DIR=../orbit npm run shots (build the core first).
 * Without ORBIT_DIR, use node_modules/@zumer/orbit. Any asset/browser error fails.
 */
import path from 'node:path';
import { createCaptureContext } from './capture-context.mjs';

const capture = await createCaptureContext({ width:1400, height:1000 });
try {
  const { page, outDir } = capture;
  // Allow the local components and animations to settle before capturing.
  await page.waitForTimeout(1500);

  // Full page.
  await page.screenshot({ path: path.join(outDir, '00-full.png'), fullPage: true });

  // Clean per-component shots via element.screenshot (robust, no clip math).
  const cells = await page.$$('.cell');
  if (!cells.length) throw new Error('The gallery has no component cells to capture');
  let n = 0;
  for (const cell of cells) {
    const name = (await cell.evaluate((c) => (c.querySelector('o-gauge,o-donut,o-rings,o-meter,o-knob,o-menu,o-compass,o-instrument,o-clock,o-radar')?.tagName || 'cell')
      + '-' + (c.querySelector('code')?.textContent || c.querySelector('small')?.textContent || '').replace(/[^a-z0-9]+/gi, '-').slice(0, 22))).toLowerCase();
    try { await cell.screenshot({ path: path.join(outDir, `cell-${String(++n).padStart(2, '0')}-${name}.png`) }); }
    catch (e) { capture.errors.push(`Screenshot ${name}: ${e.message}`); }
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

  capture.assertClean();
  console.log(`shot ${n} cells + concentric menu + full page -> .shots/`);
  console.log('no console errors');
} finally { await capture.close(); }
