/** <o-wheel> unit tests: no browser. A small DOM shim runs readConfig(), build() and the pure helpers. */
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
  get localName() { return 'o-wheel'; }
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

const { OrbitWheel, normalizeItems, pickByWeight, segmentAt, parseSeconds, easeOut, WHEEL_PALETTE } = await import('../src/o-wheel.js');
const { contrastText, colorName } = await import('../src/color.js');

let pass = 0;
const test = (name, run) => { run(); pass++; console.log(`  ✓ ${name}`); };
const make = (attrs) => { const el = new OrbitWheel(); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el._render(); return el; };

console.log('\no-wheel');
test('items: strings and objects, weights, colors that never repeat side by side', () => {
  const items = normalizeItems(['A', { label: 'B', weight: 2, color: '#123456' }, { label: 'C', weight: 0 }, { weight: -1 }, 7, null, 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(items.map((i) => i.label), ['A', 'B', '7', 'D', 'E', 'F', 'G', 'H']);
  assert.equal(items[1].color, '#123456');
  for (let i = 0; i < items.length; i++) assert.notEqual(items[i].color, items[(i + 1) % items.length].color, `items ${i} and ${i + 1}`);
  assert.equal(normalizeItems(Array.from({ length: 300 }, (_, i) => String(i))).length, 100, 'at most 100 items');
  assert.equal(normalizeItems('nope').length, 0);
  assert.equal(normalizeItems([{ label: 'x', color: 'red;background:url(x)' }])[0].color, WHEEL_PALETTE[0], 'unsafe colors fall back');
});

test('segments are sized by weight and stack from 12 o\'clock', () => {
  const el = make({ items: '[{"label":"A","weight":1},{"label":"B","weight":3}]' });
  const h = el.innerHTML;
  assert.match(h, /value="25"/);
  assert.match(h, /value="75"/);
  assert.equal((h.match(/ok-wheel-seg/g) || []).length, 2);
  assert.ok(h.includes('ok-wheel-rotor') && h.includes('ok-wheel-pointer') && h.includes('ok-wheel-spin'));
  assert.ok(h.includes('--o-from:45deg') && h.includes('--o-from:225deg'), 'labels sit at the middle of their segments');
  assert.ok(h.includes('rotate:-45deg'), 'the first segment starts under the pointer');
  const cfg = el.readConfig();
  assert.equal(segmentAt(10, cfg.bounds), 0);
  assert.equal(segmentAt(100, cfg.bounds), 1);
  assert.equal(segmentAt(-10, cfg.bounds), 1);
});

test('labels across, along or none; text is escaped and dark on light colors', () => {
  const across = make({ items: '["<b>x</b>"]' }).innerHTML;
  assert.ok(across.includes('&lt;b&gt;x&lt;/b&gt;') && !across.includes('<b>'));
  assert.ok(across.includes('color:#0c0f13'));
  const along = make({ items: '["A","B"]', labels: 'along' }).innerHTML;
  assert.ok(along.includes('ok-wheel-text') && !along.includes('ok-wheel-label'));
  const none = make({ items: '["A","B"]', labels: 'none' }).innerHTML;
  assert.ok(!none.includes('ok-wheel-text') && !none.includes('ok-wheel-label'));
  assert.ok(make({ items: '["A"]', controls: 'false' }).innerHTML.includes('ok-wheel-cap'), 'no button without controls');
  assert.equal(contrastText('#0c0f13'), '#ffffff');
  assert.equal(contrastText('#ffb547'), '#0c0f13');
});

test('a fair pick by weight', () => {
  const items = normalizeItems([{ label: 'a', weight: 1 }, { label: 'b', weight: 3 }]);
  assert.equal(pickByWeight(items, 0), 0);
  assert.equal(pickByWeight(items, .2499), 0);
  assert.equal(pickByWeight(items, .25), 1);
  assert.equal(pickByWeight(items, .9999), 1);
  const counts = [0, 0];
  for (let i = 0; i < 4000; i++) counts[pickByWeight(items, i / 4000)]++;
  assert.deepEqual(counts, [1000, 3000]);
});

test('durations, easing and an empty wheel', () => {
  assert.equal(parseSeconds('4'), 4);
  assert.equal(parseSeconds('2.5s'), 2.5);
  assert.equal(parseSeconds('1500ms'), 1.5);
  assert.equal(parseSeconds('soon', 5), 5);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(.5) > .9, 'most of the turn happens early');
  const empty = make({});
  assert.equal(empty.getAttribute('aria-label'), 'Empty wheel');
  return empty.spin().then((r) => assert.equal(r, null));
});

test('the accessible name lists the items; color names', () => {
  const el = make({ items: '["Red","Green"]' });
  assert.equal(el.getAttribute('role'), 'group');
  assert.equal(el.getAttribute('aria-label'), 'Wheel: Red, Green');
  const btn = make({ items: '["Red"]', controls: 'false' });
  assert.equal(btn.getAttribute('role'), 'button');
  assert.equal(colorName('#0000ff'), 'vivid blue');
  assert.equal(colorName('#1e3a8a'), 'dark blue');
  assert.equal(colorName('#808080'), 'gray');
  assert.equal(colorName('#8b4513'), 'brown');
});

console.log(`\n${pass} passed`);
