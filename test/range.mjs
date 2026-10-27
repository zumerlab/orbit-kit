/**
 * <o-range> without a browser: time and number parsing, the span rules,
 * dragging math, markup, events and form reset. browser-range.mjs checks
 * the same against real pointer, keys and forms.
 */
import assert from 'node:assert/strict';

const style = () => {
  const values = new Map();
  return { setProperty: (k, v) => values.set(k, String(v)), getPropertyValue: (k) => values.get(k) || '', getPropertyPriority: () => '', removeProperty: (k) => values.delete(k) };
};
class UnitNode {
  constructor() { this.attrs = new Map(); this.nodes = new Map(); this.style = style(); this.classList = { add() {}, remove() {}, toggle() {} }; this.textContent = ''; this.isConnected = false; this.events = []; this.dataset = {}; }
  hasAttribute(k) { return this.attrs.has(k); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k, v) { const old = this.getAttribute(k); this.attrs.set(k, String(v)); if (this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k, old, String(v)); }
  removeAttribute(k) { const old = this.getAttribute(k); this.attrs.delete(k); if (this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k, old, null); }
  toggleAttribute(k, on) { if (on) this.attrs.set(k, ''); else this.attrs.delete(k); }
  querySelector(k) { if (!this.nodes.has(k)) this.nodes.set(k, new UnitNode()); return this.nodes.get(k); }
  querySelectorAll() { return []; }
  addEventListener() {} removeEventListener() {} focus() {}
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

const { OrbitRange, parseClock, clockValue, clockText, spanParts, splitPair, twelveHour } = await import('../src/o-range.js');

let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`  ✓ ${name}`); };
const make = (attrs) => {
  const el = new OrbitRange();
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.isConnected = true;
  el.connectedCallback();
  return el;
};

console.log('o-range');

test('clock helpers parse and print times', () => {
  assert.equal(parseClock('22:30'), 1350);
  assert.equal(parseClock('7:05'), 425);
  assert.equal(parseClock('24:00'), 0);
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('nope'), null);
  assert.equal(clockValue(405), '06:45');
  assert.equal(clockValue(1440 + 30), '00:30');
  assert.equal(clockText(1350, true), '10:30 PM');
  assert.equal(clockText(0, true), '12:00 AM');
  assert.equal(clockText(1350, false), '22:30');
  assert.deepEqual(spanParts(495), [[8, 'h'], [15, 'min']]);
  assert.deepEqual(spanParts(45), [[45, 'min']]);
  assert.deepEqual(spanParts(480), [[8, 'h']]);
  assert.equal(twelveHour('en-US'), true);
  assert.equal(twelveHour('de-DE'), false);
});

test('pairs split on a dash, also with negative numbers', () => {
  assert.deepEqual(splitPair('20-80'), ['20', '80']);
  assert.deepEqual(splitPair('-10--5'), ['-10', '-5']);
  assert.deepEqual(splitPair('22:30-06:45'), ['22:30', '06:45']);
  assert.deepEqual(splitPair([1, 2]), ['1', '2']);
  assert.deepEqual(splitPair({ start: 3, end: 4 }), ['3', '4']);
  assert.equal(splitPair('20'), null);
});

test('time mode wraps through midnight and reads the span', () => {
  const el = make({ mode: 'time', hours: '24', start: '22:30', end: '06:45' });
  const cfg = el.readConfig();
  assert.equal(cfg.wrap, true);
  assert.equal(cfg.span, 495);
  assert.equal(el.value, '22:30-06:45');
  assert.equal(el.start, '22:30');
  assert.equal(el.span, 495);
  assert.equal(el.querySelector('.ok-range-span').innerHTML, '8<small>h</small>15<small>min</small>');
  assert.equal(el.querySelector('.ok-range-times').textContent, '22:30 – 06:45');
  assert.equal(el.getAttribute('role'), 'group');
  assert.equal(el.getAttribute('aria-label'), 'Time range');
});

test('time values snap to the step (5 minutes by default)', () => {
  const el = make({ mode: 'time', start: '22:32', end: '06:44' });
  assert.equal(el.value, '22:30-06:45');
});

test('numbers: min, max, step and a span readout with the unit', () => {
  const el = make({ start: '20', end: '80', unit: '%' });
  assert.equal(el.value, '20-80');
  assert.equal(el.querySelector('.ok-range-span').innerHTML, '60%');
  const swapped = make({ start: '70', end: '30' });
  assert.equal(swapped.value, '70-70', 'without wrap the end never comes before the start');
  const clamped = make({ min: '0', max: '10', start: '-5', end: '50' });
  assert.equal(clamped.value, '0-10');
});

