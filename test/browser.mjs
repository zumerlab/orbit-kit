/** Real DOM/interaction regression suite; no CDN or remote services. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Orbit 2: ORBIT_DIR, else a sibling ../orbit checkout, else the installed peer.
const orbit = path.resolve(process.env.ORBIT_DIR || (existsSync(path.join(root, '../orbit/dist/orbit.js')) ? path.join(root, '../orbit') : path.join(root, 'node_modules/@zumer/orbit')));
for (const file of ['orbit.js', 'orbit.css']) assert.ok(existsSync(path.join(orbit, 'dist', file)), `Missing ${orbit}/dist/${file}; build Orbit first or set ORBIT_DIR.`);
const server = http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname); } catch { response.writeHead(400).end(); return; }
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Orbit regressions</title>
      <link rel="stylesheet" href="/orbit/orbit.css"><style>body{margin:24px;font:16px sans-serif}#fixtures{display:block}.half-range{--o-range:180deg} .quarter-range{--o-range:90deg}</style>
      <script src="/orbit/orbit.js"></script><script type="module" src="/kit/orbit-kit.js"></script>
      <body><button id="before">Before</button><main id="fixtures"></main><button id="after">After</button></body></html>`);
    return;
  }
  const directory = pathname.startsWith('/orbit/') ? path.join(orbit, 'dist') : pathname.startsWith('/kit/') ? path.join(root, 'src') : null;
  if (!directory) { response.writeHead(404).end(); return; }
  const relative = pathname.replace(/^\/(orbit|kit)\//, '');
  const filename = path.resolve(directory, relative);
  if (!filename.startsWith(directory + path.sep)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('content-type', filename.endsWith('.css') ? 'text/css' : 'text/javascript');
    response.end(readFileSync(filename));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engines = { chromium, firefox, webkit };
const requested = (process.env.BROWSERS || 'chromium,firefox,webkit').split(',').map(name => name.trim()).filter(Boolean);
let completed = 0;
try {
  for (const name of requested) {
    assert.ok(engines[name], `Unknown browser ${name}`);
    if (!existsSync(engines[name].executablePath())) {
      if (name === 'chromium' || process.env.BROWSERS) throw new Error(`${name} is not installed; run npx playwright install ${name}`);
      console.log(`SKIP ${name}: browser not installed (set BROWSERS to require it)`);
      continue;
    }
    const browser = await engines[name].launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Orbit explains misuse with [orbit] console messages; the kit must cause none.
      page.on('console', message => { if (message.type() === 'error' || message.text().includes('[orbit]')) errors.push(`${message.type()}: ${message.text()}`); });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.evaluate(() => Promise.all(['o-arc','o-progress','o-menu','o-knob','o-gauge','o-timer','o-status'].map(tag => customElements.whenDefined(tag))));
      assert.match(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--o-gray-light') + (window.Orbit?.ready ? ' v2' : '')), /v2/, 'Orbit 2 runtime (Orbit.ready) is required');
      const mount = async html => { await page.locator('#fixtures').evaluate((node, value) => { node.innerHTML = value; }, html); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
      const test = async (title, run) => { await run(); assert.deepEqual(errors, [], `${title}: page errors`); console.log(`  ✓ ${name}: ${title}`); };

      await test('zero values and cumulative arcs react to values, insertion and removal', async () => {
        await mount('<div class="bigbang" style="width:300px;aspect-ratio:1"><div class="gravity-spot"><div class="orbit-4" id="arc-ring" style="--o-range:270deg"><o-arc id="a" value="0"></o-arc><o-arc id="b" value="75"></o-arc></div><div class="orbit-5"><o-progress id="p" value="0"></o-progress></div></div></div>');
        assert.equal(await page.locator('#a').evaluate(node => node.getAttributes().arcAngle), 0);
        assert.equal(await page.locator('#p').evaluate(node => node.shadowRoot.querySelector('.progress-bar').getAttribute('d')), '');
        await page.locator('#a').evaluate(node => node.setAttribute('value', '50'));
        await page.waitForFunction(() => document.querySelector('#b').style.getPropertyValue('--o-arc-start') === '135deg');
        assert.equal(await page.locator('#b').evaluate(node => node.getAttributes().stackOffset), 135);
        await page.locator('#arc-ring').evaluate(node => { const arc = document.createElement('o-arc'); arc.id = 'inserted'; arc.setAttribute('value', '10'); node.prepend(arc); });
        await page.waitForFunction(() => document.querySelector('#b').style.getPropertyValue('--o-arc-start') === '162deg');
        await page.locator('#inserted').evaluate(node => node.remove());
        await page.waitForFunction(() => document.querySelector('#b').style.getPropertyValue('--o-arc-start') === '135deg');
        await page.locator('#a').evaluate(node => node.setAttribute('value', '0'));
        await page.waitForFunction(() => document.querySelector('#b').style.getPropertyValue('--o-arc-start') === '0deg');
      });

      await test('parent class/range changes and resize redraw real SVG paths', async () => {
        await mount('<div id="box" class="bigbang" style="width:200px;aspect-ratio:1;container-type:inline-size"><div class="gravity-spot" style="--o-force:calc(100cqw * 2)"><div id="parent" class="orbit-4 half-range"><o-progress id="p" value="50"></o-progress></div></div></div>');
        const before = await page.locator('#p').evaluate(node => ({ width: node.getBoundingClientRect().width, d: node.shadowRoot.querySelector('.progress-bar').getAttribute('d') }));
        await page.locator('#parent').evaluate(node => node.classList.replace('half-range', 'quarter-range'));
        await page.waitForFunction(previous => document.querySelector('#p').shadowRoot.querySelector('.progress-bar').getAttribute('d') !== previous, before.d);
        assert.equal(await page.locator('#p').evaluate(node => node.getAttributes().range), 90);
        await page.locator('#box').evaluate(node => { node.style.width = '400px'; });
        await page.waitForFunction(width => document.querySelector('#p').getBoundingClientRect().width > width * 1.9, before.width);
        await page.locator('#parent').evaluate(node => { node.style.setProperty('--o-range', 'calc(.5turn - 30deg)'); });
        await page.waitForFunction(() => Math.abs(document.querySelector('#p').getAttributes().range - 150) < .01);
      });

      await test('runtime layout supports more than 24 rings and 60 children without class collisions', async () => {
        await mount(`<div class="bigbang" style="width:300px;aspect-ratio:1"><div class="gravity-spot"><div class="orbit-70" id="large-ring">${'<div class="satellite"><div class="capsule">•</div></div>'.repeat(80)}</div><div class="orbit-kit-card" id="ordinary">Ordinary content</div></div></div>`);
        await page.waitForFunction(() => document.querySelector('#large-ring').hasAttribute('data-orbit-ring'));
        assert.equal(await page.locator('#large-ring').evaluate(node => Number(node.style.getPropertyValue('--o-layout-number'))), 70);
        assert.equal(await page.locator('#large-ring > :last-child').evaluate(node => Number(node.style.getPropertyValue('--o-layout-index'))), 79);
        assert.equal(await page.locator('#ordinary').evaluate(node => node.hasAttribute('data-orbit-ring')), false);
      });

      await test('knob keyboard, endpoints, decimals, disabled changes and focus', async () => {
        await mount('<o-knob id="knob" min="1" max="10" step="2" value="1" label="Volume"></o-knob>');
        const knob = page.getByRole('slider', { name: 'Volume' });
        await knob.focus();
        await page.keyboard.press('ArrowUp');
        assert.equal(await knob.evaluate(node => node.value), 3);
        await page.keyboard.press('End');
        assert.equal(await knob.evaluate(node => node.value), 10);
        await page.keyboard.press('Home');
        assert.equal(await knob.evaluate(node => node.value), 1);
        await knob.evaluate(node => { node.setAttribute('min', '0'); node.setAttribute('step', '6'); node.value = 10; });
        assert.deepEqual(await knob.evaluate(node => [node.value, Number(node.getAttribute('aria-valuenow'))]), [10, 10]);
        await knob.evaluate(node => { node.setAttribute('step', '.1'); node.value = 1.2; });
        assert.equal(await knob.evaluate(node => node.querySelector('.o-knob-readout').textContent), 'Volume');
        assert.equal(await knob.getAttribute('aria-valuetext'), '1.2');
        await knob.evaluate(node => node.setAttribute('disabled', ''));
        assert.deepEqual(await knob.evaluate(node => [node.tabIndex, node.getAttribute('aria-disabled'), node.style.cursor]), [-1, 'true', 'default']);
        await page.keyboard.press('ArrowUp');
        assert.equal(await knob.evaluate(node => node.value), 1.2);
        await knob.evaluate(node => node.removeAttribute('disabled'));
        assert.equal(await knob.evaluate(node => node.tabIndex), 0);
        assert.equal(await knob.evaluate(node => node.querySelector('.bigbang').style.opacity), '');
        // A disabled form control loses focus, like a native input.
        await knob.focus();
        await page.keyboard.press('ArrowUp');
        assert.equal(await knob.evaluate(node => node.value), 1.3);
      });

      await test('knob drag and wheel emit real input/change; disconnect cleans up', async () => {
        await mount('<o-knob id="knob" value="50" label="Drag"></o-knob>');
        const knob = page.getByRole('slider', { name: 'Drag' });
        await knob.evaluate(node => { window.gestures = []; window.wheels = []; document.addEventListener('wheel', event => window.wheels.push({deltaY:event.deltaY,focus:document.activeElement.id,path:event.composedPath().map(item=>item.localName||item.constructor.name)}), {capture:true,passive:true}); for (const type of ['input','change']) node.addEventListener(type, event => window.gestures.push([type, event.detail.value])); });
        const bounds = await knob.locator('.bigbang').boundingBox();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 - 40, { steps: 4 });
        await page.mouse.up();
        assert.equal(await knob.evaluate(node => node.value), 70);
        assert.equal((await page.evaluate(() => window.gestures.filter(event => event[0] === 'change'))).length, 1);
        await page.mouse.wheel(0, -100);
        try { await page.waitForFunction(() => document.querySelector('#knob').value === 71); } catch(error) { console.error('Wheel diagnostics', await page.evaluate(point=>({value:document.querySelector('#knob').value,active:document.activeElement.outerHTML,events:window.gestures,wheels:window.wheels,hit:document.elementFromPoint(point.x,point.y)?.outerHTML}),{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2-40})); throw error; }
        await page.getByRole('button', { name: 'After' }).focus();
        await page.mouse.wheel(0, -100);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await knob.evaluate(node => node.value), 71);
        await knob.evaluate(node => { node.remove(); document.querySelector('#fixtures').append(node); });
        await knob.focus();
        await page.keyboard.press('ArrowUp');
        assert.equal(await knob.evaluate(node => node.value), 72);
      });

      for (const mode of ['drill', 'concentric']) await test(`menu ${mode}: keys, accessible icons, focus, route events and selection`, async () => {
        await mount(`<o-menu id="menu" expand="${mode}" label="Actions"></o-menu>`);
        await page.locator('#menu').evaluate(node => { node.setAttribute('items', JSON.stringify([{label:'Edit',icon:'✏️',children:[{label:'Cut',value:'cut'},{label:'Copy',value:'copy'}]},{label:'Quit',value:'quit'}])); window.routes=[]; window.selections=[]; node.addEventListener('navigate',e=>window.routes.push(e.detail.path)); node.addEventListener('select',e=>window.selections.push(e.detail)); });
        await page.getByRole('menuitem', { name: 'Edit', exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Cut');
        assert.deepEqual(await page.evaluate(() => window.routes), [[0]]);
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Copy');
        await page.keyboard.press('Space');
        assert.deepEqual(await page.locator('#menu').evaluate(node => [node.value, node.selectedIndex, node.path]), ['copy',1,[0]]);
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Copy');
        await page.keyboard.press('Escape');
        assert.deepEqual(await page.locator('#menu').evaluate(node => node.path), []);
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Edit');
        assert.deepEqual(await page.evaluate(() => window.routes), [[0],[]]);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.locator('#menu').evaluate(node => [node.value,node.selectedIndex]), ['quit',1]);
        assert.equal(await page.getByRole('menuitem', { name:'Quit', exact:true }).getAttribute('aria-current'), 'true');
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('#menu').evaluate(node => node.contains(document.activeElement)), false, 'Tab must leave the menu');
      });

      for (const mode of ['drill','concentric']) await test(`menu ${mode}: painted SVG sectors and hub accept real pointer clicks`, async () => {
        await mount(`<o-menu id="menu" expand="${mode}" label="Actions"></o-menu>`);
        await page.locator('#menu').evaluate(node=>node.setAttribute('items',JSON.stringify([{label:'Edit',children:[{label:'Cut',value:'cut'},{label:'Copy',value:'copy'}]},{label:'Quit',value:'quit'}])));
        await page.locator('#menu').evaluate(node => {
          window.menuPointer=[]; window.pointerRoutes=[];
          node.addEventListener('navigate',event=>window.pointerRoutes.push(event.detail.path));
          if(window.menuPointerListener) for(const type of ['pointerdown','pointerup','click'])document.removeEventListener(type,window.menuPointerListener,true);
          window.menuPointerListener=event=>window.menuPointer.push({type:event.type,target:event.target.localName,cls:event.target.className,text:event.target.textContent?.slice(0,80),path:event.composedPath().map(item=>item.localName||item.constructor.name)});
          for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,window.menuPointerListener,true);
        });
        const clickSector = async label => {
          const sector=page.getByRole('menuitem',{name:label,exact:true});
          await sector.scrollIntoViewIfNeeded();
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const point=await sector.evaluate(node=>{const attrs=node.getAttributes(),svg=node.shadowRoot.querySelector('svg'),angle=(attrs.arcAngle/2-90)*Math.PI/180;const position=new DOMPoint(50+attrs.realRadius*Math.cos(angle),50+attrs.realRadius*Math.sin(angle)).matrixTransform(svg.getScreenCTM());return{x:position.x,y:position.y};});
          await page.mouse.click(point.x,point.y);
        };
        await clickSector('Edit');
        assert.deepEqual(await page.locator('#menu').evaluate(node=>node.path),[0]);
        await clickSector('Cut');
        assert.equal(await page.locator('#menu').evaluate(node=>node.value),'cut');
        const hubBounds=await page.locator('#menu .o-menu-hub').boundingBox();
        await page.locator('#menu .o-menu-hub').click();
        try { await page.waitForFunction(()=>document.querySelector('#menu').path.length===0,null,{timeout:3000}); } catch(error) {
          console.error('Hub click diagnostics',await page.evaluate(point=>({path:document.querySelector('#menu').path,active:document.activeElement.outerHTML,events:window.menuPointer,routes:window.pointerRoutes,hit:document.elementFromPoint(point.x,point.y)?.outerHTML,hub:document.querySelector('.o-menu-hub')?.outerHTML}),{x:hubBounds.x+hubBounds.width/2,y:hubBounds.y+hubBounds.height/2})); throw error;
        }
        assert.deepEqual(await page.locator('#menu').evaluate(node=>node.path),[]);
        assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Edit');
      });

      await test('kit data is inert text; icons reject executable SVG and arbitrary HTML', async () => {
        await mount('<o-menu id="menu"></o-menu><o-donut id="donut"></o-donut>');
        await page.locator('#menu').evaluate(node => node.setAttribute('items', JSON.stringify([{label:'<img src=x onerror="window.injected=1">',icon:'<svg onload="window.injected=1"><foreignObject><img src=x onerror="window.injected=1"></foreignObject><path d="M0 0L1 1" onclick="window.injected=1"/><use href="https://example.invalid/image.svg"/></svg>'}])));
        await page.locator('#donut').evaluate(node => { node.setAttribute('label','<img src=x onerror="window.injected=1">'); node.setAttribute('data','{"invalid":"array"}'); });
        assert.equal(await page.locator('#fixtures img,#fixtures foreignObject,#fixtures [onload],#fixtures [onclick],#fixtures use[href]').count(),0);
        assert.equal(await page.evaluate(() => window.injected), undefined);
        await page.locator('#menu').evaluate(node => node.setAttribute('items','[null,42,{"label":"Safe","children":{}}]'));
        assert.equal(await page.getByRole('menuitem', { name:'Safe', exact:true }).count(),1);
      });

      await test('donut patches segments and partial stacks start at zero', async () => {
        await mount('<o-donut id="donut" range="270" data=\'[{"value":25},{"value":75}]\'></o-donut>');
        await page.waitForFunction(() => document.querySelector('.ok-donut-segment').style.getPropertyValue('--o-arc-start') === '0deg');
        assert.equal(await page.locator('#donut .ok-hub').evaluate(node=>getComputedStyle(node).display),'none');
        await page.locator('#donut').evaluate(node => { window.segment=node.querySelector('.ok-donut-segment'); node.setAttribute('data',JSON.stringify([{value:50},{value:50}])); node.setAttribute('label','Updated'); node.setAttribute('unit','%'); });
        assert.equal(await page.locator('#donut').evaluate(node => window.segment === node.querySelector('.ok-donut-segment')),true);
        await page.waitForFunction(() => document.querySelectorAll('.ok-donut-segment')[1].style.getPropertyValue('--o-arc-start') === '135deg');
        assert.equal(await page.locator('#donut .ok-hub').textContent(),'Updated%');
        assert.notEqual(await page.locator('#donut .ok-hub').evaluate(node=>getComputedStyle(node).display),'none');
        await page.locator('#donut').evaluate(node => node.setAttribute('shape','rounded'));
        assert.equal(await page.locator('.ok-donut-segment').first().getAttribute('shape'),'rounded');
      });

      await test('radar target updates preserve sweep and distance zero reaches center', async () => {
        await mount('<o-radar id="radar" targets=\'[{"angle":0,"dist":0}]\'></o-radar>');
        await page.locator('#radar').evaluate(node => { window.sweep=node.querySelector('.o-radar-sweep'); node.setAttribute('targets',JSON.stringify([{angle:180,dist:0},{angle:90,dist:.5}])); });
        assert.equal(await page.locator('#radar').evaluate(node => node.querySelector('.o-radar-sweep')===window.sweep),true);
        assert.equal(await page.locator('#radar .o-radar-blip').count(),2);
        await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const offset=await page.locator('#radar').evaluate(node => {const box=node.querySelector('.bigbang').getBoundingClientRect(), blip=node.querySelector('.o-radar-blip').getBoundingClientRect();return Math.hypot(blip.x+blip.width/2-box.x-box.width/2,blip.y+blip.height/2-box.y-box.height/2);});
        assert.ok(offset<2,`Zero-distance blip is ${offset}px from the center`);
        await page.locator('#radar').evaluate(node=>node.setAttribute('targets','[]'));
        assert.equal(await page.locator('#radar .o-radar-blip').count(),0);
        assert.equal(await page.locator('#radar').evaluate(node => node.querySelector('.o-radar-sweep')===window.sweep),true);
      });

      await test('clock and instrument restore CSS themes after attribute removal', async () => {
        await mount('<o-clock id="clock" time="10:08" style="--ok-clock-face:#123456" face="red"></o-clock><o-instrument id="instrument" style="--ok-inst-face:#123456" face="red"></o-instrument>');
        for(const [id,property]of [['clock','--ok-clock-face'],['instrument','--ok-inst-face']]) {
          assert.equal(await page.locator(`#${id}`).evaluate((node,property)=>node.style.getPropertyValue(property),property),'red');
          await page.locator(`#${id}`).evaluate(node=>node.removeAttribute('face'));
          assert.equal(await page.locator(`#${id}`).evaluate((node,property)=>node.style.getPropertyValue(property),property),'#123456');
        }
        await page.locator('#clock').evaluate(node=>node.setAttribute('preset','smartwatch'));
        const smartwatch=await page.locator('#clock').evaluate(node=>node.style.getPropertyValue('--ok-clock-accent'));
        await page.locator('#clock').evaluate(node=>node.setAttribute('preset','classic'));
        assert.notEqual(await page.locator('#clock').evaluate(node=>node.style.getPropertyValue('--ok-clock-accent')),smartwatch);
      });

      await test('rectangular clock geometry and instrument minor spacing match their API', async () => {
        await mount('<o-clock id="clock" case="rectangle" dial="oval" time="10:08" size="240px"></o-clock><o-instrument id="instrument" preset="tachometer"></o-instrument>');
        const ratios=await page.locator('#clock').evaluate(node=>{const box=node.querySelector('.ok-clock-case').getBoundingClientRect(),dial=node.querySelector('.ok-clock-dial').getBoundingClientRect();return[box.height/box.width,dial.height/dial.width];});
        assert.ok(ratios.every(ratio=>ratio>1.2&&ratio<1.3),`Rectangular case/dial ratios: ${ratios}`);
        assert.equal(await page.locator('#instrument .ok-inst-tick').count(),49);
        assert.equal(await page.locator('#instrument .ok-inst-tick-M').count(),9);
        const spacing=await page.locator('#instrument').evaluate(node=>{const delta=selector=>{const ticks=node.querySelectorAll(selector);const angles=[...ticks].slice(0,2).map(tick=>{const m=new DOMMatrix(getComputedStyle(tick).transform);return Math.atan2(m.b,m.a)*180/Math.PI;});return(angles[1]-angles[0]+360)%360;};return{minor:delta('.ok-inst-tick'),major:delta('.ok-inst-tick-M')};});
        assert.ok(Math.abs(spacing.minor*6-spacing.major)<.1,`Five intermediate ticks require six equal intervals: ${JSON.stringify(spacing)}`);
      });

      await test('kit size supports relative lengths and live container resizing', async () => {
        await mount('<div id="container" style="width:240px;height:800px"><o-gauge id="gauge" size="100%" value="0"></o-gauge><o-knob id="knob" size="100%"></o-knob><o-menu id="menu" size="100%" items=\'[{"label":"A"},{"label":"B"}]\'></o-menu></div>');
        const boxes = await page.locator('#fixtures').evaluate(() => ['gauge','knob','menu'].map(id => { const box = document.getElementById(id).querySelector('.bigbang').getBoundingClientRect(); return [box.width, box.height]; }));
        assert.ok(boxes.every(([width, height]) => Math.abs(width - height) < 1), `Square widgets ignore an unrelated parent height: ${JSON.stringify(boxes)}`);
        const widths = await page.locator('#fixtures').evaluate(node => ['gauge','knob','menu'].map(id => document.getElementById(id).querySelector('.orbit-12').getBoundingClientRect().width));
        assert.ok(widths.every(width => Math.abs(width - 240) < 1), `orbit-12 must reach the edge of a 240px universe: ${widths}`);
        await page.locator('#container').evaluate(node => { node.style.width='480px'; });
        await page.waitForFunction(previous => ['gauge','knob','menu'].every((id,i) => document.getElementById(id).querySelector('.orbit-12').getBoundingClientRect().width > previous[i]*1.9), widths);
        assert.equal(await page.locator('#gauge .o-gauge-fill').evaluate(node => node.shadowRoot.querySelector('#orbitShape').getAttribute('d')), '');
      });
      await test('gauge and instrument expose meter semantics; bands stay inside their box', async () => {
        await mount('<o-gauge id="gauge" value="30" max="60" unit=" km/h" label="Speed" size="200px"></o-gauge><o-instrument id="inst" preset="cpu" value="64"></o-instrument>');
        const gauge = page.getByRole('meter', { name: /Speed/ });
        assert.deepEqual(await gauge.evaluate(node => ['aria-valuenow','aria-valuemin','aria-valuemax'].map(name => node.getAttribute(name))), ['30','0','60']);
        assert.equal(await page.locator('#inst').getAttribute('aria-valuenow'), '64');
        await page.evaluate(() => Orbit.ready());
        const overflow = await page.locator('#gauge').evaluate(node => {
          const box = node.querySelector('.bigbang').getBoundingClientRect(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
          let far = 0;
          for (const arc of node.querySelectorAll('o-arc')) {
            const path = arc.shadowRoot.querySelector('#orbitShape'), ctm = path.getScreenCTM(), length = path.getTotalLength();
            for (let i = 0; i <= 200; i++) { const p = new DOMPoint(path.getPointAtLength(length * i / 200).x, path.getPointAtLength(length * i / 200).y).matrixTransform(ctm); far = Math.max(far, Math.hypot(p.x - cx, p.y - cy)); }
          }
          return far - box.width / 2;
        });
        assert.ok(overflow < 1.5, `The band leaves its universe by ${overflow}px`);
      });

      await test('knob follows the pointer around its band', async () => {
        await mount('<o-knob id="knob" value="0" label="Turn" size="200px"></o-knob>');
        const knob = page.getByRole('slider', { name: 'Turn' });
        await page.evaluate(() => Orbit.ready());
        const box = await knob.locator('.bigbang').boundingBox();
        const r = box.width / 2 - 6, cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        // 12 o'clock is the middle of the default 270° range.
        await page.mouse.click(cx, cy - r);
        assert.equal(await knob.evaluate(node => node.value), 50);
        await page.mouse.move(cx + r, cy); await page.mouse.down(); await page.mouse.up();
        assert.equal(await knob.evaluate(node => node.value), 83);
      });

      await test('timer starts, pauses, resets and finishes with events and labels', async () => {
        await mount('<o-timer id="timer" duration="0.6" label="Tea"></o-timer>');
        const timer = page.getByRole('timer');
        await timer.evaluate(node => { window.timerEvents = []; for (const type of ['start','pause','reset','done']) node.addEventListener(type, () => window.timerEvents.push(type)); });
        const toggle = page.getByRole('button', { name: 'Start' });
        await toggle.focus();
        await page.keyboard.press('Enter');
        assert.equal(await timer.evaluate(node => node.running), true);
        assert.equal(await timer.evaluate(node => node.hasAttribute('running')), true);
        await page.getByRole('button', { name: 'Pause' }).click();
        const paused = await timer.evaluate(node => node.remaining);
        await page.waitForTimeout(150);
        assert.equal(await timer.evaluate(node => node.remaining), paused);
        assert.equal(await page.getByRole('button', { name: 'Resume' }).count(), 1);
        await page.getByRole('button', { name: 'Reset' }).click();
        assert.equal(await timer.evaluate(node => node.remaining), .6);
        await timer.evaluate(node => node.start());
        await page.waitForFunction(() => window.timerEvents.includes('done'));
        assert.deepEqual(await page.evaluate(() => window.timerEvents), ['start','pause','reset','start','done']);
        assert.equal(await timer.evaluate(node => [node.classList.contains('is-done'), node.querySelector('.ok-timer-time').textContent, node.querySelector('.ok-sr').textContent].join('|')), 'true|0:00|Tea: time is up');
        await timer.evaluate(node => node.setAttribute('duration', '2:00'));
        assert.equal(await timer.evaluate(node => node.querySelector('.ok-timer-time').textContent), '2:00');
      });

      await test('status: roving focus, arrows across rings, select event and hub text', async () => {
        await mount(`<o-status id="status" label="Regions" data='${JSON.stringify([{label:'EU',children:[{label:'api',status:'ok'},{label:'db',status:'down'}]},{label:'US',status:'ok'}])}'></o-status>`);
        const status = page.getByRole('group', { name: /Regions/ });
        assert.match(await status.getAttribute('aria-label'), /2 ok, 1 error|1 error, 2 ok/);
        assert.equal(await page.locator('#status .ok-status-main').textContent(), '1');
        await status.evaluate(node => { window.selected = []; node.addEventListener('select', event => window.selected.push(event.detail.path.join('.'))); });
        await page.keyboard.press('Tab');
        await page.locator('#before').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'EU: Error');
        await page.keyboard.press('ArrowUp');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'api: OK');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'db: Error');
        assert.equal(await page.locator('#status .ok-status-main').textContent(), 'db');
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.selected), ['0.1']);
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'EU: Error');
        await page.keyboard.press('Tab');
        assert.equal(await status.evaluate(node => node.contains(document.activeElement)), false, 'Tab must leave the status ring');
        await page.evaluate(() => Orbit.ready());
        const point = await page.locator('#status [data-path="1"]').evaluate(node => { const attrs = node.getAttributes(), svg = node.shadowRoot.querySelector('svg'), angle = (attrs.arcAngle / 2 - 90) * Math.PI / 180; const p = new DOMPoint(50 + attrs.realRadius * Math.cos(angle), 50 + attrs.realRadius * Math.sin(angle)).matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y }; });
        await page.mouse.click(point.x, point.y);
        assert.deepEqual(await page.evaluate(() => window.selected), ['0.1', '1']);
      });

      await test('forms: knob and menu submit, reset, restore validity and follow a disabled fieldset', async () => {
        await mount(`<form id="form"><fieldset id="set">
          <o-knob name="volume" value="30" label="Volume"></o-knob>
          <o-menu name="action" required label="Do" items='[{"label":"Cut","value":"cut"},{"label":"Copy","value":"copy"}]'></o-menu>
        </fieldset></form>`);
        const data = () => page.locator('#form').evaluate(form => Object.fromEntries(new FormData(form)));
        assert.deepEqual(await data(), { volume: '30' });
        assert.equal(await page.locator('#form').evaluate(form => form.checkValidity()), false, 'required menu without a pick');
        assert.equal(await page.locator('o-menu').evaluate(node => node.validity.valueMissing), true);
        await page.evaluate(() => { window.formEvents = []; for (const type of ['input', 'change']) document.querySelector('#form').addEventListener(type, e => window.formEvents.push(`${e.target.localName}:${type}`)); });
        await page.getByRole('slider', { name: 'Volume' }).focus();
        await page.keyboard.press('ArrowUp');
        await page.getByRole('menuitem', { name: 'Copy', exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.deepEqual(await data(), { volume: '31', action: 'copy' });
        assert.deepEqual(await page.evaluate(() => window.formEvents), ['o-knob:input', 'o-knob:change', 'o-menu:input', 'o-menu:change']);
        assert.equal(await page.locator('#form').evaluate(form => form.checkValidity()), true);
        await page.locator('o-knob').evaluate(node => { node.value = 80; });
        assert.equal(await page.evaluate(() => window.formEvents.length), 4, 'value from code fires nothing');
        await page.locator('#form').evaluate(form => form.reset());
        assert.deepEqual(await data(), { volume: '30' });
        assert.equal(await page.locator('o-knob').evaluate(node => node.value), 30);
        assert.equal(await page.locator('o-menu').evaluate(node => node.value), undefined);
        await page.locator('#set').evaluate(set => { set.disabled = true; });
        assert.deepEqual(await page.locator('o-knob').evaluate(node => [node.matches(':disabled'), node.tabIndex, node.getAttribute('aria-disabled')]), [true, -1, 'true']);
        assert.deepEqual(await data(), {}, 'disabled controls do not submit');
        await page.locator('#set').evaluate(set => { set.disabled = false; });
        assert.deepEqual(await page.locator('o-knob').evaluate(node => [node.matches(':disabled'), node.tabIndex]), [false, 0]);
        assert.equal(await page.locator('o-knob').evaluate(node => node.form?.id), 'form');
        await mount('<label for="k">Gain</label><o-knob id="k" name="gain" value="5"></o-knob>');
        assert.equal(await page.locator('#k').evaluate(node => node.labels.length), 1);
      });

      await test('format and locale reach readouts, ticks and aria-valuetext', async () => {
        await mount(`<o-gauge id="g" value="1234.5" max="5000" currency="EUR" locale="de-DE"></o-gauge>
          <o-knob id="k" value="88" max="240" format="unit" unit="kilometer-per-hour" locale="en"></o-knob>
          <div lang="fr"><o-instrument id="i" min="0" max="1" ticks="3" value="0.5" format="percent"></o-instrument></div>
          <o-gauge id="f" value="3"></o-gauge>`);
        const clean = text => text.replace(/[  ]/g, ' ');
        assert.equal(clean(await page.locator('#g .ok-hub').textContent()), '1.234,50 €');
        assert.equal(clean(await page.locator('#g').getAttribute('aria-valuetext')), '1.234,50 €');
        assert.equal(await page.locator('#k .o-knob-readout').textContent(), '88 km/h');
        assert.deepEqual((await page.locator('#i .ok-inst-num').allTextContents()).map(clean), ['0 %', '50 %', '100 %'], 'the closest lang picks the locale');
        await page.locator('#f').evaluate(node => { node.formatter = (value, { kind }) => kind === 'aria' ? `${value} stars` : '★'.repeat(value); });
        assert.equal(await page.locator('#f .ok-hub').textContent(), '★★★');
        assert.equal(await page.locator('#f').getAttribute('aria-valuetext'), '3 stars');
      });

      await test('min, max and step: clamping, snapping and keyboard steps', async () => {
        await mount('<o-gauge id="g" min="10" max="20" step="5" value="17"></o-gauge><o-knob id="k" min="-1" max="1" step="0.25" value="0" label="Pan"></o-knob>');
        assert.deepEqual(await page.locator('#g').evaluate(node => ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map(a => node.getAttribute(a))), ['10', '20', '15']);
        const knob = page.getByRole('slider', { name: 'Pan' });
        await knob.focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('PageUp');
        assert.equal(await knob.evaluate(node => node.value), 1);
        await page.keyboard.press('ArrowLeft');
        assert.equal(await knob.getAttribute('aria-valuenow'), '0.75');
        await knob.evaluate(node => node.stepDown(2));
        assert.equal(await knob.evaluate(node => node.value), .25);
      });

      await test('themes inherit from a container, stay at zero specificity and leave defaults alone', async () => {
        await mount(`<style>.mine { --ok-fill: rgb(255, 0, 0); }</style>
          <o-gauge id="plain" value="50"></o-gauge>
          <section class="ok-theme-light"><o-gauge id="inherited" value="50"></o-gauge><o-gauge id="override" class="mine" value="50"></o-gauge><o-knob id="local" theme="glass" value="5"></o-knob></section>
          <o-gauge id="attr" theme="dark" class="mine" value="50"></o-gauge><o-gauge id="inline" theme="dark" fill="rgb(0, 0, 255)" value="50"></o-gauge>`);
        const fill = id => page.locator(`#${id} .ok-value`).evaluate(node => getComputedStyle(node).getPropertyValue('--o-fill').trim());
        assert.equal(await fill('plain'), '#6366f1', 'no theme: the 1.0 default');
        assert.equal(await fill('inherited'), '#0d9488', 'light theme from the container');
        assert.equal(await fill('override'), 'rgb(255, 0, 0)', 'a class of yours beats the theme');
        assert.equal(await fill('local'), 'rgba(255,255,255,.92)', 'the closest theme wins');
        assert.equal(await fill('attr'), 'rgb(255, 0, 0)', 'zero specificity on the element itself');
        assert.equal(await fill('inline'), 'rgb(0, 0, 255)', 'color attributes beat themes');
        await mount('<div class="ok-theme-glass"><o-instrument id="i" value="40"></o-instrument></div>');
        assert.match(await page.locator('#i .ok-inst-dial').evaluate(node => getComputedStyle(node).backdropFilter || getComputedStyle(node).webkitBackdropFilter), /blur/);
      });

      await test('every component renders without [orbit] warnings', async () => {
        await mount(`<o-gauge value="40"></o-gauge><o-donut label="x" data='[{"value":1},{"value":2}]'></o-donut><o-rings data='[{"value":5},{"value":50}]'></o-rings><o-knob></o-knob><o-menu items='[{"label":"A"},{"label":"B","children":[{"label":"C"}]}]'></o-menu><o-instrument preset="fuel"></o-instrument><o-clock preset="chrono" time="10:10"></o-clock><o-clock dial="rings" time="10:10"></o-clock><o-compass heading="200"></o-compass><o-radar targets='[{"angle":20,"dist":.5}]'></o-radar><o-meter value="20"></o-meter><o-timer ticks="60"></o-timer><o-status labels data='[{"label":"A","status":"ok"},{"label":"B","status":"warn"}]'></o-status>`);
        await page.evaluate(() => Orbit.ready());
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
      });
      completed++;
    } finally { await browser.close(); }
  }
  assert.ok(completed > 0, 'No browsers ran');
  console.log(`Browser regression suite passed in ${completed} engine(s). Orbit: ${orbit}`);
} finally { await new Promise(resolve => server.close(resolve)); }
