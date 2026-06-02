/**
 * <o-rings> — Apple-style concentric activity rings.
 *
 * Collapses the Orbit recipe:
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-{outer}   > <o-progress>   (ring 1, outermost)
 *     ├── .orbit-{outer-1} > <o-progress>   (ring 2)
 *     ├── ...
 *     └── .orbit-0 > .satellite.at-center > .capsule   (optional center label)
 *
 * ...into one tag fed by a JSON array (outer ring first):
 *
 *   <o-rings data='[{"value":80,"color":"#fa114f"},
 *                   {"value":55,"color":"#a3ff00"},
 *                   {"value":92,"color":"#00fff0"}]'></o-rings>
 *
 * Each datum may set its own `max` (default 100), `color`, and `label`.
 */
import { OrbitKitElement, define } from './base.js';

export class OrbitRings extends OrbitKitElement {
  static get observedAttributes() {
    return ['data', 'size', 'stroke-width', 'track', 'shape',
            'range', 'from', 'step', 'label', 'unit', 'glow'];
  }

  readConfig() {
    const range = this._num('range', 360);
    const data = (this._json('data', []) || []).map((d) => ({
      value: Number(d.value) || 0,
      max: Number(d.max) || 100,
      color: d.color || null,
      label: d.label != null ? String(d.label) : null
    }));
    return {
      data,
      range,
      from: this.hasAttribute('from') ? this._num('from', 0)
                                      : (range === 360 ? 0 : this._autoFrom(range)),
      size: this._str('size', '200px'),
      strokeWidth: this._num('stroke-width', 12),
      track: this.hasAttribute('track') ? this.getAttribute('track') : null,
      shape: this._str('shape', 'rounded'),
      step: Math.round(this._num('step', 1)),
      unit: this._str('unit', ''),
      glow: this.getAttribute('glow'),
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
  }

  structuralSignature(cfg) {
    return JSON.stringify(cfg);
  }

  build(cfg) {
    const palette = ['#fa114f', '#a3ff00', '#00fff0', '#ffd60a', '#ff9500'];
    // Outermost ring gets the highest orbit number so rings nest inward.
    const outer = 1 + cfg.data.length * cfg.step;
    // Scale --o-force so the outer ring fits within `size` (orbit-N = N/12 *
    // force) with a margin for the rounded caps + glow bloom, instead of the
    // default 500px that overflows the box.
    const sizeNum = parseFloat(cfg.size) || 200;
    const force = (sizeNum * 12 / (outer + 1)).toFixed(1);

    const rings = cfg.data.map((d, i) => {
      const orbit = outer - i * cfg.step;
      const color = d.color || palette[i % palette.length];
      // iOS-style track: a dim, OPAQUE wash of the ring's own color, drawn as a
      // separate solid o-arc (o-progress's back only strokes a hollow outline).
      const track = cfg.track || `color-mix(in srgb, ${color} 14%, #0c0f14)`;
      const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
      const fill = `--o-fill:${color};--o-stroke:${color};--o-stroke-width:${cfg.strokeWidth};${this._glow(color)}`;
      return `
        <div class="orbit-${orbit}" style="${ring}"><o-arc value="100" shape="${cfg.shape}" style="--o-fill:${track};--o-stroke:${track};--o-stroke-width:${cfg.strokeWidth}"></o-arc></div>
        <div class="orbit-${orbit}" style="${ring}"><o-progress value="${d.value}" max="${d.max}" shape="${cfg.shape}" style="${fill}"></o-progress></div>`;
    }).join('');

    const center = cfg.label !== null
      ? `<div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub">${cfg.label}${cfg.unit}</div></div></div>`
      : '';

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot" style="--o-force:${force}px;">
          ${rings}
          ${center}
        </div>
      </div>`;
  }
}

define('o-rings', OrbitRings);
