import { OrbitKitElement, define, escapeHTML as e } from './base.js';

/** A single-value radial gauge. Value/label updates retain the existing arc. */
export class OrbitGauge extends OrbitKitElement {
  static get observedAttributes() {
    return ['value', 'max', 'range', 'from', 'orbit', 'size', 'label', 'unit', 'fill', 'track', 'stroke-width', 'shape', 'glow'];
  }

  readConfig() {
    const range = Math.max(0, Math.min(360, this._num('range', 270)));
    const max = this._num('max', 100);
    return {
      value: this._num('value', 0), max: max > 0 ? max : 100, range,
      from: this.hasAttribute('from') ? this._num('from', 0) : this._autoFrom(range),
      orbit: Math.max(1, Math.round(this._num('orbit', 4))), size: this._size('size', '200px'),
      fill: this._color('fill', '#6366f1'), track: this._color('track', '#262d38'),
      strokeWidth: Math.max(0, this._num('stroke-width', 8)), shape: this._str('shape', 'rounded'),
      unit: this._str('unit', ''), label: this.getAttribute('label'), glow: this.getAttribute('glow')
    };
  }

  structuralSignature({ value, max, label, unit, ...structure }) { return JSON.stringify(structure); }
  // Retain the original public helper names for existing integrations.
  _readConfig() { return this.readConfig(); }
  render() { this._render(); }

  build(cfg) {
    const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
    const track = `--o-fill:${cfg.track};--o-stroke:${cfg.track};--o-stroke-width:${cfg.strokeWidth}`;
    const fill = `--o-fill:${cfg.fill};--o-stroke:${cfg.fill};--o-stroke-width:${cfg.strokeWidth};${this._glow(cfg.fill)}`;
    this.innerHTML = `
      <div class="bigbang" style="width:${e(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
        <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / ${cfg.orbit + 1});">
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc value="100" shape="${e(cfg.shape)}" style="${e(track)}"></o-arc></div>
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc class="o-gauge-fill" value="0" shape="${e(cfg.shape)}" style="${e(fill)}"></o-arc></div>
          <div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub"></div></div></div>
        </div>
      </div>`;
    this._fill = this.querySelector('.o-gauge-fill');
    this._center = this.querySelector('.capsule');
  }

  sync(cfg) {
    const value = Math.max(0, Math.min(cfg.max, cfg.value));
    const pct = value / cfg.max * 100;
    const text = cfg.label ?? `${cfg.value}${cfg.unit}`;
    this._fill?.setAttribute('value', pct.toFixed(2));
    if (this._center) this._center.textContent = text;
    this._describe(`${text}; ${value} of ${cfg.max}${cfg.unit}`);
  }
  _build(cfg) { this.build(cfg); }
  _sync(cfg) { this.sync(cfg); }
}
define('o-gauge', OrbitGauge);
