import { OrbitKitElement, define, finiteNumber, cssValue, escapeHTML as e } from './base.js';
const PALETTE = ['#fa114f', '#a3ff00', '#00fff0', '#ffd60a', '#ff9500'];

/** Concentric activity rings, outermost first. */
export class OrbitRings extends OrbitKitElement {
  static get observedAttributes() {
    return ['data', 'size', 'stroke-width', 'track', 'shape', 'range', 'from', 'step', 'label', 'unit', 'glow'];
  }
  readConfig() {
    const range = Math.max(0, Math.min(360, this._num('range', 360)));
    const data = this._array('data').map((d, i) => ({
      value: Math.max(0, finiteNumber(d.value)), max: finiteNumber(d.max, 100) > 0 ? finiteNumber(d.max, 100) : 100,
      color: cssValue(d.color, PALETTE[i % PALETTE.length]), label: d.label == null ? null : String(d.label)
    }));
    return {
      data, range, from: this.hasAttribute('from') ? this._num('from', 0) : (range === 360 ? 0 : this._autoFrom(range)),
      size: this._size('size', '200px'), strokeWidth: Math.max(0, this._num('stroke-width', 12)),
      track: this._color('track', ''), shape: this._str('shape', 'rounded'), step: Math.max(1, Math.round(this._num('step', 1))),
      unit: this._str('unit', ''), glow: this.getAttribute('glow'), label: this.getAttribute('label')
    };
  }
  structuralSignature({ data, label, unit, ...structure }) { return JSON.stringify({ ...structure, count: data.length }); }
  build(cfg) {
    const outer = 1 + cfg.data.length * cfg.step;
    const rings = cfg.data.map((d, i) => {
      const orbit = outer - i * cfg.step;
      const track = cfg.track || `color-mix(in srgb, ${d.color} 14%, #0c0f14)`;
      const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
      const fill = `--o-fill:${d.color};--o-stroke:${d.color};--o-stroke-width:${cfg.strokeWidth};${this._glow(d.color)}`;
      return `<div class="orbit-${orbit}" style="${ring}"><o-arc class="ok-rings-track" value="100" shape="${e(cfg.shape)}" style="${e(`--o-fill:${track};--o-stroke:${track};--o-stroke-width:${cfg.strokeWidth}`)}"></o-arc></div>
        <div class="orbit-${orbit}" style="${ring}"><o-progress class="ok-rings-value" value="${Math.min(d.value, d.max)}" max="${d.max}" shape="${e(cfg.shape)}" style="${e(fill)}"></o-progress></div>`;
    }).join('');
    this.innerHTML = `<div class="bigbang" style="width:${e(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
      <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / ${outer + 1});">${rings}
        <div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub">${e(cfg.label ?? '')}${cfg.label == null ? '' : e(cfg.unit)}</div></div></div>
      </div></div>`;
    this._rings = [...this.querySelectorAll('.ok-rings-value')];
    this._tracks = [...this.querySelectorAll('.ok-rings-track')];
    this._center = this.querySelector('.ok-hub');
  }
  sync(cfg) {
    this._rings?.forEach((ring, i) => {
      const d = cfg.data[i], track = cfg.track || `color-mix(in srgb, ${d.color} 14%, #0c0f14)`;
      ring.setAttribute('max', String(d.max));
      ring.setAttribute('value', String(Math.min(d.value, d.max)));
      ring.style.setProperty('--o-fill', d.color);
      ring.style.setProperty('--o-stroke', d.color);
      if (cfg.glow != null) ring.style.setProperty('filter', `drop-shadow(0 0 ${Math.max(0, this._num('glow', 6))}px ${d.color})`);
      this._tracks[i]?.style.setProperty('--o-fill', track);
      this._tracks[i]?.style.setProperty('--o-stroke', track);
    });
    if (this._center) {
      this._center.textContent = cfg.label == null ? '' : `${cfg.label}${cfg.unit}`;
      this._center.hidden = cfg.label == null;
    }
    this._describe([cfg.label, ...cfg.data.map((d, i) => `${d.label ?? `Ring ${i + 1}`}: ${d.value} of ${d.max}${cfg.unit}`)].filter(Boolean).join('; ') || 'Empty activity rings');
  }
}
define('o-rings', OrbitRings);
