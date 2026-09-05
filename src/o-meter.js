import { OrbitKitElement, define, finiteNumber, cssValue, escapeHTML as e } from './base.js';

/** Basic needle gauge retained alongside the richer o-instrument presets. */
export class OrbitMeter extends OrbitKitElement {
  static get observedAttributes() {
    return ['value', 'min', 'max', 'range', 'from', 'size', 'ticks', 'zones', 'fill', 'unit', 'label', 'needle-color', 'glow'];
  }
  readConfig() {
    let min = this._num('min', 0), max = this._num('max', 100);
    if (!(max > min) || !Number.isFinite(max - min)) { min = 0; max = 100; }
    const range = Math.max(0, Math.min(360, this._num('range', 270)));
    return {
      value: this._num('value', min), min, max, span: max - min, range,
      from: this.hasAttribute('from') ? this._num('from', 0) : this._autoFrom(range),
      zones: this._array('zones').map((z) => ({ from: Math.max(min, finiteNumber(z.from, min)), to: Math.min(max, finiteNumber(z.to, min)), color: cssValue(z.color, this._color('fill', '#6366f1')) })).filter((z) => z.to > z.from),
      size: this._size('size', '220px'), ticks: Math.max(0, Math.min(360, Math.round(this._num('ticks', 9)))),
      needleColor: this._color('needle-color', '#e5e7eb'), unit: this._str('unit', ''),
      glow: this.getAttribute('glow'), label: this.getAttribute('label')
    };
  }
  structuralSignature({ value, label, unit, ...structure }) { return JSON.stringify(structure); }
  build(cfg) {
    const frame = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
    const ticks = cfg.ticks ? `<div class="orbit-6 ${cfg.range < 360 ? 'fit-range' : ''}" style="${frame}">${Array.from({ length: cfg.ticks }, () => '<div class="vector inner-orbit"></div>').join('')}</div>` : '';
    const zones = cfg.zones.map((z) => {
      const from = cfg.from + (z.from - cfg.min) / cfg.span * cfg.range;
      const style = `--o-fill:${z.color};--o-stroke:${z.color};--o-stroke-width:6;--o-gap:0;${this._glow(z.color)}`;
      return `<div class="orbit-5" style="--o-range:${cfg.range}deg;--o-from:${from}deg;"><o-arc value="${((z.to - z.from) / cfg.span * 100).toFixed(4)}" style="${e(style)}"></o-arc></div>`;
    }).join('');
    this.innerHTML = `<div class="bigbang" style="width:${e(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
      <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / 7);">
        ${ticks}${zones}
        <div class="orbit-0"><div class="vector outer-orbit grow-4x o-meter-needle" style="background:${e(cfg.needleColor)};height:3px;${e(this._glow(cfg.needleColor))}"></div></div>
        <div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub o-meter-readout"></div></div></div>
      </div></div>`;
    this._needle = this.querySelector('.o-meter-needle');
    this._readout = this.querySelector('.o-meter-readout');
  }
  sync(cfg) {
    const value = Math.min(cfg.max, Math.max(cfg.min, cfg.value));
    const angle = cfg.from - 90 + (value - cfg.min) / cfg.span * cfg.range;
    this._needle?.style.setProperty('--o-angle-composite', `${angle}deg`);
    const text = cfg.label ?? `${Math.round(value)}${cfg.unit}`;
    if (this._readout) this._readout.textContent = text;
    this._describe(`${text}; ${value}${cfg.unit}, range ${cfg.min} to ${cfg.max}`);
  }
}
define('o-meter', OrbitMeter);
