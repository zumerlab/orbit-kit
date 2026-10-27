/**
 * Shared options (base.js): number format, min/max/step, themes and the
 * FormControl contract, without a browser. browser.mjs checks the same
 * features against real forms, real CSS and real Intl output.
 */
import assert from 'node:assert/strict';

const style = () => {
  const values = new Map();
  return { setProperty: (k, v) => values.set(k, String(v)), getPropertyValue: (k) => values.get(k) || '', getPropertyPriority: () => '', removeProperty: (k) => values.delete(k) };
};
class UnitNode {
  constructor() { this.attrs = new Map(); this.nodes = new Map(); this.style = style(); this.classList = { toggle() {} }; this.textContent = ''; this.isConnected = false; this.events = []; this.listeners = new Map(); }
  hasAttribute(k) { return this.attrs.has(k); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k, v) { const old = this.getAttribute(k); this.attrs.set(k, String(v)); if (this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k, old, String(v)); }
  removeAttribute(k) { const old = this.getAttribute(k); this.attrs.delete(k); if (this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k, old, null); }
  toggleAttribute(k, on) { if (on) this.attrs.set(k, ''); else this.attrs.delete(k); }
  querySelector(k) { if (!this.nodes.has(k)) this.nodes.set(k, new UnitNode()); return this.nodes.get(k); }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) { this.events.push(event); return true; }
  closest() { return null; }
  set innerHTML(v) { this.html = v; this.nodes.clear(); }
  get innerHTML() { return this.html || ''; }
}
globalThis.HTMLElement = UnitNode;
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
globalThis.customElements = { registry: new Map(), get(t) { return this.registry.get(t); }, define(t, c) { this.registry.set(t, c); } };
const injected = [];
globalThis.document = { getElementById: (id) => injected.find((s) => s.id === id) || null, createElement: () => ({}), head: { appendChild: (el) => injected.push(el) } };

const base = await import('../src/base.js');
const { formatNumber, normalizeRange, snapValue, rangeFraction, valueAtAngle, THEMES, FormControl, OrbitKitElement, withShared } = base;
const { OrbitGauge } = await import('../src/o-gauge.js');
const { OrbitKnob } = await import('../src/o-knob.js');
const { OrbitMeter } = await import('../src/o-meter.js');
const { OrbitInstrument } = await import('../src/o-instrument.js');
const { OrbitRings } = await import('../src/o-rings.js');
const { OrbitDonut } = await import('../src/o-donut.js');
const { OrbitRadar } = await import('../src/o-radar.js');
const { OrbitCompass } = await import('../src/o-compass.js');
const { OrbitMenu } = await import('../src/o-menu.js');
const make = (Class, attrs = {}) => { const el = new Class(); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.isConnected = true; el.connectedCallback(); return el; };
const nbsp = (text) => text.replace(/[  ]/g, ' ');
let checks = 0;
const ok = (name, run) => { run(); checks++; };

// ---- formatNumber ------------------------------------------------------------
ok('percent is the share of the range', () => {
  assert.equal(formatNumber(50, { format: 'percent', min: 0, max: 200, locale: 'en' }), '25%');
  assert.equal(formatNumber(72, { format: 'percent', locale: 'en' }), '72%');
  assert.equal(formatNumber(1, { format: 'percent', min: 1, max: 1, locale: 'en' }), '0%');
  assert.equal(formatNumber(1, { format: 'percent', min: 0, max: 3, decimals: 1, locale: 'en' }), '33.3%');
});
ok('decimal, currency, unit and compact use Intl', () => {
  assert.equal(formatNumber(3.14159, { format: 'decimal', decimals: 2, locale: 'en' }), '3.14');
  assert.equal(formatNumber(2, { format: 'decimal', decimals: '1', locale: 'en' }), '2.0');
  assert.equal(nbsp(formatNumber(1234.5, { format: 'currency', currency: 'EUR', locale: 'de-DE' })), '1.234,50 €');
  assert.equal(formatNumber(1234.5, { format: 'currency', locale: 'en-US' }), '$1,234.50');
  assert.equal(formatNumber(88, { format: 'unit', unit: 'kilometer-per-hour', locale: 'en' }), '88 km/h');
  assert.equal(formatNumber(1534000, { format: 'compact', locale: 'en' }), '1.5M');
});
ok('bad locale, currency or unit never throws', () => {
  assert.equal(formatNumber(5, { format: 'currency', currency: 'NOPE!', locale: 'en' }), '5');
  assert.equal(formatNumber(5, { format: 'unit', unit: 'parsec-per-banana', locale: 'en' }), '5 parsec-per-banana');
  assert.equal(formatNumber(5, { locale: 'xx-invalid-@@' }), '5');
  assert.equal(formatNumber(NaN), '');
});

