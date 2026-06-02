/**
 * <o-radar> — radar / scope display.
 *
 * Built the idiomatic Orbit way: the range rings ARE orbits — each `.orbit-N`
 * is a concentric circle, so we just style its border instead of stacking
 * full-circle arcs. On top of that grid: radial cross-hair spokes (`.vector`),
 * a rotating sweep wedge with a bright leading edge, and glowing blips placed
 * on the orbit matching their distance and aimed with `--o-angle-composite`.
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-{2..outer}  (styled border)        — range rings
 *     ├── .orbit-{outer} fit-range range-360 > .vector × spokes
 *     ├── .orbit-{outer} (rotating) > <o-arc> wedge — the sweep
 *     ├── .orbit-{level}  > .satellite (angled)     — one per blip
 *     └── .orbit-0 > .satellite.at-center           — hub + label
 *
 *   <o-radar rings="4" color="#22d3ee" spokes="8"
 *     targets='[{"angle":60,"dist":0.8},{"angle":200,"dist":0.45}]'></o-radar>
 *
 * `angle` is degrees clockwise from North (top); `dist` is 0–1 from center.
 */
import { OrbitKitElement, define, injectStyleOnce } from './base.js';

const RADAR_CSS = `
@keyframes o-radar-sweep { to { transform: rotate(360deg); } }
@keyframes o-radar-ping {
  0%   { transform: scale(.5); opacity: 1; }
  70%  { opacity: .45; }
  100% { transform: scale(1.7); opacity: 0; }
}
o-radar .o-radar-sweep { animation: o-radar-sweep var(--o-radar-speed, 4s) linear infinite; transform-origin: center; }
o-radar .o-radar-blip { position: relative; border-radius: 50%; }
o-radar .o-radar-blip::after {
  content: ""; position: absolute; inset: -4px; border-radius: 50%;
  border: 1px solid currentColor; animation: o-radar-ping 1.8s ease-out infinite;
}
`;

export class OrbitRadar extends OrbitKitElement {
  static get observedAttributes() {
    return ['targets', 'rings', 'spokes', 'size', 'color', 'sweep', 'sweep-width', 'speed', 'label'];
  }

  readConfig() {
    const targets = (this._json('targets', []) || []).map((t) => ({
      angle: Number(t.angle) || 0,
      dist: Math.min(1, Math.max(0, t.dist == null ? 0.5 : Number(t.dist))),
      color: t.color || null
    }));
    return {
      targets,
      rings: Math.max(1, Math.round(this._num('rings', 4))),
      spokes: Math.max(0, Math.round(this._num('spokes', 8))),
      size: this._str('size', '240px'),
      color: this._str('color', '#22d3ee'),
      sweep: this._str('sweep', 'true') !== 'false',
      sweepWidth: Math.min(300, Math.max(10, this._num('sweep-width', 110))),
      speed: this._num('speed', 4),
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
  }

  structuralSignature(cfg) {
    return JSON.stringify(cfg);
  }

  build(cfg) {
    injectStyleOnce('orbit-kit-radar', RADAR_CSS);

    const C = cfg.color;
    // Two orbit steps per ring so the grid breathes; outer ring hosts sweep/spokes.
    const outer = cfg.rings * 2;

    // Range rings — native orbit borders, outermost a touch brighter.
    const rings = Array.from({ length: cfg.rings }, (_, i) => {
      const orbit = (i + 1) * 2;
      const alpha = 0.1 + (i / cfg.rings) * 0.22;
      return `<div class="orbit-${orbit}" style="border:1px solid ${this._rgba(C, alpha)};"></div>`;
    }).join('');

    // Cross-hair spokes — radial vectors, evenly distributed.
    const spokes = cfg.spokes
      ? `<div class="orbit-${outer} fit-range range-360 from-0">
           ${Array.from({ length: cfg.spokes }, () =>
             `<div class="vector" style="background:${this._rgba(C, 0.14)};height:1px;"></div>`).join('')}
         </div>`
      : '';

    // Sweep — a real rotating beam: a conic-gradient disc painted on the outer
    // orbit circle, fading from a transparent tail to a crisp bright leading
    // edge over `sweepWidth` degrees. Smooth, not a blocky fan of arcs.
    const w = cfg.sweepWidth;
    const beam = `conic-gradient(from 0deg,`
      + ` ${this._rgba(C, 0)} 0deg,`
      + ` ${this._rgba(C, 0.05)} ${(w * 0.5).toFixed(1)}deg,`
      + ` ${this._rgba(C, 0.30)} ${(w - 3).toFixed(1)}deg,`
      + ` ${this._rgba(C, 0.85)} ${w}deg,`
      + ` transparent ${w}deg, transparent 360deg)`;
    const sweep = cfg.sweep
      ? `<div class="orbit-${outer} o-radar-sweep" style="--o-radar-speed:${cfg.speed}s;background:${beam};"></div>`
      : '';

    // Blips — each on the orbit matching its distance, aimed by angle.
    const blips = cfg.targets.map((t) => {
      const color = t.color || C;
      const level = Math.min(outer, Math.max(1, Math.round(t.dist * outer)));
      return `<div class="orbit-${level}">
                <div class="satellite" style="--o-angle-composite:calc(${t.angle}deg - 90deg);color:${color};">
                  <div class="capsule o-radar-blip" style="width:9px;height:9px;background:${color};box-shadow:0 0 10px ${color};"></div>
                </div>
              </div>`;
    }).join('');

    const center = `
      <div class="orbit-0">
        <div class="satellite at-center">
          <div class="capsule" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${C};box-shadow:0 0 8px ${C};"></span>
            ${cfg.label !== null ? `<span style="font-weight:800;font-size:.7em;letter-spacing:.15em;color:${C};">${cfg.label}</span>` : ''}
          </div>
        </div>
      </div>`;

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot">
          ${rings}
          ${spokes}
          ${sweep}
          ${blips}
          ${center}
        </div>
      </div>`;
  }

  /** Convert #rrggbb (or pass-through) to rgba() at the given alpha. */
  _rgba(color, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    if (!m) return color;
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }
}

define('o-radar', OrbitRadar);
