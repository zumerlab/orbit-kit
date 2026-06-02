/**
 * <o-clock> — analog clock / watch face. The kit's flagship.
 *
 * The idiomatic Orbit clock: every part is a plain element on a nested orbit,
 * and the rotation math is the framework's job. Hands are `.vector`s at the
 * center orbit, pointed by `--o-angle-composite`; ticks are vectors
 * auto-distributed around a ring; numerals are satellites on an outer ring;
 * sub-dials are nested gravity-spots with their own hands.
 *
 * Variants:
 *   - case:    round | square | rounded | rectangle   (the body/bezel)
 *   - dial:    round | oval                            (oval uses Orbit ellipses,
 *              oriented to match the case so a rectangle gives a true tonneau)
 *   - numerals:arabic | roman | none
 *   - complications: digital readout, date window, brand label
 *   - subdials: chronograph tri-compax (small seconds / 24h / date), live
 *   - presets: classic | roman | minimal | chrono | smartwatch
 *
 *   <o-clock live seconds></o-clock>
 *   <o-clock preset="chrono" live brand="ORBIT"></o-clock>
 *   <o-clock case="rectangle" dial="oval" live smooth></o-clock>   <!-- tonneau -->
 *
 * Hands/readouts are patched in place every frame/second; the structure is
 * rebuilt only when the face itself changes.
 */
import { OrbitKitElement, define, injectStyleOnce } from './base.js';

const CLOCK_CSS = `
o-clock .ok-clock-case {
  box-sizing: border-box; display: flex; align-items: center; justify-content: center;
}
o-clock .ok-clock-case--round     { border-radius: 50%; }
o-clock .ok-clock-case--square    { border-radius: 9%; }
o-clock .ok-clock-case--rounded   { border-radius: 26%; }
o-clock .ok-clock-case--rectangle { border-radius: 24%; }
o-clock .ok-clock-case--square,
o-clock .ok-clock-case--rounded,
o-clock .ok-clock-case--rectangle {
  background: var(--ok-clock-case-bg, linear-gradient(160deg, #232a34, #11151b));
  box-shadow: 0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06);
}
o-clock .ok-clock-face { color: var(--ok-clock-numeral, #e6edf3); }
o-clock .ok-clock-dial {
  background: var(--ok-clock-face, radial-gradient(circle at 50% 35%, #1b212b, #0c0f14));
  box-shadow: inset 0 0 0 4px var(--ok-clock-bezel, #2a3340), inset 0 4px 18px rgba(0,0,0,.6);
}
o-clock .ok-clock-tick   { background: var(--ok-clock-tick, rgba(230,237,243,.35)); height: 2px; border-radius: 2px; }
o-clock .ok-clock-tick-h { background: var(--ok-clock-tick-h, #e6edf3); height: 3px; border-radius: 2px; }
o-clock .ok-clock-num    { font-weight: 700; font-variant-numeric: tabular-nums; }
o-clock .ok-clock-brand   { font-size: .62em; letter-spacing: .18em; font-weight: 800; text-transform: uppercase; color: var(--ok-clock-accent, #ef4565); }
o-clock .ok-clock-digital { font-size: .7em; font-weight: 700; letter-spacing: .04em; font-variant-numeric: tabular-nums; opacity: .85; }
o-clock .ok-clock-date    { font-size: .62em; font-weight: 800; font-variant-numeric: tabular-nums; padding: .12em .4em; border-radius: 4px; background: rgba(255,255,255,.1); }
o-clock .ok-clock-hour   { background: var(--ok-clock-hand, #e6edf3); height: 7px; border-radius: 4px; }
o-clock .ok-clock-min    { background: var(--ok-clock-hand, #e6edf3); height: 5px; border-radius: 3px; }
o-clock .ok-clock-sec    { background: var(--ok-clock-accent, #ef4565); height: 2px; border-radius: 2px; }
o-clock .ok-clock-cap    { background: var(--ok-clock-accent, #ef4565); box-shadow: 0 0 0 3px var(--ok-clock-face-cap, #0c0f14); }
o-clock .ok-clock-ringtime { font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .02em; color: var(--ok-clock-numeral, #e6edf3); text-align: center; }
/* sub-dials */
o-clock .ok-subdial-ring { border: 1px solid var(--ok-clock-tick, rgba(230,237,243,.3)); box-shadow: inset 0 0 8px rgba(0,0,0,.4); }
o-clock .ok-sub-tick     { background: var(--ok-clock-tick, rgba(230,237,243,.3)); height: 1px; }
o-clock .ok-subdial-hand { background: var(--ok-clock-accent, #ef4565); height: 2px; border-radius: 2px; }
o-clock .ok-subdial-cap  { background: var(--ok-clock-tick-h, #e6edf3); }
o-clock .ok-subdial-label{ font-size: .4em; opacity: .55; letter-spacing: .1em; text-transform: uppercase; }
o-clock.ok-glow .ok-clock-hour,
o-clock.ok-glow .ok-clock-min  { filter: drop-shadow(0 0 4px var(--ok-clock-hand, #e6edf3)); }
o-clock.ok-glow .ok-clock-sec  { filter: drop-shadow(0 0 5px var(--ok-clock-accent, #ef4565)); }
`;

