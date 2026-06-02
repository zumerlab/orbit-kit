/**
 * <o-meter> — speedometer / tachometer gauge with ticks, colored zones and a needle.
 *
 * Collapses the Orbit recipe:
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-{outer}   (range/from, fit-range) > .vector × ticks
 *     ├── .orbit-{mid}     (range/from)            > <o-arc> × zones
 *     ├── .orbit-{inner}   (range/from)            > <o-arc shape="arrow"> (needle)
 *     └── .orbit-0 > .satellite.at-center > .capsule   (value + unit)
 *
 * ...into one tag:
 *
 *   <o-meter value="125" min="0" max="240" unit="km/h" ticks="9"
 *     zones='[{"from":0,"to":140,"color":"#22c55e"},
 *             {"from":140,"to":200,"color":"#eab308"},
 *             {"from":200,"to":240,"color":"#ef4444"}]'></o-meter>
 *
 * Zones are given in value units (min..max). The needle and tick layers are
 * cheap to patch, so changing `value` only re-points the needle (no rebuild).
 */
import { OrbitKitElement, define } from './base.js';

export class OrbitMeter extends OrbitKitElement {
  static get observedAttributes() {
    return ['value', 'min', 'max', 'range', 'from', 'size', 'ticks',
            'zones', 'fill', 'unit', 'label', 'needle-color', 'glow'];
  }

  readConfig() {
    const range = this._num('range', 270);
    const min = this._num('min', 0);
    const max = this._num('max', 100);
    const span = (max - min) || 1;
    const zones = (this._json('zones', []) || []).map((z) => ({
      from: Number(z.from) || 0,
      to: Number(z.to) || 0,
      color: z.color || '#6366f1'
    }));
    return {
      value: this._num('value', min),
      min, max, span, range, zones,
      from: this.hasAttribute('from') ? this._num('from', 0) : this._autoFrom(range),
      size: this._str('size', '220px'),
      ticks: Math.max(0, Math.round(this._num('ticks', 9))),
      needleColor: this._str('needle-color', '#e5e7eb'),
      unit: this._str('unit', ''),
      glow: this.getAttribute('glow'),
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
  }

  structuralSignature(cfg) {
    // Everything except `value` and `label` is structural; the needle and the
    // center readout are patched in sync() so the arc isn't rebuilt per frame.
    const { value, label, ...rest } = cfg;
    return JSON.stringify(rest);
  }

  build(cfg) {
    const ticks = Array.from({ length: cfg.ticks }, () => '<div class="vector"></div>').join('');

    const zones = cfg.zones.map((z) => {
      const pct = ((z.to - z.from) / cfg.span) * 100;
      const style = `--o-fill:${z.color};--o-stroke:${z.color};--o-stroke-width:6;--o-gap:0;${this._glow(z.color)}`;
      return `<o-arc value="${pct.toFixed(4)}" style="${style}"></o-arc>`;
    }).join('');

    const zoneLayer = zones
      ? `<div class="orbit-5" style="--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;">${zones}</div>`
      : '';

    const tickLayer = cfg.ticks
      ? `<div class="orbit-6 fit-range" style="--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;">${ticks}</div>`
      : '';

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot">
          ${tickLayer}
          ${zoneLayer}
          <div class="orbit-4" style="--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;">
            <o-arc class="o-meter-needle" value="0" shape="arrow" style="--o-fill:${cfg.needleColor};--o-stroke:${cfg.needleColor}"></o-arc>
          </div>
          <div class="orbit-0">
            <div class="satellite at-center">
              <div class="capsule ok-hub o-meter-readout"></div>
            </div>
          </div>
        </div>
      </div>`;

    this._needle = this.querySelector('.o-meter-needle');
    this._readout = this.querySelector('.o-meter-readout');
  }

  sync(cfg) {
    const clamped = Math.min(cfg.max, Math.max(cfg.min, cfg.value));
    const pct = ((clamped - cfg.min) / cfg.span) * 100;
    if (this._needle) this._needle.setAttribute('value', pct.toFixed(2));
    if (this._readout) {
      this._readout.textContent = cfg.label !== null
        ? cfg.label
        : `${Math.round(clamped)}${cfg.unit}`;
    }
  }
}

define('o-meter', OrbitMeter);
