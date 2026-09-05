import { OrbitKitElement, define, finiteNumber, cssValue, escapeHTML as e } from './base.js';

const PALETTE = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#06b6d4', '#a855f7', '#ec4899'];

/** Data-driven donut. Tracks are separate from the segment stack. */
export class OrbitDonut extends OrbitKitElement {
  static get observedAttributes() {
    return ['data', 'size', 'orbit', 'stroke-width', 'gap', 'track', 'range', 'from', 'label', 'unit', 'total', 'shape', 'glow'];
  }

  readConfig() {
    const data = this._array('data').map((d, i) => ({
      value: Math.max(0, finiteNumber(d.value)), color: cssValue(d.color, PALETTE[i % PALETTE.length]),
      label: d.label == null ? null : String(d.label)
    }));
    // Normalize through a scaled sum to avoid overflow on large finite values.
    const largest = data.reduce((n, d) => Math.max(n, d.value), 1);
    const sum = data.reduce((n, d) => n + d.value / largest, 0) * largest;
    const requestedTotal = this._num('total', sum);
    const total = requestedTotal > 0 ? requestedTotal : (sum || 1);
    let remaining = 100;
    const weightSum = data.reduce((n, d) => n + d.value / largest, 0) || 1;
    for (const d of data) {
      const pct = Number.isFinite(total) ? d.value / total * 100 : (d.value / largest) / weightSum * 100;
      d.pct = Math.max(0, Math.min(remaining, pct));
      remaining = Math.max(0, remaining - d.pct);
    }
    return {
      data, total, range: Math.max(0, Math.min(360, this._num('range', 360))), from: this._num('from', 0),
      orbit: Math.max(1, Math.round(this._num('orbit', 3))), size: this._size('size', '200px'),
      strokeWidth: Math.max(0, this._num('stroke-width', 14)), gap: Math.max(0, this._num('gap', 2)),
      shape: this._str('shape', 'none'), track: this._color('track', 'rgba(255,255,255,.05)'),
      unit: this._str('unit', ''), glow: this.getAttribute('glow'), label: this.getAttribute('label')
    };
  }

  structuralSignature({ data, total, label, unit, ...structure }) {
    return JSON.stringify({ ...structure, count: data.length });
  }

  build(cfg) {
    const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
    const segments = cfg.data.map((d) => {
      const style = `--o-fill:${d.color};--o-stroke:${d.color};--o-stroke-width:${cfg.strokeWidth};--o-gap:${cfg.gap};${this._glow(d.color)}`;
      return `<o-arc class="ok-donut-segment" value="${d.pct.toFixed(4)}" shape="${e(cfg.shape)}" style="${e(style)}" title="${e(d.label ?? '')}: ${d.value}"></o-arc>`;
    }).join('');
    const track = cfg.track !== 'transparent'
      ? `<div class="orbit-${cfg.orbit}" style="${ring}"><o-arc value="100" style="${e(`--o-fill:${cfg.track};--o-stroke:${cfg.track};--o-stroke-width:${cfg.strokeWidth}`)}"></o-arc></div>` : '';
    this.innerHTML = `
      <div class="bigbang" style="width:${e(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
        <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / ${cfg.orbit + 1});">
          ${track}<div class="orbit-${cfg.orbit}" style="${ring}">${segments}</div>
          <div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub">${e(cfg.label ?? '')}${cfg.label == null ? '' : e(cfg.unit)}</div></div></div>
        </div>
      </div>`;
    this._segments = [...this.querySelectorAll('.ok-donut-segment')];
    this._center = this.querySelector('.ok-hub');
  }

  sync(cfg) {
    this._segments?.forEach((arc, i) => {
      const d = cfg.data[i];
      arc.setAttribute('value', d.pct.toFixed(4));
      arc.setAttribute('title', `${d.label ?? `Segment ${i + 1}`}: ${d.value}${cfg.unit}`);
      arc.style.setProperty('--o-fill', d.color);
      arc.style.setProperty('--o-stroke', d.color);
      if (cfg.glow != null) arc.style.setProperty('filter', `drop-shadow(0 0 ${Math.max(0, this._num('glow', 6))}px ${d.color})`);
    });
    if (this._center) {
      this._center.textContent = cfg.label == null ? '' : `${cfg.label}${cfg.unit}`;
      this._center.hidden = cfg.label == null;
    }
    this._describe([cfg.label, ...cfg.data.map((d, i) => `${d.label ?? `Segment ${i + 1}`}: ${d.value}${cfg.unit}`)].filter(Boolean).join('; ') || 'Empty donut chart');
  }
}
define('o-donut', OrbitDonut);
