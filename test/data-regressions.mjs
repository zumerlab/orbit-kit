import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Unit DOM for input/lifecycle contracts. browser.mjs separately verifies the
// real layout, HTML parsing, accessibility and node preservation in browsers.
class UnitNode {
  constructor() {
    this.attrs = new Map(); this.nodes = new Map(); this.lists = new Map(); this.textContent = ''; this.isConnected = false; this.buildCount = 0;
    const values = new Map();
    this.style = { setProperty:(k,v)=>values.set(k,String(v)), getPropertyValue:k=>values.get(k)||'', getPropertyPriority:()=>'', removeProperty:k=>values.delete(k) };
    this.classList = { toggle() {} };
  }
  hasAttribute(k) { return this.attrs.has(k); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k,v) { const old = this.getAttribute(k); this.attrs.set(k,String(v)); if (this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k,old,String(v)); }
  removeAttribute(k) { const old = this.getAttribute(k); this.attrs.delete(k); if (this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k,old,null); }
  set innerHTML(value) { this.html = value; this.nodes.clear(); this.lists.clear(); this.buildCount++; }
  get innerHTML() { return this.html || ''; }
  querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, new UnitNode()); return this.nodes.get(selector); }
  querySelectorAll(selector) {
    if (!this.lists.has(selector)) {
      const name = selector.replace(/^\./, '');
      const matches = [...this.innerHTML.matchAll(/class="([^"]*)"/g)].filter((m) => m[1].split(/\s+/).includes(name));
      this.lists.set(selector, matches.map(() => new UnitNode()));
    }
    return this.lists.get(selector);
  }
  remove() { this.removed = true; }
}
globalThis.HTMLElement = UnitNode;
const frames = new Map(), intervals = new Map(); let id = 0;
globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
globalThis.cancelAnimationFrame = key => frames.delete(key);
globalThis.setInterval = fn => { intervals.set(++id, fn); return id; };
globalThis.clearInterval = key => intervals.delete(key);
const { escapeHTML, safeIcon, finiteNumber, cssLength } = await import('../src/base.js');
const { OrbitGauge } = await import('../src/o-gauge.js');
const { OrbitDonut } = await import('../src/o-donut.js');
const { OrbitRings } = await import('../src/o-rings.js');
const { OrbitMeter } = await import('../src/o-meter.js');
const { OrbitRadar } = await import('../src/o-radar.js');
const { OrbitCompass } = await import('../src/o-compass.js');
const { OrbitClock } = await import('../src/o-clock.js');
const { OrbitInstrument } = await import('../src/o-instrument.js');
function make(Class, attrs = {}) { const el = new Class(); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); el.isConnected = true; el.connectedCallback(); return el; }

