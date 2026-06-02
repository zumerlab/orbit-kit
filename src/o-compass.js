/**
 * <o-compass> — heading indicator.
 *
 * A fixed dial with a red lubber index at the top; the compass card (36 ticks
 * + cardinal letters) rotates so the current `heading` sits under the index —
 * the way an aircraft heading indicator reads. Cardinal letters stay upright
 * (`spin-lock`). Rotating the card is done through Orbit's own `--o-from`, so
 * changing `heading` only re-rotates (no rebuild).
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-6 (filled)              — dial face + bezel
 *     ├── .orbit-6 (rotates) > .vector × 36   — tick scale
 *     ├── .orbit-5 (rotates) > .satellite × cardinals (spin-lock)
 *     ├── .orbit-6 > .satellite.angle-0 > lubber index (fixed)
 *     └── .orbit-0 > heading readout
 *
 *   <o-compass heading="45"></o-compass>
 *   <o-compass heading="120" labels="N,NE,E,SE,S,SW,W,NW"></o-compass>
 */
import { OrbitKitElement, define, injectStyleOnce } from './base.js';

const CMP_CSS = `
o-compass .ok-cmp-dial {
  background: var(--ok-cmp-face, radial-gradient(circle at 50% 35%, #1b212b, #0a0d12));
  box-shadow: inset 0 0 0 4px var(--ok-cmp-bezel, #2a3340), inset 0 4px 18px rgba(0,0,0,.65);
}
o-compass .ok-cmp-rotor { transition: transform .3s ease; }
o-compass .ok-cmp-tick   { background: var(--ok-cmp-tick, rgba(203,213,225,.4)); height: 1px; }
o-compass .ok-cmp-tick-M { background: #e6edf3; height: 2px; border-radius: 1px; }
o-compass .ok-cmp-card   { font-weight: 800; color: #e6edf3; }
o-compass .ok-cmp-card.north { color: var(--ok-cmp-accent, #ef4444); }
o-compass .ok-cmp-lubber {
  width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent;
  border-top: 12px solid var(--ok-cmp-accent, #ef4444);
}
o-compass .ok-cmp-readout { display: flex; flex-direction: column; align-items: center; line-height: 1.05; }
o-compass .ok-cmp-deg { font-weight: 800; font-size: 1.5em; font-variant-numeric: tabular-nums; color: #f8fafc; }
o-compass .ok-cmp-sub { font-size: .6em; letter-spacing: .15em; opacity: .6; }
`;

// Compass point abbreviations for the heading readout.
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class OrbitCompass extends OrbitKitElement {
  static get observedAttributes() {
    return ['heading', 'size', 'labels', 'fill', 'unit', 'glow'];
  }

  readConfig() {
    const labels = this._str('labels', 'N,E,S,W').split(',').map((s) => s.trim()).filter(Boolean);
    return {
      heading: ((this._num('heading', 0) % 360) + 360) % 360,
      labels,
      size: this._str('size', '220px'),
      fill: this._str('fill', '#ef4444'),
      unit: this._str('unit', '°'),
      glow: this.hasAttribute('glow')
    };
  }

  structuralSignature(cfg) {
    const { heading, ...rest } = cfg;
    return JSON.stringify(rest);
  }

  build(cfg) {
    injectStyleOnce('orbit-kit-compass', CMP_CSS);
    this.style.setProperty('--ok-cmp-accent', cfg.fill);

    // orbit-6 is the outermost ring; scale --o-force so it fills `size`.
    const dialPx = parseFloat(cfg.size) || 220;
    const force = (dialPx * 12 / 6).toFixed(1);
    const baseFont = (dialPx * 0.07).toFixed(1);

    // 36 ticks every 10°; every 9th (90°) is a long cardinal tick.
    const ticks = Array.from({ length: 36 }, (_, i) =>
      `<div class="vector inner-orbit ${i % 9 === 0 ? 'shrink-30 ok-cmp-tick-M' : 'shrink-60 ok-cmp-tick'}"></div>`).join('');

    // Cardinals distributed by count (NO fit-range — that overlaps on a 360 loop).
    // Plain satellites (NOT spin-lock): the capsule stays upright by default
    // while the ring's --o-from rotates only their POSITION. spin-lock would
    // over-rotate the letters once we drive --o-from for the heading.
    const cards = cfg.labels.map((l, i) =>
      `<div class="satellite"><div class="capsule ok-cmp-card${i === 0 ? ' north' : ''}">${l}</div></div>`).join('');

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;font-size:${baseFont}px;">
        <div class="gravity-spot" style="--o-force:${force}px;">
          <div class="orbit-6 ok-cmp-dial"></div>
          <div class="orbit-6 ok-cmp-rotor o-cmp-ticks" style="--o-from:0deg;">${ticks}</div>
          <div class="orbit-5 ok-cmp-rotor o-cmp-cards" style="--o-from:0deg;">${cards}</div>
          <div class="orbit-6"><div class="satellite angle-0"><div class="capsule ok-cmp-lubber"></div></div></div>
          <div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-cmp-readout">
            <span class="ok-cmp-deg"></span><span class="ok-cmp-sub"></span>
          </div></div></div>
        </div>
      </div>`;

    this._ticks = this.querySelector('.o-cmp-ticks');
    this._cards = this.querySelector('.o-cmp-cards');
    this._deg = this.querySelector('.ok-cmp-deg');
    this._sub = this.querySelector('.ok-cmp-sub');
  }

  sync(cfg) {
    // Rotate the card so the heading lands under the fixed top index.
    const rot = `${-cfg.heading}deg`;
    if (this._ticks) this._ticks.style.setProperty('--o-from', rot);
    if (this._cards) this._cards.style.setProperty('--o-from', rot);
    if (this._deg) this._deg.textContent = `${String(Math.round(cfg.heading)).padStart(3, '0')}${cfg.unit}`;
    if (this._sub) this._sub.textContent = POINTS[Math.round(cfg.heading / 45) % 8];
  }
}

define('o-compass', OrbitCompass);