const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const ARABIC = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];

// Presets are just default bundles; any explicit attribute overrides them.
const PRESETS = {
  classic:    { case: 'round',   numerals: 'arabic' },
  roman:      { case: 'round',   numerals: 'roman' },
  minimal:    { case: 'round',   numerals: 'none' },
  chrono:     { case: 'round',   numerals: 'arabic', subdials: true, brand: 'ORBIT' },
  smartwatch: { case: 'rounded', numerals: 'arabic', seconds: true, smooth: true,
                digital: true, date: true, accent: '#3da9fc' }
};
const CASES = ['round', 'square', 'rounded', 'rectangle'];

export class OrbitClock extends OrbitKitElement {
  static get observedAttributes() {
    return ['time', 'live', 'smooth', 'seconds', 'numerals', 'size', 'preset',
            'case', 'dial', 'digital', 'date', 'brand', 'subdials',
            'face', 'bezel', 'case-bg', 'hand-color', 'accent', 'tick-color', 'glow'];
  }

  /** Resolve a string attribute against the active preset, then a hard default. */
  _opt(name, dflt) {
    const v = this.getAttribute(name);
    if (v != null) return v;
    const p = PRESETS[this.getAttribute('preset')];
    return (p && p[name] != null) ? p[name] : dflt;
  }

  /** Resolve a boolean attribute (supports `attr="false"`) against the preset. */
  _flag(name, dflt = false) {
    if (this.hasAttribute(name)) return this.getAttribute(name) !== 'false';
    const p = PRESETS[this.getAttribute('preset')];
    return (p && p[name] != null) ? !!p[name] : dflt;
  }

  readConfig() {
    const caseShape = CASES.includes(this._opt('case', 'round')) ? this._opt('case', 'round') : 'round';
    const smooth = this._flag('smooth');
    return {
      time: this._str('time', null),
      live: this.hasAttribute('live'),
      smooth,
      seconds: this._flag('seconds') || smooth,
      numerals: this._opt('numerals', 'arabic'),
      caseShape,
      oval: this._opt('dial', 'round') === 'oval',
      ringsFace: this._opt('dial', 'round') === 'rings',
      digital: this._flag('digital'),
      date: this._flag('date'),
      subdials: this._flag('subdials'),
      brand: this._opt('brand', null),
      size: this._str('size', '300px'),
      glow: this.hasAttribute('glow'),
      theme: ['face', 'bezel', 'case-bg', 'hand-color', 'accent', 'tick-color']
        .map((a) => this.getAttribute(a)).join('|')
    };
  }

  structuralSignature(cfg) {
    // Hands + digital/date/sub-dial readouts are patched live; only the face rebuilds.
    const { time, ...rest } = cfg;
    return JSON.stringify(rest);
  }

