/**
 * <o-gauge> — high-level gauge component for Orbit.
 *
 * Collapses the canonical Orbit gauge recipe:
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-N (range/from) > <o-progress>
 *     └── .orbit-0 > .satellite.at-center > .capsule   (center label)
 *
 * ...into a single declarative tag:
 *
 *   <o-gauge value="72" unit="%"></o-gauge>
 *
 * Design note — LIGHT DOM on purpose:
 * Orbit positions elements through global CSS (cos()/sin()/:has()) and reads
 * inherited --o-* custom properties. A layout-composing component must therefore
 * render into the light DOM so the global orbit.css applies and the inner
 * <o-progress> participates in the cascade normally. This also keeps "view
 * source" honest: the output is exactly the documented Orbit structure.
 *
 * Requires @zumer/orbit (CSS + JS) to be loaded on the page so that
 * <o-progress> is registered. orbit-kit declares it as a peer dependency.
 */
// Side-effect import: injects the kit baseline (strips the default satellite
// outline) so a standalone <o-gauge> looks right without the rest of the kit.
import './base.js';

export class OrbitGauge extends HTMLElement {
  static get observedAttributes() {
    return [
      'value', 'max', 'range', 'from', 'orbit', 'size',
      'label', 'unit', 'fill', 'track', 'stroke-width', 'shape', 'glow'
    ];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  /** Parse a numeric attribute with a fallback. */
  _num(name, fallback) {
    const raw = this.getAttribute(name);
    if (raw === null || raw === '') return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  _readConfig() {
    const range = this._num('range', 270);
    return {
      value: this._num('value', 0),
      max: this._num('max', 100),
      range,
      // Default `from` centers the arc's gap at the bottom (6 o'clock),
      // matching the classic 3/4 gauge: range-270 -> from-225.
      from: this.hasAttribute('from')
        ? this._num('from', 0)
        : ((360 - range / 2) % 360 + 360) % 360,
      orbit: Math.round(this._num('orbit', 4)),
      size: this.getAttribute('size') || '200px',
      fill: this.getAttribute('fill') || '#6366f1',
      track: this.getAttribute('track') || '#262d38',
      strokeWidth: this._num('stroke-width', 8),
      shape: this.getAttribute('shape') || 'rounded',
      unit: this.getAttribute('unit') || '',
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
  }

  render() {
    const cfg = this._readConfig();
    // Only structural attributes require rebuilding the subtree; value/label
    // changes (e.g. during animation) just patch the existing nodes, so the
    // inner <o-progress> isn't torn down and recreated on every frame.
    const sig = [
      cfg.range, cfg.from, cfg.orbit, cfg.size,
      cfg.fill, cfg.track, cfg.strokeWidth, cfg.shape,
      this.getAttribute('glow')
    ].join('|');

    if (!this._built || this._sig !== sig) {
      this._build(cfg);
      this._sig = sig;
      this._built = true;
    }
    this._sync(cfg);
  }

  _build(cfg) {
    const glow = this.hasAttribute('glow')
      ? `filter:drop-shadow(0 0 ${this._num('glow', 6) || 6}px ${cfg.fill});`
      : '';
    // Track + value as two stacked <o-arc>s (each in its own orbit so they
    // don't chain): o-arc FILLS solid, unlike o-progress's back which only
    // strokes a hollow outline (the ugly border + center seam).
    const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
    const trackStyle = `--o-fill:${cfg.track};--o-stroke:${cfg.track};--o-stroke-width:${cfg.strokeWidth}`;
    const fillStyle = `--o-fill:${cfg.fill};--o-stroke:${cfg.fill};--o-stroke-width:${cfg.strokeWidth};${glow}`;

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot">
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc value="100" shape="${cfg.shape}" style="${trackStyle}"></o-arc></div>
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc class="o-gauge-fill" value="0" shape="${cfg.shape}" style="${fillStyle}"></o-arc></div>
          <div class="orbit-0">
            <div class="satellite at-center">
              <div class="capsule ok-hub"></div>
            </div>
          </div>
        </div>
      </div>`;

    this._fill = this.querySelector('.o-gauge-fill');
    this._center = this.querySelector('.capsule');
  }

  _sync(cfg) {
    if (this._fill) {
      const pct = Math.max(0, Math.min(100, (cfg.value / cfg.max) * 100));
      this._fill.setAttribute('value', pct.toFixed(2));
    }
    if (this._center) {
      this._center.textContent =
        cfg.label !== null ? cfg.label : `${cfg.value}${cfg.unit}`;
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('o-gauge')) {
  customElements.define('o-gauge', OrbitGauge);
}
