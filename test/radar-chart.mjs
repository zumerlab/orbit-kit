/**
 * <o-radar-chart> unit tests, no browser: data parsing, scales, the Orbit
 * web and the accessible description. Run: node test/radar-chart.mjs
 */
// ---- a small DOM stand-in -------------------------------------------------
function stubStyle() {
  return { _p: {}, setProperty(k, v) { this._p[k] = String(v); }, getPropertyValue(k) { return this._p[k] || ''; }, getPropertyPriority() { return ''; }, removeProperty(k) { delete this._p[k]; } };
}

class HTMLElementStub {
  constructor() { this._attrs = {}; this._html = ''; this.style = stubStyle(); this.dataset = {}; this.tabIndex = 0; this._events = []; }
  setAttribute(k, v) { const old = this.getAttribute(k); this._attrs[k] = String(v); this.attributeChangedCallback?.(k, old, String(v)); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  hasAttribute(k) { return k in this._attrs; }
  removeAttribute(k) { const old = this.getAttribute(k); delete this._attrs[k]; this.attributeChangedCallback?.(k, old, null); }
  addEventListener() {} removeEventListener() {}
  dispatchEvent(event) { this._events.push(event); return true; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; }
  get localName() { return this.constructor._tag || 'o-element'; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get isConnected() { return !!this._connected; }
}

function installShim() {
  globalThis.HTMLElement = HTMLElementStub;
  globalThis.customElements = { _reg: {}, get(t) { return this._reg[t]; }, define(t, c) { c._tag = t; this._reg[t] = c; } };
  globalThis.__styles = [];
  globalThis.document = {
    getElementById(id) { return globalThis.__styles.find((s) => s.id === id) || null; },
    createElement() { return { id: '', textContent: '' }; },
    head: { appendChild(el) { globalThis.__styles.push(el); } }
  };
  globalThis.CustomEvent = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
}

let pass = 0, fail = 0;
function check(name, cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${msg ? ` — ${msg}` : ''}`); }
}
/** A connected element with attributes, not yet rendered. */
function make(Cls, attrs = {}) {
  const el = new Cls();
  for (const [k, v] of Object.entries(attrs)) el._attrs[k] = String(v);
  el._connected = true;
  return el;
}
function done() {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ---- tests -------------------------------------------------------------------

installShim();
const { OrbitRadarChart, niceMax } = await import('../src/o-radar-chart.js');
const render = (attrs) => { const el = make(OrbitRadarChart, attrs); el._render(); return el; };
const cfgOf = (attrs) => make(OrbitRadarChart, attrs).readConfig();
const count = (html, needle) => html.split(needle).length - 1;
const AXES = JSON.stringify(['Speed', 'Power', 'Range', 'Cost', 'Comfort']);

console.log('o-radar-chart: data');
{
  check('niceMax rounds up to 1, 2, 2.5, 5 × 10^n', [niceMax(87), niceMax(9.2), niceMax(2.1), niceMax(100), niceMax(0), niceMax(-3)].join() === '100,10,2.5,100,1,1');
  const single = cfgOf({ label: 'Hero', data: JSON.stringify([{ label: 'A', value: 3 }, { label: 'B', value: 7 }, { label: 'C', value: 5 }]) });
  check('values in data make one series named after label', single.series.length === 1 && single.series[0].label === 'Hero' && single.series[0].values.join() === '3,7,5');
  check('automatic shared max', single.axes.every((a) => a.min === 0 && a.max === 10) && single.shared);
  const two = cfgOf({ data: AXES, series: JSON.stringify([{ label: 'X', values: [1, 2, 3, 4, 5] }, { label: 'Y', values: [5, 4, 3, 2, 1], color: '#123456' }]) });
  check('series with labels and colors', two.series.length === 2 && two.series[1].color === '#123456');
  check('first series follows --ok-fill, the rest the palette', two.series[0].color.startsWith('var(--ok-fill') && /^#/.test(cfgOf({ data: AXES, series: '[{"values":[1]},{"values":[2]}]' }).series[1].color));
  const per = cfgOf({ max: '10', data: JSON.stringify([{ label: 'A' }, { label: 'B', max: 200 }, { label: 'C', min: -5, max: 5 }]), series: '[{"values":[20, 100, 0]}]' });
  check('per-axis max and min', per.axes[1].max === 200 && per.axes[2].min === -5 && !per.shared);
  check('values are clamped to their axis', per.series[0].values[0] === 10);
  check('fractions follow each axis', per.series[0].fractions.join() === '1,0.5,0.5');
  check('missing values sit at the axis min', cfgOf({ data: AXES, series: '[{"values":[1]}]' }).series[0].values.slice(1).every((v) => v === 0));
  check('bad JSON is survivable', cfgOf({ data: '[nope', series: '{' }).axes.length === 0);
  check('axes from series length when data is missing', cfgOf({ series: '[{"values":[1,2,3,4]}]' }).axes.length === 4);
  check('legend: auto with two series, forced, off', cfgOf({ data: AXES, series: '[{"values":[1]},{"values":[2]}]' }).legend && cfgOf({ data: AXES, series: '[{"values":[1]}]', legend: '' }).legend && !cfgOf({ data: AXES, series: '[{"values":[1]},{"values":[2]}]', legend: 'false' }).legend);
  check('levels are clamped', cfgOf({ levels: '40' }).levels === 12 && cfgOf({ levels: '0' }).levels === 1);
}

console.log('\no-radar-chart: structure');
{
  const el = render({ data: AXES, levels: '4', series: '[{"label":"A","values":[1,2,3,4,5]},{"label":"B","values":[5,4,3,2,1]}]' });
  const h = el.innerHTML;
  check('one spoke per axis, one web radius long', count(h, 'ok-rc-spoke') === 5 && h.includes('--o-size-ratio:7.8'));
  check('the web: a ring of chords per level', count(h, 'class="side"') === 20 && count(h, 'ok-rc-level') === 4);
  check('chord corners land on the spokes', h.includes('--o-from:-54deg'));
  check('levels use shrunk lanes', h.includes('orbit-4 ok-rc-level') && h.includes('--o-orbit-ratio:0.1'));
  check('labels: satellites on one ring outside the web', count(h, 'class="ok-rc-label"') === 5 && h.includes('orbit-9 ok-rc-labels'));
  check('the plot is a capsule as wide as the universe', h.includes('style="--o-size-ratio:24"') && h.includes('viewBox="-12 -12 24 24"'));
  check('a polygon and focusable points per series', count(h, 'ok-rc-area') === 2 && count(h, 'class="ok-rc-point"') === 10);
  check('legend buttons and a table fallback', count(h, 'ok-rc-key"') === 2 && h.includes('<div class="ok-sr"><table>'));
  check('scale labels on a shared scale', count(h, 'ok-rc-scale') === 4);
  check('no scale with per-axis ranges', !render({ data: '[{"label":"A","max":5},"B","C"]', series: '[{"values":[1,2,3]}]' }).innerHTML.includes('ok-rc-scale'));
  check('circle grid', count(render({ data: AXES, grid: 'circle', series: '[{"values":[1]}]' }).innerHTML, 'ok-rc-ring') === 4);
  check('fewer than three axes fall back to circles', render({ data: '["A","B"]', series: '[{"values":[1,2]}]' }).innerHTML.includes('ok-rc-ring'));
  check('points="false" drops the points', !render({ data: AXES, points: 'false', series: '[{"values":[1]}]' }).innerHTML.includes('ok-rc-point'));
  check('labels are escaped', !render({ data: '["<b>x</b>","B","C"]', series: '[{"label":"<i>","values":[1]}]' }).innerHTML.includes('<b>'));
  const sig = (s) => { const c = make(OrbitRadarChart, { data: AXES, series: s }); return c.structuralSignature(c.readConfig()); };
  check('new values do not rebuild', sig('[{"values":[1,2,3,4,5]}]') === sig('[{"values":[5,4,3,2,1],"label":"x","color":"red"}]'));
  check('a new series does', sig('[{"values":[1]}]') !== sig('[{"values":[1]},{"values":[2]}]'));
}

console.log('\no-radar-chart: accessibility');
{
  const el = render({ label: 'Cars', data: AXES, series: '[{"values":[1,2,3,4,5]}]' });
  check('role figure with a summary name', el.getAttribute('role') === 'figure' && el.getAttribute('aria-label') === 'Cars: 5 axes, 1 series');
  const own = make(OrbitRadarChart, { 'aria-label': 'Mine', data: AXES });
  own._render();
  check('an author label is kept', own.getAttribute('aria-label') === 'Mine');
  const fmt = render({ data: AXES, series: '[{"values":[1,2,3,4,5]}]', format: 'percent', max: '5' });
  check('values go through the shared format', fmt._valueText(fmt._cfg, 0, 1) === '40%');
  fmt.formatter = (v) => `${v} pts`;
  check('formatter wins', fmt._valueText(fmt._cfg, 0, 2) === '3 pts');
}

done();