  build(cfg) {
    injectStyleOnce('orbit-kit-clock', CLOCK_CSS);
    this.classList.toggle('ok-glow', cfg.glow);
    this._ringTime = null; // reset face mode each build

    // Convenience attributes mirror the CSS custom properties.
    const map = {
      face: '--ok-clock-face', bezel: '--ok-clock-bezel', 'case-bg': '--ok-clock-case-bg',
      'hand-color': '--ok-clock-hand', accent: '--ok-clock-accent', 'tick-color': '--ok-clock-tick'
    };
    for (const [attr, prop] of Object.entries(map)) {
      const v = this.getAttribute(attr);
      if (v != null) this.style.setProperty(prop, v);
    }
    if (this.getAttribute('accent') == null) {
      const p = PRESETS[this.getAttribute('preset')];
      if (p && p.accent) this.style.setProperty('--ok-clock-accent', p.accent);
    }

    if (cfg.ringsFace) { this._buildRingsFace(cfg); return; }

    // Orbit sizes track --o-force (orbit-N diameter = N/12 * force), NOT the
    // box. The dial is orbit-11, so scale force to make it equal the requested
    // size. The case wraps the dial with extra frame for non-round shapes.
    const dialPx = parseFloat(cfg.size) || 300;
    const force = (dialPx * 12 / 11).toFixed(1);
    const frame = cfg.caseShape === 'round' ? 0 : Math.round(dialPx * 0.08);
    const caseW = dialPx + frame * 2;
    const caseH = caseW + (cfg.caseShape === 'rectangle' ? Math.round(dialPx * 0.26) : 0);
    const baseFont = (dialPx * 0.075).toFixed(1);

    // Oval dial: stretch the orbits to match the CASE orientation so a tall
    // (rectangle) case gives a tall dial (true tonneau), not a sideways oval.
    let ellipse = '';
    if (cfg.oval) {
      if (caseH > caseW) ellipse = `--o-ellipse-x:1;--o-ellipse-y:${(caseW / caseH).toFixed(3)};`;
      else if (caseW > caseH) ellipse = `--o-ellipse-x:${(caseH / caseW).toFixed(3)};--o-ellipse-y:1;`;
      else ellipse = '--o-ellipse-x:1;--o-ellipse-y:.82;'; // square box → gentle vertical oval
    }

    // --- ticks: 60 minute, 12 hour (overdraw every 5th) ---
    const minuteTicks = Array.from({ length: 60 }, () =>
      '<div class="vector inner-orbit shrink-55 ok-clock-tick"></div>').join('');
    const hourTicks = Array.from({ length: 12 }, () =>
      '<div class="vector inner-orbit shrink-15 ok-clock-tick-h"></div>').join('');

    // --- numerals ---
    const labels = cfg.numerals === 'roman' ? ROMAN
                 : cfg.numerals === 'none' ? null : ARABIC;
    const numerals = labels
      ? `<div class="orbit-8">${labels.map((n) =>
          `<div class="satellite"><div class="capsule ok-clock-num">${n}</div></div>`).join('')}</div>`
      : '';

    // --- complications (suppressed when sub-dials own the lower face) ---
    const brand = cfg.brand
      ? `<div class="orbit-4"><div class="satellite angle-0"><div class="capsule ok-clock-brand">${cfg.brand}</div></div></div>`
      : '';
    const digital = (cfg.digital && !cfg.subdials)
      ? `<div class="orbit-4"><div class="satellite angle-180"><div class="capsule ok-clock-digital"></div></div></div>`
      : '';
    const date = (cfg.date && !cfg.subdials)
      ? `<div class="orbit-6"><div class="satellite angle-90"><div class="capsule ok-clock-date"></div></div></div>`
      : '';

    // --- sub-dials: chronograph tri-compax at 3/6/9 ---
    const subForce = (dialPx * 0.96).toFixed(1);
    const subdials = cfg.subdials
      ? this._subdial('sec', 'angle-270', subForce, 'S')   // 9 o'clock — small seconds
      + this._subdial('h24', 'angle-90', subForce, '24')   // 3 o'clock — 24-hour
      + this._subdial('date', 'angle-180', subForce, '31') // 6 o'clock — date
      : '';

    // --- hands ---
    const secondHand = cfg.seconds
      ? '<div class="vector outer-orbit grow-4x ok-clock-hand ok-clock-sec"></div>'
      : '';

    this.innerHTML = `
      <div class="ok-clock-case ok-clock-case--${cfg.caseShape}" style="width:${caseW}px;height:${caseH}px;font-size:${baseFont}px;">
        <div class="bigbang" style="width:100%;height:100%;">
          <div class="gravity-spot ok-clock-face" style="--o-force:${force}px;${ellipse}">
            <div class="orbit-11 ok-clock-dial"></div>
            <div class="orbit-10">${minuteTicks}</div>
            <div class="orbit-10">${hourTicks}</div>
            ${numerals}
            ${brand}${digital}${date}${subdials}
            <div class="orbit-0">
              <div class="vector outer-orbit grow-2x ok-clock-hand ok-clock-hour"></div>
              <div class="vector outer-orbit grow-3x ok-clock-hand ok-clock-min"></div>
              ${secondHand}
              <div class="satellite at-center shrink-80 ok-clock-cap"></div>
            </div>
          </div>
        </div>
      </div>`;

    this._hourHand = this.querySelector('.ok-clock-hour');
    this._minHand = this.querySelector('.ok-clock-min');
    this._secHand = this.querySelector('.ok-clock-sec');
    this._digital = this.querySelector('.ok-clock-digital');
    this._dateEl = this.querySelector('.ok-clock-date');
    this._subSec = this.querySelector('.ok-sub-sec');
    this._sub24 = this.querySelector('.ok-sub-h24');
    this._subDate = this.querySelector('.ok-sub-date');
  }