assert.equal(escapeHTML('<img title="A&B">'), '&lt;img title=&quot;A&amp;B&quot;&gt;');
assert.equal(safeIcon('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
for (const value of ['', null, 'nope', 'Infinity']) assert.equal(finiteNumber(value, 12), 12);
assert.equal(cssLength('20rem'), '20rem');
assert.equal(cssLength('calc(100% - 2rem)'), 'calc(100% - 2rem)');
assert.equal(cssLength('10px;position:fixed'), '200px');
for (const [Class, name, key] of [[OrbitDonut,'data','data'],[OrbitRings,'data','data'],[OrbitRadar,'targets','targets'],[OrbitMeter,'zones','zones'],[OrbitInstrument,'zones','zones']]) {
  for (const value of ['{}', 'null', '[null,7,false]']) {
    const el = make(Class, { [name]:value });
    assert.deepEqual(el.readConfig()[key], [], `${Class.name}: ${value}`);
    assert.ok(!/NaN|Infinity/.test(el.innerHTML), `${Class.name} emitted invalid geometry`);
  }
}
const bad = '<img src=x onerror="window.probe=true">';
for (const [Class, attr] of [[OrbitDonut,'label'],[OrbitRings,'label'],[OrbitRadar,'label'],[OrbitCompass,'labels'],[OrbitClock,'brand'],[OrbitInstrument,'label']]) {
  const el = make(Class, { [attr]:bad });
  assert.ok(!el.innerHTML.includes('<img'), `${Class.name} emitted HTML from text`);
  assert.ok(el.innerHTML.includes('&lt;img'), `${Class.name} lost escaped label`);
}
const donut = make(OrbitDonut, { data:JSON.stringify([{value:25,label:'Rent" onmouseover="probe()'},{value:75}]), range:270 });
assert.ok(donut.innerHTML.includes('Rent&quot; onmouseover=&quot;probe()'));
const arc = donut._segments[0], center = donut._center;
donut.setAttribute('data','[{"value":60},{"value":40}]');
assert.equal(donut._segments[0], arc);
assert.equal(arc.getAttribute('value'),'60.0000');
donut.setAttribute('label','new'); donut.setAttribute('unit','%');
assert.equal(donut._center, center); assert.equal(center.textContent,'new%');
donut.setAttribute('shape','rounded'); assert.notEqual(donut._segments[0], arc);
assert.ok(donut.innerHTML.includes('shape="rounded"'));
for (const total of [0, -1, 'oops']) {
  donut.setAttribute('total',total);
  assert.equal(donut.readConfig().data.reduce((n,d)=>n+d.pct,0),100);
}
donut.setAttribute('data','[{"value":1e308},{"value":1e308}]'); donut.removeAttribute('total');
assert.deepEqual(donut.readConfig().data.map(d=>d.pct),[50,50]);
const rings = make(OrbitRings, { data:'[{"value":10,"max":100,"label":"Move"}]' });
const ring = rings._rings[0]; rings.setAttribute('data','[{"value":20,"max":100,"label":"Move"}]');
assert.equal(rings._rings[0],ring); assert.equal(ring.getAttribute('value'),'20');
assert.match(rings.getAttribute('aria-label'), /Move: 20 of 100/);
const tinyRing = make(OrbitRings, {data:'[{"value":1e-30,"max":1e-30}]'});
assert.equal(tinyRing._rings[0].getAttribute('max'),'1e-30');
const tinyGauge = make(OrbitGauge, {value:1e-30,max:1e-30});
assert.equal(tinyGauge._fill.getAttribute('value'),'100.00');
const gauge = make(OrbitGauge, { value:0,max:0 });
assert.equal(gauge._fill.getAttribute('value'),'0.00');
gauge.setAttribute('glow',''); assert.match(gauge.innerHTML,/drop-shadow/);
gauge.removeAttribute('glow'); assert.doesNotMatch(gauge.innerHTML,/drop-shadow/);
gauge.setAttribute('size','20rem'); assert.match(gauge.innerHTML,/width:20rem/);
assert.doesNotMatch(gauge.innerHTML,/--o-force/);
const meter = make(OrbitMeter, { zones:'[{"from":85,"to":100}]' });
assert.match(meter.innerHTML,/--o-from:454\.5deg/);
assert.ok(meter._needle.style.getPropertyValue('--o-angle-composite').endsWith('deg'));
const radar = make(OrbitRadar, {targets:'[{"dist":0},{"dist":0.123},{"dist":"oops"}]'});
assert.deepEqual(radar.readConfig().targets.map(t=>t.dist),[0,.123,.5]);
assert.doesNotMatch(radar.innerHTML,/fit-range/);
assert.match(radar.innerHTML,/--o-alignment:calc\(var\(--o-radius\) \* 1\)/);
const sweep = radar._sweep; radar.setAttribute('targets','[{"angle":90,"dist":1}]');
assert.equal(radar._sweep,sweep); assert.equal(radar._targets.length,1);
for (const [Class, prop] of [[OrbitClock,'--ok-clock-face'],[OrbitInstrument,'--ok-inst-face']]) {
  const el = new Class(); el.style.setProperty(prop,'green'); el.setAttribute('face','red'); el.isConnected=true; el.connectedCallback();
  assert.equal(el.style.getPropertyValue(prop),'red'); el.removeAttribute('face'); assert.equal(el.style.getPropertyValue(prop),'green');
}
const clock = make(OrbitClock, {preset:'smartwatch',time:'10:20:30'});
clock.setAttribute('preset','classic'); assert.equal(clock.style.getPropertyValue('--ok-clock-accent'),'');
const hand = clock._hourHand; clock.setAttribute('live',''); assert.equal(clock._hourHand,hand); assert.equal(intervals.size,1);
clock.setAttribute('smooth',''); assert.equal(intervals.size,0); assert.equal(frames.size,1);
clock.disconnectedCallback(); assert.equal(frames.size,0);
clock.connectedCallback(); assert.equal(frames.size,1);
clock.setAttribute('live','false'); assert.equal(frames.size,0);
clock.setAttribute('dial','rings'); clock.setAttribute('hour-color','#123456'); assert.match(clock.innerHTML,/#123456/);
const instrument = make(OrbitInstrument, {value:'bad',ticks:'bad',zones:'[null]'});
assert.ok(Number.isFinite(instrument.readConfig().value));
assert.doesNotMatch(instrument._needle.style.getPropertyValue('--o-angle-composite'),/NaN|Infinity/);
const needle = instrument._needle; instrument.setAttribute('label','LOAD'); instrument.setAttribute('unit','%'); assert.equal(instrument._needle,needle);
const altimeter = make(OrbitInstrument, {preset:'altimeter'});
assert.doesNotMatch(altimeter.innerHTML,/fit-range/);
assert.match(altimeter.innerHTML,/ok-inst-num">9<\/div>/);
assert.doesNotMatch(altimeter.innerHTML,/ok-inst-num">10<\/div>/);
const owned = ['base','o-gauge','o-donut','o-rings','o-meter','o-radar','o-compass','o-clock','o-instrument','o-timer','o-status','orbit-kit'].map(n=>new URL(`../src/${n}.js`,import.meta.url).href);
const ssr = spawnSync(process.execPath, ['--input-type=module','-e',`await Promise.all(${JSON.stringify(owned)}.map(p=>import(p)))`], {encoding:'utf8'});
assert.equal(ssr.status,0,ssr.stderr);
console.log('Display data, escaping, geometry, live updates, themes, clock lifecycle and SSR regressions passed.');
