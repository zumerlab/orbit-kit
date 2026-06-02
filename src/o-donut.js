/**
 * <o-donut> — data-driven donut / pie chart.
 *
 * Collapses the Orbit recipe:
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-N > <o-arc> × segments   (each arc stacks onto the previous)
 *     └── .orbit-0 > .satellite.at-center > .capsule   (center label)
 *
 * ...into one tag fed by a JSON array:
 *
 *   <o-donut data='[{"value":52,"color":"#f97316","label":"Rent"},
 *                   {"value":28,"color":"#eab308"},
 *                   {"value":20,"color":"#22c55e"}]'
 *            label="$2.4k" unit=""></o-donut>
 *
 * Segments are normalized to the sum of their values (so they fill the ring),
 * unless `total` is given — then values are taken as a fraction of `total`,
 * leaving an empty remainder (partial donut).
 */
import { OrbitKitElement, define } from './base.js';

export class OrbitDonut extends OrbitKitElement {
  static get observedAttributes() {
    return ['data', 'size', 'orbit', 'stroke-width', 'gap', 'track',
            'range', 'from', 'label', 'unit', 'total', 'glow'];
  }

  readConfig() {
    const range = this._num('range', 360);
    const data = (this._json('data', []) || []).map((d) => ({
      value: Number(d.value) || 0,
      color: d.color || null,
      label: d.label != null ? String(d.label) : null
    }));
    const sum = data.reduce((a, d) => a + d.value, 0) || 1;
    const total = this._num('total', sum);
    return {
      data,
      total,
      range,
      from: this.hasAttribute('from') ? this._num('from', 0) : 0,
      orbit: Math.round(this._num('orbit', 3)),
      size: this._str('size', '200px'),
      strokeWidth: this._num('stroke-width', 14),
      gap: this._num('gap', 2),
      shape: this._str('shape', 'none'),
      track: this._str('track', 'rgba(255,255,255,.05)'),
      unit: this._str('unit', ''),
      glow: this.getAttribute('glow'),
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
  }

  structuralSignature(cfg) {
    // Re-render the whole subtree whenever the data or geometry changes;
    // segment count and arc values are all structural here.
    return JSON.stringify(cfg);
  }

  build(cfg) {
    const palette = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444',
                     '#06b6d4', '#a855f7', '#ec4899'];

    const segments = cfg.data.map((d, i) => {
      const pct = (d.value / cfg.total) * 100;
      const color = d.color || palette[i % palette.length];
      const style = [
        `--o-fill:${color}`,
        `--o-stroke:${color}`,
        `--o-stroke-width:${cfg.strokeWidth}`,
        `--o-gap:${cfg.gap}`,
        this._glow(color)
      ].join(';');
      const title = d.label ? ` title="${d.label}: ${d.value}"` : '';
      return `<o-arc value="${pct.toFixed(4)}" shape="${cfg.shape}" style="${style}"${title}></o-arc>`;
    }).join('');

    // Faint full-circle track underneath the segments (rounded to match).
    const track = cfg.track && cfg.track !== 'transparent'
      ? `<o-arc value="100" style="--o-fill:${cfg.track};--o-stroke:${cfg.track};--o-stroke-width:${cfg.strokeWidth}"></o-arc>`
      : '';

    const center = cfg.label !== null
      ? `<div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub">${cfg.label}${cfg.unit}</div></div></div>`
      : '';

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot">
          <div class="orbit-${cfg.orbit}" style="--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;">
            ${track}${segments}
          </div>
          ${center}
        </div>
      </div>`;
  }
}

define('o-donut', OrbitDonut);
