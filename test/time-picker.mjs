/**
 * <o-time-picker> without a browser: min / max / minute-step, keys, typing,
 * the AM / PM switch, events, validity and form reset. browser-time-picker.mjs
 * checks the dial with a real pointer.
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

const { OrbitTimePicker } = await import('../src/o-time-picker.js');

let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`  ✓ ${name}`); };
const make = (attrs) => {
  const el = new OrbitTimePicker();
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.isConnected = true;
  el.connectedCallback();
  return el;
};
const key = (el, seg, k, extra = {}) => {
  let prevented = false;
  const target = { closest: (sel) => (sel === '[data-seg]' ? { dataset: { seg } } : null) };
  el._onKey({ key: k, target, preventDefault: () => { prevented = true; }, ...extra });
  return prevented;
};

console.log('o-time-picker');

test('value is HH:MM, or empty', () => {
  assert.equal(make({ value: '7:05', hours: '24' }).value, '07:05');
  assert.equal(make({ hours: '24' }).value, '');
  assert.equal(make({ value: 'soon', hours: '24' }).value, '');
  assert.equal(make({ value: '22:30', hours: '24' }).valueAsNumber, 1350);
});

test('minute-step snaps; min and max clamp to the closer end', () => {
  assert.equal(make({ value: '10:07', 'minute-step': '15', hours: '24' }).value, '10:00');
  assert.equal(make({ value: '10:08', 'minute-step': '15', hours: '24' }).value, '10:15');
  assert.equal(make({ value: '07:00', min: '09:00', max: '17:00', hours: '24' }).value, '09:00');
  assert.equal(make({ value: '20:00', min: '09:00', max: '17:00', hours: '24' }).value, '17:00');
});

test('a min after max is a window across midnight', () => {
  const el = make({ min: '22:00', max: '06:00', hours: '24' });
  const cfg = el.readConfig();
  assert.equal(el._allowed(23 * 60, cfg), true);
  assert.equal(el._allowed(3 * 60, cfg), true);
  assert.equal(el._allowed(12 * 60, cfg), false);
});

test('fields show the time in the hour cycle; AM / PM only on 12 hours', () => {
  const el = make({ value: '22:35', hours: '12' });
  assert.equal(el.querySelector('[data-seg="hours"]').textContent, '10');
  assert.equal(el.querySelector('[data-seg="minutes"]').textContent, '35');
  assert.equal(el.querySelector('[data-seg="hours"]').getAttribute('aria-valuetext'), '10 PM');
  assert.ok(el.innerHTML.includes('data-period="pm"'));
  const day = make({ value: '22:35', hours: '24' });
  assert.equal(day.querySelector('[data-seg="hours"]').textContent, '22');
  assert.ok(!day.innerHTML.includes('data-period'));
  assert.ok(day.innerHTML.includes('ok-tp-hours-inner'), 'the 24-hour dial has an inner ring');
  assert.equal(make({ hours: '24' }).querySelector('[data-seg="hours"]').textContent, '--');
});

test('arrows step hours round the day and minutes round the hour, skipping what is out of range', () => {
  const el = make({ value: '23:58', hours: '24', 'minute-step': '1' });
  assert.equal(key(el, 'hours', 'ArrowUp'), true);
  assert.equal(el.value, '00:58');
  key(el, 'minutes', 'ArrowUp'); key(el, 'minutes', 'ArrowUp');
  assert.equal(el.value, '00:00', 'minutes wrap without carrying');
  const limited = make({ value: '17:00', min: '09:00', max: '17:30', hours: '24' });
  key(limited, 'hours', 'ArrowUp');
  assert.equal(limited.value, '09:00', 'skips to the next hour in range');
  const stepped = make({ value: '10:00', hours: '24', 'minute-step': '15' });
  key(stepped, 'minutes', 'ArrowDown');
  assert.equal(stepped.value, '10:45');
});

test('keys fire input and change; setting the value fires nothing', () => {
  const el = make({ value: '08:00', hours: '24' });
  el.value = '09:00';
  assert.equal(el.events.length, 0);
  key(el, 'hours', 'ArrowDown');
  assert.deepEqual(el.events.map((e) => [e.type, e.detail.value]), [['input', '08:00'], ['change', '08:00']]);
});

test('typing digits sets a field', () => {
  const el = make({ value: '08:00', hours: '24' });
  key(el, 'hours', '1'); key(el, 'hours', '9');
  assert.equal(el.value, '19:00');
  key(el, 'minutes', '7');
  assert.equal(el.value, '19:07');
  const twelve = make({ value: '20:00', hours: '12' });
  key(twelve, 'hours', '3');
  assert.equal(twelve.value, '15:00', 'keeps the half of the day');
});

test('A and P switch the half of the day', () => {
  const el = make({ value: '09:30', hours: '12' });
  key(el, 'hours', 'p');
  assert.equal(el.value, '21:30');
  key(el, 'minutes', 'a');
  assert.equal(el.value, '09:30');
});

test('required and empty is valueMissing; reset goes back to the markup value', () => {
  assert.equal(make({ required: '', hours: '24' })._formValidity().flags.valueMissing, true);
  assert.deepEqual(make({ required: '', value: '10:00', hours: '24' })._formValidity(), {});
  const el = make({ value: '10:00', hours: '24', name: 't' });
  key(el, 'hours', 'ArrowUp');
  assert.equal(el.value, '11:00');
  assert.equal(el.defaultValue, '10:00');
  el.formResetCallback();
  assert.equal(el.value, '10:00');
});

test('view follows the attribute and the property', () => {
  const el = make({ value: '10:00', hours: '24' });
  assert.equal(el.view, 'hours');
  el.view = 'minutes';
  assert.equal(el.getAttribute('view'), 'minutes');
  assert.equal(el.readConfig().view, 'minutes');
});

console.log(`${count} passed`);
