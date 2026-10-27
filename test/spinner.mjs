/**
 * <o-spinner> unit tests, no browser: config parsing, the Orbit structure of
 * each variant and the progressbar semantics. Run: node test/spinner.mjs
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
const { OrbitSpinner, SPINNER_VARIANTS } = await import('../src/o-spinner.js');
const render = (attrs) => { const el = make(OrbitSpinner, attrs); el._render(); return el; };
const count = (html, needle) => html.split(needle).length - 1;

console.log('o-spinner: variants');
{
  check('five variants', SPINNER_VARIANTS.join() === 'ring,dots,segments,orbit,progress');
  const ring = render({});
  check('ring by default: a track and two turning arcs on orbit-12', count(ring.innerHTML, 'ok-spin-rotor') === 2 && ring.innerHTML.includes('orbit-12') && ring.innerHTML.includes('ok-track'));
  check('the track is a full arc with no shape seam', /class="inner-orbit ok-track" value="100"><\/o-arc>/.test(ring.innerHTML));
  check('unknown variant falls back to ring', render({ variant: 'nope' }).innerHTML.includes('ok-spin-rotor'));
  const dots = render({ variant: 'dots' });
  check('dots: 8 satellites on one ring', count(dots.innerHTML, 'ok-spin-dot') === 8 && dots.innerHTML.includes('orbit-9'));
  check('dots carry their index for the stagger', dots.innerHTML.includes('--i:7;--n:8'));
  const segs = render({ variant: 'segments', count: '60' });
  check('segments: vectors, count clamped to 36', count(segs.innerHTML, 'class="vector') === 36);
  check('segments: at least 3', count(render({ variant: 'segments', count: '1' }).innerHTML, 'class="vector') === 3);
  const orbit = render({ variant: 'orbit', count: '3' });
  check('orbit: a planet, three moons and a core', count(orbit.innerHTML, 'ok-spin-planet') === 1 && count(orbit.innerHTML, 'ok-spin-moon') === 3 && orbit.innerHTML.includes('ok-spin-core'));
  check('size sets the universe width', render({ size: '24px' }).innerHTML.includes('style="width:24px"'));
  check('default size is 48px', render({}).innerHTML.includes('width:48px'));
}

console.log('\no-spinner: progress and aria');
{
  const busy = render({ variant: 'progress' });
  check('progress without value spins', busy.innerHTML.includes('ok-spin-rotor') && !busy.innerHTML.includes('ok-spin-fill'));
  check('indeterminate: progressbar, busy, no valuenow', busy.getAttribute('role') === 'progressbar' && busy.getAttribute('aria-busy') === 'true' && busy.getAttribute('aria-valuenow') === null);
  check('default name is Loading', busy.getAttribute('aria-label') === 'Loading');
  check('value is undefined while indeterminate', busy.value === undefined);

  const p = render({ variant: 'progress', value: '40', max: '200', readout: '', label: 'Uploading' });
  check('determinate: a value arc', p.innerHTML.includes('ok-spin-fill'));
  check('aria values', p.getAttribute('aria-valuenow') === '40' && p.getAttribute('aria-valuemax') === '200' && p.getAttribute('aria-valuetext') === '20%');
  check('label names it', p.getAttribute('aria-label') === 'Uploading');
  check('still busy below max', p.getAttribute('aria-busy') === 'true');
  check('value getter is clamped', render({ variant: 'progress', value: '500' }).value === 100);
  const full = render({ variant: 'progress', value: '100' });
  check('not busy when complete', full.getAttribute('aria-busy') === 'false');
  check('value on another variant does not make it determinate', render({ value: '50' }).getAttribute('aria-valuenow') === null);
  const fmt = render({ variant: 'progress', value: '3', max: '12', format: 'decimal', unit: ' files' });
  check('format attributes reach aria-valuetext with unit', fmt.getAttribute('aria-valuetext') === '3 files');
  const custom = make(OrbitSpinner, { variant: 'progress', value: '2', max: '8', role: 'status' });
  custom._render();
  check('author role is kept', custom.getAttribute('role') === 'status');
  custom.formatter = (v, { kind }) => `${v} of 8 ${kind}`;
  check('formatter reaches aria-valuetext', custom.getAttribute('aria-valuetext') === '2 of 8 aria');
}

console.log('\no-spinner: theming');
{
  const s = render({ color: 'red', track: 'blue', speed: '2' });
  check('color, track and speed set custom properties', s.style._p['--ok-spinner-color'] === 'red' && s.style._p['--ok-spinner-track'] === 'blue' && s.style._p['--ok-spinner-speed'] === '2s');
  check('bad color is ignored', render({ color: 'red;x:y' }).style._p['--ok-spinner-color'] === undefined);
  const css = globalThis.__styles.find((x) => x.id === 'orbit-kit-spinner')?.textContent || '';
  check('reduced motion has its own calm animation', /prefers-reduced-motion[\s\S]*ok-spin-breathe/.test(css));
  check('colors go through shared tokens', css.includes('var(--ok-spinner-color, var(--ok-fill,'));
  const sig = (a) => { const el = make(OrbitSpinner, a); return el.structuralSignature(el.readConfig()); };
  check('value changes do not rebuild', sig({ variant: 'progress', value: '10' }) === sig({ variant: 'progress', value: '90' }));
}

done();
