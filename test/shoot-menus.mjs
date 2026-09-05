/** Capture menu themes into .shots/ using local assets; errors fail the command.
 * ORBIT_DIR=../orbit npm run shots:menus (build the core first).
 */
import path from 'node:path';
import { createCaptureContext } from './capture-context.mjs';

const capture = await createCaptureContext({ width:700, height:700 });
try {
  const { page, outDir } = capture;
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
  capture.assertClean();
} finally { await capture.close(); }
