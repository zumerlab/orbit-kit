/**
 * <o-sunburst> without a browser: the tree, the markup and the zoom layout.
 * browser-sunburst.mjs checks the same against real Orbit arcs.
 */
import assert from 'node:assert/strict';

const style = () => {
  const values = new Map();
  return { setProperty: (k, v) => values.set(k, String(v)), getPropertyValue: (k) => values.get(k) || '', getPropertyPriority: () => '', removeProperty: (k) => values.delete(k) };
};
class UnitNode {
  constructor() { this.attrs = new Map(); this.nodes = new Map(); this.style = style(); this.dataset = {}; this.classList = { toggle() {}, add() {}, remove() {} }; this.textContent = ''; this.isConnected = false; this.events = []; }
  hasAttribute(k) { return this.attrs.has(k); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k, v) { const old = this.getAttribute(k); this.attrs.set(k, String(v)); if (this.isConnected && this.constructor.observedAttributes?.includes(k)) this.attributeChangedCallback?.(k, old, String(v)); }
  removeAttribute(k) { this.attrs.delete(k); }
  toggleAttribute(k, on) { if (on) this.attrs.set(k, ''); else this.attrs.delete(k); }
  querySelector(k) { if (!this.nodes.has(k)) this.nodes.set(k, new UnitNode()); return this.nodes.get(k); }
  querySelectorAll() { return []; }
  addEventListener() {} removeEventListener() {}
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

const { OrbitSunburst, normalizeTree } = await import('../src/o-sunburst.js');

let passed = 0;
const test = (name, run) => { run(); passed++; console.log(`  ✓ ${name}`); };
const make = (attrs) => {
  const el = new OrbitSunburst();
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.isConnected = true;
  el._render();
  return el;
};
const DATA = [
  { label: 'Work', children: [{ label: 'Meetings', value: 12 }, { label: 'Focus', children: [{ label: 'Code', value: 14 }, { label: 'Docs', value: 5 }] }] },
  { label: 'Home', value: 30, children: [{ label: 'Cooking', value: 8 }, { label: 'Chores', value: 9 }] },
  { label: 'Rest', value: 20, color: '#123456' }
];

console.log('\no-sunburst');

test('a node is worth its value or the sum of its children, whichever is larger', () => {
  const root = normalizeTree(DATA);
  assert.equal(root.value, 31 + 30 + 20);
  assert.deepEqual(root.children.map((n) => n.value), [31, 30, 20]);
  assert.equal(root.children[0].children[1].value, 19);
  assert.equal(normalizeTree([{ value: 2, children: [{ value: 5 }] }]).value, 5, 'children win over a smaller value');
  assert.equal(normalizeTree({ label: 'All', children: [{ value: -4 }, { value: 'x' }, { value: 3 }] }).value, 3, 'negative and invalid values count as 0');
  assert.equal(normalizeTree(null).value, 0);
});

test('keys, depths and labels', () => {
  const root = normalizeTree(DATA);
  const code = root.children[0].children[1].children[0];
  assert.deepEqual([code.key, code.depth, code.label, code.parent.label], ['0.1.0', 3, 'Code', 'Focus']);
  assert.equal(normalizeTree([{ value: 1 }]).children[0].label, 'Item 1', 'a missing label gets a name');
});

test('colors: the palette by top-level branch, lighter shades below, own colors win', () => {
  const root = normalizeTree(DATA);
  const [work, home, rest] = root.children;
  assert.equal(work.fill, '#4fd1c5');
  assert.equal(home.fill, '#ffb547');
  assert.equal(rest.fill, '#123456');
  assert.match(work.children[0].fill, /^color-mix\(in oklab, #4fd1c5 \d+%, var\(--ok-sunburst-tint, #fff\)\)$/);
  const share = (fill) => Number(/ (\d+)%/.exec(fill)[1]);
  assert.ok(share(work.children[1].children[0].fill) < share(work.children[0].fill), 'deeper is lighter');
  assert.ok(share(work.children[1].fill) < share(work.children[0].fill), 'later siblings a bit lighter');
  assert.equal(normalizeTree([{ color: 'red;x:y', value: 1 }]).children[0].fill, '#4fd1c5', 'unsafe colors are ignored');
});

test('deeper than eight levels counts as one slice', () => {
  let item = { value: 1 };
  for (let i = 0; i < 12; i++) item = { label: `L${i}`, children: [item] };
  const root = normalizeTree([item]);
  let depth = 0;
  const walk = (n) => { depth = Math.max(depth, n.depth); n.children.forEach(walk); };
  walk(root);
  assert.equal(depth, 8);
  assert.equal(root.value, 1);
});

test('markup: one ring per depth, arcs with values, spacers where a branch ends early', () => {
  const el = make({ data: JSON.stringify(DATA) });
  const h = el.innerHTML;
  assert.equal((h.match(/class="orbit-12 ok-sb-ring/g) || []).length, 3);
  assert.equal((h.match(/ok-sb-node/g) || []).length, 3 + 4 + 2);
  assert.ok(/data-depth="3"[^>]*>(?:<o-arc[^>]*><\/o-arc>)*/.test(h));
  // Ring 2: Meetings, Focus, Cooking, Chores, Home's remainder (13), Rest's spacer (20).
  const ring2 = h.split('data-depth="2"')[1].split('</div>')[0];
  assert.deepEqual([...ring2.matchAll(/data-(?:key|owner)="([\d.]+)"(?: data-amount="([\d.]+)")?/g)].map((m) => m[2] ? `${m[1]}+${m[2]}` : m[1]), ['0.0', '0.1', '1.0', '1.1', '1+13', '2+20']);
  assert.ok(h.includes('interactive') && h.includes('inner-orbit') && !h.includes('--o-force'));
  assert.ok(h.includes('aria-hidden="true"'), 'the drawing is hidden from assistive tech');
});

test('accessible tree fallback with levels, positions and names', () => {
  const el = make({ data: JSON.stringify(DATA), unit: ' h' });
  const h = el.innerHTML;
  assert.equal((h.match(/role="treeitem"/g) || []).length, 9);
  assert.ok(h.includes('aria-level="3" aria-setsize="2" aria-posinset="1"'));
  assert.ok(h.includes('<ul role="group">'));
  assert.equal(el.getAttribute('role'), 'tree');
  assert.equal(el.getAttribute('aria-label'), 'Sunburst chart');
  assert.equal(el._nodeText(el._nodes.get('0.1')), 'Focus: 19 h, 61% of Work');
  assert.equal(el._nodeText(el._nodes.get('2')), 'Rest: 20 h, 25% of the total');
});

test('number format: format attributes, percent of the total and a formatter', () => {
  const el = make({ data: JSON.stringify(DATA), format: 'percent', label: 'Week' });
  assert.equal(el._valueText(40.5), '50%');
  const money = make({ data: JSON.stringify(DATA), currency: 'EUR', locale: 'de-DE' });
  assert.equal(money._valueText(1234.5).replace(/\s/g, ' '), '1.234,50 €');
  const plain = make({ data: JSON.stringify(DATA) });
  assert.equal(plain._valueText(12345.678), '12,345.678');
  plain.formatter = (v) => `${v} pts`;
  assert.equal(plain._valueText(3), '3 pts');
});

test('zoom layout: shares nest in their parents and fill the ring', () => {
  const el = make({ data: JSON.stringify(DATA) });
  const cfg = el._cfg;
  // Fake arcs from the markup, in ring order, the way build() finds them.
  const rings = [];
  for (const part of el.innerHTML.split('data-depth="').slice(1)) {
    const depth = Number(part.slice(0, part.indexOf('"')));
    const ring = { dataset: { depth } };
    ring.items = [...part.split('</div>')[0].matchAll(/data-(key|owner)="([\d.]+)"(?: data-amount="([\d.]+)")?/g)].map((m) => ({ el: { ring }, kind: m[1], key: m[2], amount: Number(m[3]) }));
    rings.push(ring);
  }
  el._rings = rings;
  el._arcs = rings.flatMap((r) => r.items.filter((i) => i.kind === 'key').map((i) => ({ el: i.el, node: el._nodes.get(i.key), item: i })));
  el._spacers = rings.flatMap((r) => r.items.filter((i) => i.kind === 'owner').map((i) => ({ el: i.el, owner: el._nodes.get(i.key), amount: i.amount })));
  const spans = (state) => {
    const out = new Map();
    for (const ring of rings) {
      let at = 0;
      for (const i of ring.items) { const s = state.shares.get(i.el); if (i.kind === 'key') out.set(i.key, [at, at + s]); at += s; }
      ring.total = at;
    }
    return out;
  };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  for (const key of ['', '0', '0.1', '1']) {
    const root = key ? el._nodes.get(key) : cfg.root;
    const state = el._layout(root);
    const at = spans(state);
    for (const [k, [a, b]] of at) {
      const node = el._nodes.get(k);
      if (node.parent?.depth && b > a) {
        const [pa, pb] = at.get(node.parent.key);
        assert.ok(pa - 1e-9 <= a && b <= pb + 1e-9, `${k} inside its parent when zoomed on "${key}"`);
      }
    }
    const inner = rings.find((r) => r.dataset.depth === root.depth + 1);
    assert.ok(near(inner.total, 1), `the first ring around "${key}" is full`);
    const ring = state.rings.find((r) => r.ring === inner);
    assert.ok(near(ring.outer, cfg.hole + cfg.thickness) && ring.visible);
  }
  const zoomed = el._layout(el._nodes.get('0'));
  assert.deepEqual(spans(zoomed).get('0.1').map((n) => Number(n.toFixed(4))), [Number((12 / 31).toFixed(4)), 1]);
  assert.equal(zoomed.rings[0].visible, false, 'the zoomed branch folds into the hub');
  assert.equal(zoomed.rings[0].outer, cfg.hole);
});

test('levels and hole set the geometry', () => {
  const el = make({ data: JSON.stringify(DATA) });
  assert.deepEqual([el._cfg.depth, el._cfg.shown, el._cfg.hole, Number(el._cfg.thickness.toFixed(6))], [3, 3, 3.6, 2.8]);
  const two = make({ data: JSON.stringify(DATA), levels: '2' });
  assert.equal(two._cfg.shown, 2);
  assert.ok(Math.abs(two._cfg.hole + 2 * two._cfg.thickness - 12) < 1e-9);
  const holed = make({ data: JSON.stringify(DATA), hole: '5' });
  assert.ok(Math.abs(holed._cfg.thickness - 7 / 3) < 1e-9);
});

test('a data change with the same tree keeps the zoom', () => {
  const el = make({ data: JSON.stringify(DATA) });
  el._zoom = el._nodes.get('0');
  el.setAttribute('data', JSON.stringify([{ ...DATA[0], label: 'Job' }, DATA[1], DATA[2]]));
  assert.deepEqual(el.path, [0]);
  assert.equal(el._zoom.label, 'Job');
  el.setAttribute('data', JSON.stringify([DATA[2]]));
  assert.deepEqual(el.path, [], 'a branch that is gone resets the zoom');
});

console.log(`\n${passed} passed`);
