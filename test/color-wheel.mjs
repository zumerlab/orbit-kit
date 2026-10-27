/** <o-color-wheel> unit tests: no browser. A small DOM shim runs readConfig(), build() and the pure helpers. */
import assert from 'node:assert/strict';

class HTMLElementStub {
  constructor() { this._attrs = {}; this._html = ''; this.style = { setProperty() {}, removeProperty() {} }; this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } }; this.dataset = {}; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  hasAttribute(k) { return k in this._attrs; }
  removeAttribute(k) { delete this._attrs[k]; }
  toggleAttribute(k, on) { if (on) this._attrs[k] = ''; else delete this._attrs[k]; }
  addEventListener() {} removeEventListener() {}
  dispatchEvent(event) { (this.events ||= []).push(event); return true; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; }
  get localName() { return 'o-color-wheel'; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get isConnected() { return true; }
}
globalThis.HTMLElement = HTMLElementStub;
globalThis.customElements = { _r: {}, get(t) { return this._r[t]; }, define(t, c) { this._r[t] = c; } };
globalThis.document = { getElementById() { return null; }, createElement() { return { getContext: () => null }; }, head: { appendChild() {} } };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { OrbitColorWheel, toHex } = await import('../src/o-color-wheel.js');
const { parseColor, rgbToHsv, hsvToRgb, hsvToHsl, hslToHsv, formatColor, colorName, rgbToHex } = await import('../src/color.js');

let pass = 0;
const test = (name, run) => { run(); pass++; console.log(`  ✓ ${name}`); };
const make = (attrs) => { const el = new OrbitColorWheel(); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.connectedCallback(); return el; };

console.log('\no-color-wheel');
test('parses hex, rgb() and hsl(), rejects the rest', () => {
  assert.deepEqual(parseColor('#1e90ff'), { r: 30, g: 144, b: 255 });
  assert.deepEqual(parseColor('#abc'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(parseColor('rgb(30, 144, 255)'), { r: 30, g: 144, b: 255 });
  assert.deepEqual(parseColor('rgb(30 144 255 / .5)'), { r: 30, g: 144, b: 255 });
  assert.equal(toHex('hsl(120, 100%, 50%)'), '#00ff00');
  assert.equal(toHex('hsl(240 100% 50%)'), '#0000ff');
  assert.equal(parseColor('nope'), null, 'no named colors without a browser');
  assert.equal(parseColor(''), null);
});

test('conversions round-trip', () => {
  for (const hex of ['#000000', '#ffffff', '#ff7a6b', '#4fd1c5', '#123456', '#808080']) {
    assert.equal(rgbToHex(hsvToRgb(rgbToHsv(parseColor(hex)))), hex);
    assert.equal(rgbToHex(hsvToRgb(hslToHsv(hsvToHsl(rgbToHsv(parseColor(hex)))))), hex);
  }
  assert.equal(formatColor(parseColor('#1e90ff'), 'rgb'), 'rgb(30, 144, 255)');
  assert.equal(formatColor(parseColor('#1e90ff'), 'hsl'), 'hsl(210, 100%, 56%)');
  assert.equal(formatColor(parseColor('#1e90ff')), '#1e90ff');
});

test('color names', () => {
  assert.equal(colorName('#000'), 'black');
  assert.equal(colorName('#fff'), 'white');
  assert.equal(colorName('#ff0000'), 'vivid red');
  assert.equal(colorName('#ffc0cb'), 'pink');
  assert.equal(colorName('#4fd1c5'), 'teal');
  assert.equal(colorName('#d3d3d3'), 'light gray');
});

test('renders a hue ring, a handle on a ring and the square', () => {
  const el = make({ value: '#1e90ff' });
  const h = el.innerHTML;
  assert.ok(h.includes('ok-cw-ring') && h.includes('ok-cw-hue-ring') && h.includes('ok-cw-area'));
  assert.ok(h.includes('class="orbit-12 ok-cw-hue-ring"') && h.includes('role="slider"'));
  assert.equal(el.value, '#1e90ff');
  assert.equal(el.rgb, 'rgb(30, 144, 255)');
  assert.equal(el.hsl, 'hsl(210, 100%, 56%)');
  assert.equal(el.getAttribute('role'), 'group');
  assert.equal(el.getAttribute('aria-label'), 'Color picker');
  assert.ok(!h.includes('ok-cw-swatch'));
});

test('swatches become satellites; bad ones are dropped', () => {
  const el = make({ swatches: '["#ff0000", {"color":"#00f","label":"Sea"}, "bogus", 5]' });
  const h = el.innerHTML;
  assert.equal((h.match(/class="ok-cw-swatch"/g) || []).length, 2);
  assert.ok(h.includes('aria-label="vivid red, #ff0000"') && h.includes('aria-label="Sea, #0000ff"'));
  assert.ok(h.includes('class="orbit-11 ok-cw-swatches"'));
});

test('form value follows format; a bad value falls back', () => {
  const el = make({ value: '#1e90ff', format: 'hsl' });
  assert.equal(el._formValue(), 'hsl(210, 100%, 56%)');
  el.setAttribute('format', 'rgb');
  assert.equal(el._formValue(), 'rgb(30, 144, 255)');
  assert.equal(make({ value: 'nope' }).value, '#4fd1c5');
});

test('the hue survives gray and black; user changes reflect without moving the default', () => {
  const el = make({ value: '#ff0000' });
  el._commit({ h: 200, s: 0, v: .5 });
  assert.equal(el.value, '#808080');
  el._render();
  assert.equal(Math.round(el._hsv.h), 200, 'hue kept for a gray');
  assert.equal(el.getAttribute('value'), '#808080');
  assert.equal(el.defaultValue, '#ff0000');
  el._commit({ h: 200, s: .7, v: 0 });
  el._render();
  assert.equal(Math.round(el._hsv.s * 10), 7, 'saturation kept for black');
  assert.deepEqual(el.events.map((e) => e.type), ['input', 'input']);
  assert.equal(el.events[0].detail.value, '#808080');
  assert.equal(el.events[0].detail.name, 'gray');
});

console.log(`\n${pass} passed`);
