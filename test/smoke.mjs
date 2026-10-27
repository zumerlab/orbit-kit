/**
 * Headless smoke test — no browser. Stubs just enough DOM to exercise each
 * component's readConfig() + build() (config parsing + markup generation) and
 * assert the generated light-DOM string contains the expected Orbit structure.
 */

// ---- minimal DOM shim -------------------------------------------------------
function stubStyle() { return { _p: {}, setProperty(k, v) { this._p[k] = v; } }; }
function stubClassList() { return { add() {}, remove() {}, toggle() {}, contains() { return false; } }; }

function stubEl() {
  return {
    _attrs: {}, dataset: {}, style: stubStyle(), classList: stubClassList(),
    textContent: '', tabIndex: 0,
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    addEventListener() {}, removeEventListener() {}, focus() {},
    querySelector() { return stubEl(); }, querySelectorAll() { return []; }
  };
}

class HTMLElementStub {
  constructor() { this._attrs = {}; this._html = ''; this.style = stubStyle(); this.classList = stubClassList(); this.dataset = {}; this.tabIndex = 0; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  hasAttribute(k) { return k in this._attrs; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener() {} removeEventListener() {} focus() {}
  dispatchEvent() { return true; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; }
  get localName() { return this.constructor._tag || 'o-element'; }
  querySelector() { return stubEl(); }
  querySelectorAll() { return []; }
  get isConnected() { return true; }
}

globalThis.HTMLElement = HTMLElementStub;
globalThis.customElements = {
  _reg: {},
  get(t) { return this._reg[t]; },
  define(t, c) { c._tag = t; this._reg[t] = c; }
};
const injectedStyles = [];
globalThis.document = {
  getElementById(id) { return injectedStyles.find((s) => s.id === id) || null; },
  createElement() { return { id: '', textContent: '' }; },
  head: { appendChild(el) { injectedStyles.push(el); } }
};
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
// rAF stubs that DON'T invoke the callback, so the live loop doesn't recurse in Node.
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// ---- helpers ----------------------------------------------------------------
let pass = 0, fail = 0;
function check(name, cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} — ${msg || 'failed'}`); }
}
function make(Cls, attrs) {
  const el = new Cls();
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ---- run --------------------------------------------------------------------
const { OrbitGauge } = await import('../src/o-gauge.js');
const { OrbitDonut } = await import('../src/o-donut.js');
const { OrbitRings } = await import('../src/o-rings.js');
const { OrbitMeter } = await import('../src/o-meter.js');
const { OrbitKnob } = await import('../src/o-knob.js');
const { OrbitMenu } = await import('../src/o-menu.js');
const { OrbitCompass } = await import('../src/o-compass.js');
const { OrbitRadar } = await import('../src/o-radar.js');
const { OrbitClock } = await import('../src/o-clock.js');
const { OrbitInstrument } = await import('../src/o-instrument.js');
const { OrbitTimer, parseDuration, formatTime } = await import('../src/o-timer.js');
const { OrbitStatus, normalizeStatus } = await import('../src/o-status.js');

console.log('\no-gauge');
{
  const el = make(OrbitGauge, { value: '0', size: '200px', unit: '%' });
  el._render();
  check('gauge renders an initially empty fill', el.innerHTML.includes('o-gauge-fill'));
  check('gauge supports shared base lifecycle', typeof el.readConfig === 'function' && typeof el.sync === 'function');
}

console.log('\no-donut');
{
  const el = make(OrbitDonut, { data: '[{"value":52,"color":"#f97316"},{"value":28},{"value":20}]', label: '$2.4k' });
  el._render();
  const h = el.innerHTML;
  check('renders 3 segments (+ track)', (h.match(/shape="none"/g) || []).length === 3);
  check('normalizes to 100%', h.includes('value="52.0000"'), 'expected 52% for first segment');
  check('square caps by default (rounded is opt-in)', h.includes('shape="none"') && h.includes('--o-gap:9'), 'gap 1.5% of the width -> --o-gap 9');
  const roundDonut = make(OrbitDonut, { data: '[{"value":50},{"value":50}]', shape: 'rounded' });
  roundDonut._render();
  check('shape="rounded" opts into rounded caps', roundDonut.innerHTML.includes('shape="rounded"'));
  check('center label present', h.includes('$2.4k'));
  check('band hugs the edge of the universe (orbit-12, inner-orbit)', h.includes('orbit-12') && h.includes('inner-orbit') && !h.includes('--o-force'));
}

console.log('\no-donut (partial via total)');
{
  const el = make(OrbitDonut, { data: '[{"value":68,"color":"#6366f1"}]', total: '100', label: '68%' });
  el._render();
  check('value is 68% of total', el.innerHTML.includes('value="68.0000"'));
}

console.log('\no-rings');
{
  const el = make(OrbitRings, { data: '[{"value":80,"color":"#fa114f"},{"value":55},{"value":92}]' });
  el._render();
  const h = el.innerHTML;
  check('renders 3 progress rings', (h.match(/<o-progress/g) || []).length === 3);
  check('outer ring touches the edge (orbit-12)', h.includes('orbit-12'), '3 rings, 3 lanes apart');
  check('inner rings step inward by whole lanes', h.includes('orbit-9') && h.includes('orbit-6') && !h.includes('--o-force'));
  check('passes max', h.includes('max="100"'));
}

console.log('\no-meter');
{
  const el = make(OrbitMeter, { value: '125', min: '0', max: '240', ticks: '9',
    zones: '[{"from":0,"to":140,"color":"#22c55e"},{"from":140,"to":200,"color":"#eab308"},{"from":200,"to":240,"color":"#ef4444"}]' });
  el._render();
  const h = el.innerHTML;
  check('renders 9 ticks', (h.match(/class="vector inner-orbit"/g) || []).length === 9);
  check('renders 3 zone arcs + an independent vector needle', (h.match(/<o-arc/g) || []).length === 3 && h.includes('o-meter-needle'));
  check('needle remains a vector at value zero', h.includes('o-meter-needle') && h.includes('vector outer-orbit'));
  check('auto from for 270 range', h.includes('--o-from:225deg'), 'range 270 -> from 225');
}

console.log('\no-knob');
{
  const el = make(OrbitKnob, { value: '65', unit: '%' });
  el._render();
  const h = el.innerHTML;
  check('renders track + value dial sized by the universe', (h.match(/<o-arc/g) || []).length === 2 && !h.includes('--o-force') && h.includes('interactive'));
  check('value getter works', el.value === 65);
  check('role slider set', el.getAttribute('role') === 'slider');
}

console.log('\no-menu');
{
  const el = make(OrbitMenu, { items: '[{"label":"Cut","value":"cut"},{"label":"Copy"},{"label":"Paste"}]', label: 'MENU' });
  el._render();
  const h = el.innerHTML;
  check('renders 3 sectors', (h.match(/class="inner-orbit o-menu-item"/g) || []).length === 3);
  check('distributes by count, never fit-range (keeps icons aligned)', !h.includes('fit-range'));
  const partialMenu = make(OrbitMenu, { items: '[{"label":"A"},{"label":"B"}]', range: '180' });
  partialMenu._render();
  check('partial ring is also count-based (no fit-range)', !partialMenu.innerHTML.includes('fit-range'));
  check('curved label on the arc', h.includes('>Cut</o-arc>'));
  check('has a center hub', h.includes('o-menu-hub'));
  check('select() updates value', (el._select(1), el.value === 'Copy' || el.selectedIndex === 1));
}

console.log('\no-menu (multi-level)');
{
  const items = '[{"label":"Edit","children":[{"label":"Cut","value":"cut"},{"label":"Copy","value":"copy"}]},{"label":"Quit","value":"quit"}]';
  const el = make(OrbitMenu, { items, label: 'MENU' });
  el._render();
  check('root shows branch + leaf', (el.innerHTML.match(/o-menu-item/g) || []).length === 2);
  check('branch marked with chevron', el.innerHTML.includes('is-branch') && el.innerHTML.includes('›'));
  check('starts at root depth', el.path.length === 0);

  el._activate(0); // drill into "Edit"
  check('drilled into branch (path=[0])', el.path.length === 1 && el.path[0] === 0);
  check('sub-level shows children', el.innerHTML.includes('>Cut</o-arc>') && el.innerHTML.includes('>Copy</o-arc>'));
  check('center becomes a back button', el.innerHTML.includes('is-back') && el.innerHTML.includes('‹ Edit'));

  el._activate(0); // select "Cut" (leaf in the sub-level)
  check('leaf select sets value', el.value === 'cut');
  check('path stays at the sub-level after select', el.path.length === 1);

  el.back();
  check('back() returns to root', el.path.length === 0 && el.innerHTML.includes('>Quit</o-arc>') && !el.innerHTML.includes('is-back'));
}

console.log('\no-menu (concentric / editor style)');
{
  const items = '[{"label":"Size","icon":"<svg></svg>","children":[{"label":"Bigger","value":"sz.up"},{"label":"Smaller","value":"sz.dn"}]},{"label":"Format","children":[{"label":"Bold","value":"fmt.b"},{"label":"Italic","value":"fmt.i"},{"label":"Align","children":[{"label":"Left","value":"al.l"},{"label":"Center","value":"al.c"}]}]},{"label":"Quit","value":"quit"}]';
  const el = make(OrbitMenu, { items, label: 'MENU', expand: 'concentric' });
  el._render();
  check('one ring at root', (el.innerHTML.match(/ok-menu-ring/g) || []).length === 1);
  check('icon placed at sector center via composite', el.innerHTML.includes('o-menu-icon') && /--o-angle-composite:[-\d.]+deg/.test(el.innerHTML) && !el.innerHTML.includes('spin-lock'));

  el._activateAt(0, 1); // open "Format" — parent ring stays, children fan out
  check('parent ring stays + child ring added (2 rings)', (el.innerHTML.match(/ok-menu-ring/g) || []).length === 2);
  check('opened branch is highlighted active', /data-level="0" data-index="1"[^>]*is-active|is-active[^>]*data-index="1"/.test(el.innerHTML) || el.innerHTML.includes('is-active'));
  check('child wedge aligned to parent slice (own --o-from)', el.innerHTML.includes('data-level="1"'));

  el._activateAt(1, 2); // open "Align" (nested branch) → third concentric ring
  check('deep nesting adds a third ring', (el.innerHTML.match(/ok-menu-ring/g) || []).length === 3 && el.path.length === 2);

  el._activateAt(0, 1); // click the open "Format" again → collapses it
  check('clicking an open branch collapses it', el.path.length === 0 && (el.innerHTML.match(/ok-menu-ring/g) || []).length === 1);

  el._activateAt(0, 2); // select leaf "Quit"
  check('leaf select still works in concentric', el.value === 'quit');
}

console.log('\no-compass');
{
  const el = make(OrbitCompass, { heading: '45' });
  el._render();
  const h = el.innerHTML;
  check('renders 4 cardinals (upright, no spin-lock over-rotation)', (h.match(/ok-cmp-card/g) || []).length >= 4 && !h.includes('spin-lock'));
  check('first cardinal (N) is accented', h.includes('ok-cmp-card north'));
  check('36-tick scale + dial + lubber', (h.match(/ok-cmp-tick/g) || []).length >= 36 && h.includes('ok-cmp-dial') && h.includes('ok-cmp-lubber'));
  check('no fit-range on the 360 card (overlap bug)', !h.includes('fit-range'));
  check('sized by its universe (no --o-force)', !h.includes('--o-force') && h.includes('orbit-12 ok-cmp-dial'));
  // heading 45 → card rotated -45°, readout "045°" NE.
  check('card rotates to heading', el._cards.style._p['--o-from'] === '-45deg');
  check('readout shows degrees + point', el._deg.textContent === '045°' && el._sub.textContent === 'NE');
}

console.log('\no-radar');
{
  const el = make(OrbitRadar, { rings: '3', spokes: '8', targets: '[{"angle":60,"dist":0.8},{"angle":200,"dist":0.4}]', label: 'SCAN' });
  el._render();
  const h = el.innerHTML;
  check('range rings from one grid layer, any count', h.includes('ok-radar-grid') && h.includes('--ok-radar-rings:3'));
  check('renders 8 spokes from the center', (h.match(/class="vector outer-orbit ok-radar-spoke"/g) || []).length === 8);
  check('sweep is a rotating conic-gradient beam', h.includes('o-radar-sweep') && /conic-gradient/.test(injectedStyles.find((s) => s.id === 'orbit-kit-radar')?.textContent));
  check('sweep width drives the beam angle', (() => {
    const wide = make(OrbitRadar, { rings: '3', 'sweep-width': '180' });
    wide._render();
    return wide.innerHTML.includes('180deg');
  })());
  check('renders 2 blips', (h.match(/o-radar-blip/g) || []).length === 2);
  check('blip aimed via angle-composite', h.includes('--o-angle-composite:-30deg'));
  check('scope alpha supports arbitrary CSS colors', /color-mix\(in srgb/.test(injectedStyles.find((s) => s.id === 'orbit-kit-radar')?.textContent));
}

console.log('\no-clock');
{
  const el = make(OrbitClock, { time: '03:00:00', numerals: 'roman', seconds: '' });
  el._render();
  const h = el.innerHTML;
  check('renders 60 minute ticks', (h.match(/ok-clock-tick"/g) || []).length === 60);
  check('renders 12 hour ticks', (h.match(/ok-clock-tick-h/g) || []).length === 12);
  check('roman numerals', h.includes('>XII</div>') && h.includes('>IX</div>'));
  check('three hands present', h.includes('ok-clock-hour') && h.includes('ok-clock-min') && h.includes('ok-clock-sec'));
  // 03:00 → hour hand points right: (3*30)+0-90 = 0deg.
  check('hands aimed by --o-angle-composite', el._hourHand.style._p['--o-angle-composite'] === '0deg');
  check('minute hand at -90deg (top) for :00', el._minHand.style._p['--o-angle-composite'] === '-90deg');
}

console.log('\no-clock (variants)');
{
  const plain = make(OrbitClock, { time: '12:00' });
  plain._render();
  check('no second hand unless requested', !plain.innerHTML.includes('ok-clock-sec'));
  check('default case is round', plain.innerHTML.includes('ok-clock-case--round'));
  check('the dial is the universe (orbit-12, no --o-force)', plain.innerHTML.includes('orbit-12 ok-clock-dial') && !plain.innerHTML.includes('--o-force'));

  const bare = make(OrbitClock, { time: '12:00', numerals: 'none' });
  bare._render();
  check('numerals="none" drops the numeral ring', !bare.innerHTML.includes('ok-clock-num'));

  const live = make(OrbitClock, { live: '', smooth: '' });
  live._render();
  check('live+smooth implies a second hand', live.innerHTML.includes('ok-clock-sec'));
  live._stopLoop(); // tidy any rAF/timer the stub may have started
}

console.log('\no-clock (cases, oval, complications, presets)');
{
  const sq = make(OrbitClock, { time: '12:00', case: 'square' });
  sq._render();
  check('square case adds a frame', sq.innerHTML.includes('ok-clock-case--square'));

  const oval = make(OrbitClock, { time: '12:00', dial: 'oval' });
  oval._render();
  check('oval on a square box → gentle vertical oval', oval.innerHTML.includes('--o-ellipse-y:.82'));

  const rect = make(OrbitClock, { time: '12:00', case: 'rectangle', size: '240px' });
  rect._render();
  check('rectangle case is taller than wide', rect.innerHTML.includes('width:240px;aspect-ratio:100 / 126'));

  const tonneau = make(OrbitClock, { time: '12:00', case: 'rectangle', dial: 'oval', size: '240px' });
  tonneau._render();
  // The dial follows the same vertical ratio as its responsive rectangular case.
  check('tonneau dial elongates vertically (matches case)',
    tonneau.innerHTML.includes('--o-ellipse-x:1;--o-ellipse-y:0.794'));
  check('tonneau is NOT a sideways oval', !tonneau.innerHTML.includes('--o-ellipse-x:.78'));

  const comp = make(OrbitClock, { time: '09:41:30', digital: '', date: '', brand: 'ORBIT' });
  comp._render();
  check('brand complication renders', comp.innerHTML.includes('>ORBIT<'));
  check('digital readout filled from time', comp._digital.textContent === '09:41');
  check('date window filled', /^\d+$/.test(comp._dateEl.textContent));

  const sw = make(OrbitClock, { preset: 'smartwatch', time: '09:41:00' });
  sw._render();
  check('smartwatch preset → rounded case', sw.innerHTML.includes('ok-clock-case--rounded'));
  check('smartwatch preset → digital + seconds', sw.innerHTML.includes('ok-clock-digital') && sw.innerHTML.includes('ok-clock-sec'));
  check('preset overridable by explicit attr', (() => {
    const o = make(OrbitClock, { preset: 'smartwatch', case: 'square', time: '09:41' });
    o._render();
    return o.innerHTML.includes('ok-clock-case--square');
  })());
}

console.log('\no-clock (iOS rings face)');
{
  const el = make(OrbitClock, { dial: 'rings', seconds: '', time: '09:45:30' });
  el._render();
  const h = el.innerHTML;
  check('renders 3 progress rings (H/M/S)', h.includes('ok-ring-H') && h.includes('ok-ring-M') && h.includes('ok-ring-S'));
  check('no analog hands in rings face', !h.includes('ok-clock-hour'));
  check('digital time in center', el._ringTime.textContent === '09:45');
  // 09:45 → hour ring = ((9%12)+45/60)/12 = 0.8125 → 81.25%.
  check('hour ring filled by time', el._ringH.getAttribute('value') === '81.25');
  check('rings face sized by its universe', !h.includes('--o-force') && h.includes('orbit-12'));
}

console.log('\no-clock (chronograph sub-dials)');
{
  const ch = make(OrbitClock, { preset: 'chrono', time: '09:41:30' });
  ch._render();
  const h = ch.innerHTML;
  check('chrono preset renders three sub-dials', h.includes('ok-sub-sec') && h.includes('ok-sub-h24') && h.includes('ok-sub-date'));
  check('sub-dials are nested gravity-spots', (h.match(/gravity-spot/g) || []).length >= 4);
  check('sub-dials sit at 3/6/9', h.includes('angle-270') && h.includes('angle-90') && h.includes('angle-180'));
  check('sub-dials are satellites sized in lanes', h.includes('orbit-5" style="--o-size-ratio:5.8'));
  // 09:41:30 → small-seconds sub-hand at 30*6-90 = 90deg.
  check('sub-second hand is driven live', ch._subSec.style._p['--o-angle-composite'] === '90deg');
  // 24h sub-hand: ((9+41/60)/24)*360-90 = 55.25deg.
  check('24h sub-hand driven live', ch._sub24.style._p['--o-angle-composite'] === '55.25deg');
  check('sub-dials suppress the standalone digital/date', (() => {
    const o = make(OrbitClock, { preset: 'chrono', digital: '', date: '', time: '09:41' });
    o._render();
    return !o.innerHTML.includes('ok-clock-digital') && !o.innerHTML.includes('ok-clock-date');
  })());
}

console.log('\no-instrument');
{
  const tach = make(OrbitInstrument, { preset: 'tachometer', value: '6.2' });
  tach._render();
  const h = tach.innerHTML;
  check('9 major ticks (0..8)', (h.match(/ok-inst-tick-M/g) || []).length === 9);
  check('five minor ticks between each pair of majors', (h.match(/ok-inst-tick"/g) || []).length === (9 - 1) * (5 + 1) + 1);
  check('numeric scale label "8" present', h.includes('>8</div>'));
  check('redline zone rendered', h.includes(`--o-fill:#ef4444`));
  check('needle is a full-length vector (not a zero-length arc)', h.includes('ok-inst-needle') && !h.includes('shape="arrow"'));
  // value 6.2 of 0..8 → frac .775; deg = (225+270+.775*270)%360 = 344.25.
  check('needle rotated to value angle', tach._needle.style._p['--o-angle-composite'] === '344.25deg');
  check('digital readout reflects value', tach._value.textContent === '6.2');
  check('caption from preset', h.includes('RPM x1000'));
}

console.log('\no-instrument (needle visible at zero)');
{
  const speedo = make(OrbitInstrument, { preset: 'speedometer', value: '0' });
  speedo._render();
  // The regression you caught: at value 0 an arrow-arc vanished. The vector needle is always drawn.
  check('needle exists at value 0', !!speedo._needle);
  check('needle still has an angle at value 0', /deg$/.test(speedo._needle.style._p['--o-angle-composite']));
}

console.log('\no-instrument (presets + zones + cases)');
{
  const air = make(OrbitInstrument, { preset: 'airspeed', value: '120' });
  air._render();
  check('airspeed has 3 color zone arcs', (air.innerHTML.match(/ok-inst-zone/g) || []).length === 3, 'green/yellow/red');
  check('plus a vector needle', air.innerHTML.includes('ok-inst-needle'));
  check('300° sweep from preset', air.innerHTML.includes('--o-range:300deg'));

  const fuel = make(OrbitInstrument, { preset: 'fuel' });
  fuel._render();
  check('custom tick labels (E/½/F)', fuel.innerHTML.includes('>E<') && fuel.innerHTML.includes('>F<'));
  check('quarter-arc gauge has no round bezel', fuel.innerHTML.includes('ok-inst-case--bare') && !fuel.innerHTML.includes('ok-inst-dial'));
  check('quarter-arc gauge gets a track band instead', /orbit-11" style="--o-range:90deg.*ok-inst-track" value="100"/.test(fuel.innerHTML));
  check('fuel uses canonical from:270 (9 o’clock start)', fuel.innerHTML.includes('--o-from:270deg'));
  check('fuel hides the meaningless numeric readout', !fuel.innerHTML.includes('ok-inst-value') && fuel.innerHTML.includes('Fuel'));

  const fuelSquare = make(OrbitInstrument, { preset: 'fuel', case: 'square' });
  fuelSquare._render();
  check('explicit case overrides the bare default', fuelSquare.innerHTML.includes('ok-inst-case--square'));

  const cpu = make(OrbitInstrument, { preset: 'cpu', value: '73', case: 'square' });
  cpu._render();
  check('square case', cpu.innerHTML.includes('ok-inst-case--square'));
  check('non-contiguous zone placed by its own --o-from', /orbit-11" style="--o-range:270deg;--o-from:[\d.]+deg/.test(cpu.innerHTML));

  const custom = make(OrbitInstrument, { min: '0', max: '100', value: '40', unit: '%', label: 'LOAD', redline: '90' });
  custom._render();
  check('redline= sugar adds a red zone', custom.innerHTML.includes('--o-fill:#ef4444'));
  check('ad-hoc gauge needs no preset', custom._value.textContent === '40' && custom.innerHTML.includes('LOAD'));
}

console.log('\no-timer');
{
  const el = make(OrbitTimer, { duration: '1:30', label: 'Tea' });
  el._render();
  const h = el.innerHTML;
  check('track + progress ring on the edge', h.includes('ok-track') && h.includes('<o-progress class="inner-orbit ok-value"') && h.includes('orbit-12'));
  check('starts full', el.remaining === 90 && el._ring.getAttribute('value') === '100.00');
  check('shows m:ss', el._time.textContent === '1:30');
  check('has start and reset buttons', h.includes('ok-timer-toggle') && h.includes('aria-label="Reset"'));
  check('role timer with a name', el.getAttribute('role') === 'timer' && el.getAttribute('aria-label') === 'Tea: 1:30 left of 1:30');
  check('parses durations', parseDuration('90') === 90 && parseDuration('1:02:03') === 3723 && parseDuration('45s') === 45 && parseDuration('nope', 7) === 7);
  check('formats time rounding up', formatTime(59.2) === '1:00' && formatTime(3723) === '1:02:03' && formatTime(0) === '0:00');
  const ticks = make(OrbitTimer, { duration: '60', ticks: '60' });
  ticks._render();
  check('optional ticks', (ticks.innerHTML.match(/ok-timer-tick/g) || []).length === 60);
  const bare = make(OrbitTimer, { controls: 'false' });
  bare._render();
  check('controls="false" drops the buttons', !bare.innerHTML.includes('<button'));
}

console.log('\no-status');
{
  const el = make(OrbitStatus, { data: JSON.stringify([{ label: 'API', status: 'ok' }, { label: 'DB', status: 'degraded' }, { label: 'Queue', status: 'down' }]), label: 'Services' });
  el._render();
  const h = el.innerHTML;
  check('one ring of stacked segments', (h.match(/ok-status-seg"/g) || []).length === 3 && h.includes('orbit-12'));
  check('aliases map to statuses', normalizeStatus('degraded') === 'warn' && normalizeStatus('down') === 'error' && normalizeStatus('???') === 'off');
  check('segments are interactive buttons', h.includes('interactive role="button"') && h.includes('aria-label="DB: Warning"'));
  check('labels are opt-in', !h.includes('>API</o-arc>'));
  const nested = make(OrbitStatus, { labels: '', data: JSON.stringify([{ label: 'EU', children: [{ label: 'api', status: 'ok' }, { label: 'db', status: 'error' }] }, { label: 'US', status: 'ok' }]) });
  nested._render();
  const n = nested.innerHTML;
  check('groups make an inner ring', n.includes('orbit-9') && n.includes('orbit-12'));
  check('group shows its worst child', n.includes('data-path="0" data-status="error"'));
  check('leaf groups leave an aligned spacer outside', n.includes('ok-status-spacer'));
  check('labels along the arcs when asked', n.includes('>api</o-arc>'));
}

console.log('\ndesign pass: glow + hub');
{
  const lit = make(OrbitDonut, { data: '[{"value":100,"color":"#3da9fc"}]', label: 'X', glow: '' });
  lit._render();
  check('glow adds drop-shadow to fill', lit.innerHTML.includes('filter:drop-shadow(0 0 6px #3da9fc)'));
  check('center label uses shared hub', lit.innerHTML.includes('capsule ok-hub'));

  const noglow = make(OrbitDonut, { data: '[{"value":100,"color":"#3da9fc"}]' });
  noglow._render();
  check('no glow attr → no filter', !noglow.innerHTML.includes('drop-shadow'));

  const ringsGlow = make(OrbitRings, { data: '[{"value":80,"color":"#fa114f"}]', glow: '10' });
  ringsGlow._render();
  check('glow radius is configurable', ringsGlow.innerHTML.includes('drop-shadow(0 0 10px #fa114f)'));
}

console.log('\nkit baseline');
{
  const base = injectedStyles.find((s) => s.id === 'orbit-kit-base');
  check('baseline stylesheet injected once', !!base);
  check('strips default satellite border', !!base && base.textContent.includes('border: none'));
  check('scoped to kit tags only', !!base && base.textContent.includes(':where(o-gauge'));
  check('border-strip covers o-clock, o-instrument and the new tags', !!base && /o-clock,o-instrument,o-timer,o-status[\w,-]*\) :where\(\.satellite\)/.test(base.textContent));
  check('defines shared .ok-hub', !!base && base.textContent.includes('.ok-hub'));
}

console.log('\n----------------------------------------');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