// ---- normalizeRange / snapValue ------------------------------------------------
ok('ranges behave like <input type=range>', () => {
  assert.deepEqual(normalizeRange({ min: 10, max: 5 }), { min: 10, max: 10, span: 0, step: 0 });
  assert.equal(normalizeRange({ min: 0, max: 10, step: 'any' }).step, 0);
  assert.equal(snapValue(4, { min: 1, max: 10, step: 2 }), 5);
  assert.equal(snapValue(10, { min: 0, max: 10, step: 6 }), 10, 'max stays reachable');
  assert.equal(snapValue(1.2000000001, { min: 1, max: 2, step: .1 }), 1.2);
  assert.equal(snapValue(99, { min: 0, max: 10, step: 0 }), 10);
  assert.equal(snapValue('oops', { min: 3, max: 10, step: 1 }), 3);
  assert.equal(rangeFraction(5, { min: 0, max: 0 }), 0);
  assert.equal(valueAtAngle(90, { from: 0, range: 360, min: 0, max: 100 }), 25);
  assert.equal(valueAtAngle(200, { from: 225, range: 270, min: 0, max: 100 }), 0, 'past a partial arc: nearest end');
});

// ---- format attributes on components -----------------------------------------
ok('no format attribute keeps the 1.0 text', () => {
  const g = make(OrbitGauge, { value: '72', unit: '%' });
  assert.equal(g._center.textContent, '72%');
  assert.equal(g.getAttribute('aria-valuetext'), '72%');
});
ok('format="percent" reads the range', () => {
  const g = make(OrbitGauge, { value: '50', max: '200', format: 'percent', locale: 'en' });
  assert.equal(g._center.textContent, '25%');
  assert.equal(g.getAttribute('aria-valuetext'), '25%');
  assert.equal(g.getAttribute('aria-valuenow'), '50');
});
ok('currency and locale', () => {
  const g = make(OrbitGauge, { value: '1234.5', max: '5000', currency: 'EUR', locale: 'de-DE' });
  assert.equal(nbsp(g._center.textContent), '1.234,50 €');
});
ok('format="unit" turns unit into an Intl unit; plain unit stays text', () => {
  const k = make(OrbitKnob, { value: '88', max: '240', format: 'unit', unit: 'kilometer-per-hour', locale: 'en' });
  assert.equal(k._readout.textContent, '88 km/h');
  assert.equal(k.getAttribute('aria-valuetext'), '88 km/h');
  const plain = make(OrbitKnob, { value: '88', max: '240', unit: ' km/h' });
  assert.equal(plain._readout.textContent, '88 km/h');
  const decimals = make(OrbitKnob, { value: '0.5', max: '1', step: '0.25', decimals: '2', unit: ' V', locale: 'en' });
  assert.equal(decimals._readout.textContent, '0.50 V');
});
ok('the formatter property takes over every number', () => {
  const g = make(OrbitGauge, { value: '30', unit: '%' });
  const seen = [];
  g.formatter = (value, ctx) => { seen.push(ctx.kind); return `~${value}`; };
  assert.equal(g._center.textContent, '~30', 'formatter output has no unit appended');
  assert.ok(seen.includes('aria'));
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try { g.formatter = () => { throw new Error('boom'); }; g.setAttribute('value', '40'); g.setAttribute('value', '41'); } finally { console.warn = warn; }
  assert.equal(g._center.textContent, '41%', 'a throwing formatter falls back');
  assert.equal(warned, 1, 'and warns once');
  g.formatter = null;
  assert.equal(g._center.textContent, '41%');
});
ok('a formatter set before the element upgrades still works', () => {
  const g = new OrbitGauge();
  Object.defineProperty(g, 'formatter', { value: (v) => `#${v}`, writable: true, configurable: true, enumerable: true });
  g.setAttribute('value', '7'); g.isConnected = true; g.connectedCallback();
  assert.equal(g._center.textContent, '#7');
  assert.ok(!Object.hasOwn(g, 'formatter'));
});
ok('instrument tick labels and readout follow the format', () => {
  const i = make(OrbitInstrument, { min: '0', max: '1000000', ticks: '3', value: '250000', format: 'compact', locale: 'en' });
  assert.match(i.innerHTML, /ok-inst-num">0<\/div>/);
  assert.match(i.innerHTML, /ok-inst-num">500K<\/div>/);
  assert.match(i.innerHTML, /ok-inst-num">1M<\/div>/);
  assert.equal(i._value.textContent, '250K');
  i.formatter = (v, ctx) => (ctx.kind === 'tick' ? `t${v}` : `v${v}`);
  assert.match(i.innerHTML, /ok-inst-num">t500000<\/div>/);
  const p = make(OrbitInstrument, { preset: 'tachometer', format: 'percent', locale: 'en' });
  assert.match(p.innerHTML, /ok-inst-num">50%<\/div>/);
});
ok('meter, donut, rings, radar and compass format their numbers', () => {
  const m = make(OrbitMeter, { value: '0.426', max: '1', format: 'percent', decimals: '1', locale: 'en' });
  assert.equal(m._readout.textContent, '42.6%');
  const d = make(OrbitDonut, { data: '[{"value":30,"label":"A"},{"value":10,"label":"B"}]', format: 'percent', locale: 'en' });
  assert.match(d.getAttribute('aria-label'), /A: 75%; B: 25%/);
  const r = make(OrbitRings, { data: '[{"value":6000,"max":10000,"label":"Steps"}]', format: 'compact', locale: 'en' });
  assert.match(r.getAttribute('aria-label'), /Steps: 6K of 10K/);
  const c = make(OrbitCompass, { heading: '45.5', format: 'decimal', decimals: '1', locale: 'en' });
  assert.equal(c._deg.textContent, '45.5°');
  const radar = make(OrbitRadar, { max: '50', format: 'unit', unit: 'kilometer', locale: 'en', targets: '[{"angle":10,"dist":25,"label":"Ship"}]' });
  assert.equal(radar.readConfig().targets[0].dist, .5);
  assert.match(radar.getAttribute('aria-label'), /Ship: 10 degrees, distance 25 km/);
});

// ---- min / max / step ----------------------------------------------------------
ok('display components clamp, snap and expose aria ranges', () => {
  const g = make(OrbitGauge, { min: '10', max: '20', step: '5', value: '17' });
  assert.equal(g.readConfig().value, 15);
  assert.equal(g._fill.getAttribute('value'), '50.00');
  assert.deepEqual(['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map((a) => g.getAttribute(a)), ['10', '20', '15']);
  g.setAttribute('value', '99');
  assert.equal(g._center.textContent, '20', 'the readout shows the clamped value');
  const m = make(OrbitMeter, { min: '0', max: '10', step: '2', value: '3.2' });
  assert.equal(m.getAttribute('aria-valuenow'), '4');
  const i = make(OrbitInstrument, { min: '5', max: '1', value: '3' });
  assert.equal(i.getAttribute('aria-valuemax'), '5', 'a max below min becomes min');
});
ok('rings take min/max defaults; spacing replaces step', () => {
  const r = make(OrbitRings, { min: '50', max: '150', data: '[{"value":100},{"value":10,"min":0,"max":20}]' });
  const cfg = r.readConfig();
  assert.deepEqual(cfg.data.map((d) => [d.min, d.max, d.value]), [[50, 150, 100], [0, 20, 10]]);
  assert.match(r.innerHTML, /value="50" max="100"/);
  assert.equal(make(OrbitRings, { spacing: '2', data: '[{"value":1},{"value":2}]' }).readConfig().spacing,
    make(OrbitRings, { step: '2', data: '[{"value":1},{"value":2}]' }).readConfig().spacing);
});
ok('knob keys use the shared step logic', () => {
  const k = make(OrbitKnob, { min: '0', max: '1', step: 'any', value: '0.5' });
  k._onKey({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(k.value, .51, 'step="any" moves a hundredth of the range');
  k._onKey({ key: 'PageDown', preventDefault() {} });
  assert.equal(k.value, .41);
  assert.equal(k.events.map((e) => e.type).join(), 'input,change,input,change');
  k.stepUp(); assert.equal(k.value, .42);
  assert.equal(k.events.length, 4, 'stepUp from code fires no event');
});

// ---- themes --------------------------------------------------------------------
ok('themes are zero-specificity token sets', () => {
  const css = injected.find((s) => s.id === 'orbit-kit-base').textContent;
  for (const name of ['dark', 'light', 'glass']) {
    assert.ok(css.includes(`:where([theme~="${name}"], .ok-theme-${name})`), name);
    for (const token of ['--ok-fill', '--ok-track', '--ok-text', '--ok-face', '--ok-hand']) assert.ok(THEMES[name][token], `${name} ${token}`);
  }
  assert.doesNotMatch(css, /:root|html\s*\{/, 'nothing is themed without a theme');
  assert.ok(css.includes('backdrop-filter: var(--ok-backdrop, none)'));
});
ok('menu keeps theme="color" and adds palette', () => {
  const items = '[{"label":"A"}]';
  assert.equal(make(OrbitMenu, { items, theme: 'color' }).readConfig().theme, 'color');
  assert.equal(make(OrbitMenu, { items, theme: 'color light' }).readConfig().theme, 'color');
  assert.equal(make(OrbitMenu, { items, theme: 'light' }).readConfig().theme, 'mono');
  assert.equal(make(OrbitMenu, { items, palette: 'color', theme: 'dark' }).readConfig().theme, 'color');
});

// ---- FormControl -----------------------------------------------------------------
class FakeInternals {
  constructor() { this.value = undefined; this.flags = {}; this.form = null; this.labels = []; }
  setFormValue(value, state) { this.value = value; this.state = state; }
  setValidity(flags, message) { this.flags = flags; this.message = message; }
  get validity() { return { valid: !Object.values(this.flags).some(Boolean), ...this.flags }; }
  checkValidity() { return this.validity.valid; }
}
for (const Class of [OrbitKnob, OrbitMenu]) Class.prototype.attachInternals = function () { return new FakeInternals(); };

ok('the mixin is reusable and form-associated', () => {
  class Probe extends FormControl(OrbitKitElement) {
    static get observedAttributes() { return withShared(['value'], ['name', 'disabled']); }
    readConfig() { return {}; } build() {} get value() { return this.getAttribute('value'); } set value(v) { this._reflectValue(String(v)); }
  }
  assert.equal(Probe.formAssociated, true);
  assert.equal(OrbitKnob.formAssociated, true);
  assert.equal(OrbitMenu.formAssociated, true);
  assert.equal(typeof new Probe().checkValidity(), 'boolean', 'works without ElementInternals');
});
ok('knob submits, resets to its default and restores state', () => {
  const k = make(OrbitKnob, { name: 'volume', value: '30' });
  assert.equal(k._internals.value, '30');
  k._onKey({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(k._internals.value, '31');
  assert.equal(k.getAttribute('value'), '31', 'the attribute shows the current value');
  assert.equal(k.defaultValue, '30', 'user input does not move the default');
  k.formResetCallback();
  assert.equal(k.value, 30); assert.equal(k._internals.value, '30');
  k.formStateRestoreCallback('44');
  assert.equal(k.value, 44); assert.equal(k.defaultValue, '30');
  k.setAttribute('value', '50');
  assert.equal(k.defaultValue, '50', 'the author setting the attribute moves the default');
  k.formDisabledCallback(true);
  assert.equal(k.tabIndex, -1); assert.equal(k.getAttribute('aria-disabled'), 'true');
  k._onKey({ key: 'ArrowUp', preventDefault() { throw new Error('disabled by fieldset'); } });
  k.formDisabledCallback(false);
  assert.equal(k.tabIndex, 0);
  k.disabled = true; assert.ok(k.hasAttribute('disabled')); k.disabled = false;
  k.name = 'gain'; assert.equal(k.getAttribute('name'), 'gain');
});
ok('menu selects by value, validates required and fires input/change', () => {
  const items = JSON.stringify([{ label: 'Edit', children: [{ label: 'Cut', value: 'cut' }, { label: 'Copy', value: { id: 2 } }] }, { label: 'Quit', value: 'quit' }]);
  const menu = make(OrbitMenu, { items, name: 'action', value: 'cut' });
  assert.equal(menu.value, 'cut'); assert.equal(menu._internals.value, 'cut');
  assert.deepEqual(menu._selectedPath, [0, 0]);
  menu._activateAt(0, 1);
  assert.equal(menu.value, 'quit');
  assert.deepEqual(menu.events.slice(-3).map((e) => e.type), ['select', 'input', 'change']);
  menu.formResetCallback();
  assert.equal(menu.value, 'cut', 'reset returns to the value attribute');
  menu.value = '{"id":2}';
  assert.deepEqual(menu.value, { id: 2 }); assert.equal(menu._internals.value, '{"id":2}');
  menu.value = null;
  assert.equal(menu.value, undefined); assert.equal(menu._internals.value, null);
  menu.setAttribute('required', '');
  assert.equal(menu._internals.flags.valueMissing, true);
  menu.value = 'quit';
  assert.equal(menu._internals.flags.valueMissing, undefined);
  menu.setAttribute('disabled', '');
  const before = menu.events.length; menu._activateAt(0, 0);
  assert.equal(menu.events.length, before, 'a disabled menu ignores picks');
  assert.match(menu.innerHTML, /aria-disabled="true"/);
});

console.log(`Shared options (format, min/max/step, themes, forms): ${checks} groups passed.`);