  /**
   * One chronograph sub-dial: a nested gravity-spot (its own --o-force keeps it
   * small) with a tick ring, a labeled counter and a single live hand.
   */
  _subdial(kind, angleClass, subForce, label) {
    const ticks = Array.from({ length: 12 }, () =>
      '<div class="vector inner-orbit shrink-60 ok-sub-tick"></div>').join('');
    return `
      <div class="orbit-5">
        <div class="satellite ${angleClass}">
          <div class="gravity-spot" style="--o-force:${subForce}px;">
            <div class="orbit-3 ok-subdial-ring"></div>
            <div class="orbit-3">${ticks}</div>
            <div class="orbit-1"><div class="satellite angle-180"><div class="capsule ok-subdial-label">${label}</div></div></div>
            <div class="orbit-0">
              <div class="vector outer-orbit grow-1x ok-subdial-hand ok-sub-${kind}"></div>
              <div class="satellite at-center shrink-90 ok-subdial-cap"></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /** iOS-style face: concentric activity rings (hours / minutes / seconds). */
  _buildRingsFace(cfg) {
    // Clear analog refs so _paint takes the rings branch.
    this._hourHand = this._minHand = this._secHand = null;
    this._subSec = this._sub24 = this._subDate = this._digital = this._dateEl = null;

    const defs = [
      { key: 'H', color: this.getAttribute('hour-color') || '#ff453a' },
      { key: 'M', color: this.getAttribute('minute-color') || '#32d74b' }
    ];
    if (cfg.seconds) defs.push({ key: 'S', color: this.getAttribute('second-color') || this.getAttribute('accent') || '#0a84ff' });

    const outer = 1 + defs.length;
    const sizeNum = parseFloat(cfg.size) || 300;
    const force = (sizeNum * 12 / (outer + 1)).toFixed(1);
    const sw = Math.max(6, Math.round(sizeNum * 0.05));

    const rings = defs.map((r, i) => {
      const orbit = outer - i;
      const track = `color-mix(in srgb, ${r.color} 14%, #0c0f14)`;
      const glow = cfg.glow ? `filter:drop-shadow(0 0 5px ${r.color});` : '';
      const fill = `--o-fill:${r.color};--o-stroke:${r.color};--o-stroke-width:${sw};${glow}`;
      // Solid track o-arc behind + o-progress value (o-progress back is hollow).
      return `<div class="orbit-${orbit}"><o-arc value="100" shape="rounded" style="--o-fill:${track};--o-stroke:${track};--o-stroke-width:${sw}"></o-arc></div>`
        + `<div class="orbit-${orbit}"><o-progress class="ok-ring-${r.key}" value="0" max="100" shape="rounded" style="${fill}"></o-progress></div>`;
    }).join('');

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot" style="--o-force:${force}px;">
          ${rings}
          <div class="orbit-0"><div class="satellite at-center">
            <div class="capsule ok-clock-ringtime" style="font-size:${(sizeNum * 0.13).toFixed(1)}px;"></div>
          </div></div>
        </div>
      </div>`;

    this._ringH = this.querySelector('.ok-ring-H');
    this._ringM = this.querySelector('.ok-ring-M');
    this._ringS = this.querySelector('.ok-ring-S');
    this._ringTime = this.querySelector('.ok-clock-ringtime');
  }

  sync(cfg) {
    this._paint(this._resolveDate(cfg), cfg.smooth);
    if (cfg.live) this._startLoop(cfg.smooth);
    else this._stopLoop();
  }

  onDisconnected() {
    this._stopLoop();
  }

  /** Point all hands and update digital/date readouts for a given Date. */
  _paint(date, smooth) {
    const h = date.getHours(), m = date.getMinutes();
    const s = smooth ? date.getSeconds() + date.getMilliseconds() / 1000 : date.getSeconds();

    // Rings face (iOS-style): fill concentric progress rings by time.
    if (this._ringTime) {
      const setV = (el, frac) => el && el.setAttribute('value', (frac * 100).toFixed(2));
      setV(this._ringH, ((h % 12) + m / 60) / 12);
      setV(this._ringM, (m + s / 60) / 60);
      setV(this._ringS, (s % 60) / 60);
      this._ringTime.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return;
    }

    const set = (el, deg) => el && el.style.setProperty('--o-angle-composite', `${deg}deg`);
    // Main hands (composite folds in -90° so 12 o'clock points up).
    set(this._hourHand, (h % 12) * 30 + m / 2 + s / 120 - 90);
    set(this._minHand, m * 6 + s / 10 - 90);
    set(this._secHand, s * 6 - 90);
    // Sub-dials.
    set(this._subSec, s * 6 - 90);
    set(this._sub24, ((h + m / 60) / 24) * 360 - 90);
    set(this._subDate, ((date.getDate() - 1) / 31) * 360 - 90);
    // Digital / date readouts.
    if (this._digital) {
      this._digital.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (this._dateEl) this._dateEl.textContent = String(date.getDate());
  }

  /** Resolve the configured time: explicit `time="HH:MM[:SS]"` or now. */
  _resolveDate(cfg) {
    if (cfg.time) {
      const [hh, mm, ss] = cfg.time.split(':').map((n) => parseInt(n, 10));
      const d = new Date();
      d.setHours(hh || 0, mm || 0, ss || 0, 0);
      return d;
    }
    return new Date();
  }

  _startLoop(smooth) {
    if (this._running && this._loopSmooth === smooth) return;
    this._stopLoop();
    this._running = true;
    this._loopSmooth = smooth;
    if (smooth) {
      const frame = () => {
        this._paint(new Date(), true);
        this._raf = requestAnimationFrame(frame);
      };
      this._raf = requestAnimationFrame(frame);
    } else {
      this._timer = setInterval(() => this._paint(new Date(), false), 1000);
    }
  }

  _stopLoop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._timer) clearInterval(this._timer);
    this._raf = this._timer = null;
  }
}

define('o-clock', OrbitClock);