test('min-span and max-span move the end first', () => {
  assert.equal(make({ start: '40', end: '45', 'min-span': '20' }).value, '40-60');
  assert.equal(make({ start: '10', end: '90', 'max-span': '50' }).value, '10-60');
  assert.equal(make({ start: '95', end: '96', 'min-span': '20' }).value, '80-100', 'at the top the start gives way');
  assert.equal(make({ mode: 'time', start: '22:00', end: '06:00', 'max-span': '4:00' }).value, '22:00-02:00');
});

test('dragging a handle past the other one pushes it', () => {
  const el = make({ mode: 'time', start: '22:00', end: '23:00', 'min-span': '30' });
  const cfg = el.readConfig();
  const [s, e] = el._solve('start', 60, cfg, cfg);
  assert.deepEqual([clockValue(s), clockValue(e)], ['23:00', '23:30']);
  const [s2, e2] = el._solve('end', -120, cfg, cfg);
  assert.deepEqual([clockValue(s2), clockValue(e2)], ['20:30', '21:00']);
});

test('the band moves both ends; without wrap it stops at the ends', () => {
  const el = make({ start: '20', end: '80' });
  const cfg = el.readConfig();
  assert.deepEqual(el._solve('band', 10, cfg, cfg), [30, 90]);
  assert.deepEqual(el._solve('band', 50, cfg, cfg), [40, 100]);
  const time = make({ mode: 'time', start: '22:00', end: '06:00' });
  const tc = time.readConfig();
  assert.deepEqual(time._solve('band', 180, tc, tc).map(clockValue), ['01:00', '09:00']);
});

test('user changes fire input and change with the pair; code fires nothing', () => {
  const el = make({ mode: 'time', hours: '24', start: '22:00', end: '06:00' });
  const cfg = el.readConfig();
  el._commit(el._solve('end', 30, cfg, cfg), { change: true });
  assert.deepEqual(el.events.map((ev) => ev.type), ['input', 'change']);
  assert.deepEqual(el.events[0].detail, { value: '22:00-06:30', start: '22:00', end: '06:30', span: 510 });
  assert.equal(el.events[0].bubbles, true);
  el.value = '23:00-07:00';
  assert.equal(el.value, '23:00-07:00');
  assert.equal(el.events.length, 2);
});

test('form reset goes back to the start and end from the markup', () => {
  const el = make({ start: '20', end: '80', name: 'range' });
  el.value = '30-50';
  assert.equal(el.getAttribute('start'), '30');
  assert.equal(el._formValue(), '30-50');
  assert.equal(el.defaultValue, '20-80');
  el.formResetCallback();
  assert.equal(el.value, '20-80');
});

test('markup: interactive track and band, two slider handles, ticks and numbers', () => {
  const el = make({ mode: 'time', hours: '12', 'start-icon': 'moon', 'end-icon': '<img src=x onerror=alert(1)>' });
  const h = el.innerHTML;
  assert.match(h, /class="inner-orbit ok-track ok-range-track" interactive/);
  assert.match(h, /ok-range-band" interactive/);
  assert.equal((h.match(/role="slider"/g) || []).length, 2);
  assert.equal((h.match(/ok-range-tick/g) || []).length, 48);
  assert.ok(h.includes('12<small>AM</small>') && h.includes('6<small>PM</small>'));
  assert.ok(h.includes('<svg viewBox="0 0 16 16"'), 'built-in icon');
  assert.ok(!h.includes('<img'), 'icons are escaped');
  const partial = make({ start: '0', end: '50', range: '270' });
  assert.ok(partial.innerHTML.includes('fit-range'));
  assert.equal(partial.querySelector('.ok-range-band-ring').style.getPropertyValue('--o-from'), '225deg');
});

test('handles carry aria values; disabled takes them out of the tab order', () => {
  const el = make({ mode: 'time', hours: '24', start: '22:30', end: '06:45', 'start-label': 'Bedtime', disabled: '' });
  const start = el.querySelector('[data-handle="start"]');
  assert.equal(start.getAttribute('aria-valuenow'), '1350');
  assert.equal(start.getAttribute('aria-valuetext'), '22:30, span 8 h 15 min');
  assert.equal(start.getAttribute('aria-label'), 'Bedtime');
  assert.equal(start.tabIndex, -1);
});

test('a formatter can write the span', () => {
  const el = make({ start: '10', end: '30' });
  el.formatter = (v, { kind }) => (kind === 'span' ? `${v} units` : null);
  assert.equal(el.querySelector('.ok-range-span').innerHTML, '20 units');
});

console.log(`${count} passed`);
