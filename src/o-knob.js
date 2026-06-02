/**
 * <o-knob> — interactive rotary control.
 *
 * Collapses the Orbit recipe:
 *
 *   .bigbang > .gravity-spot
 *     ├── .orbit-N > <o-arc shape="circle-a">   (the dial)
 *     └── .orbit-0 > .satellite.at-center > .capsule   (value readout)
 *
 * ...into one tag that behaves like a form control:
 *
 *   <o-knob value="65" min="0" max="100" unit="%" fill="#a1a1aa"></o-knob>
 *
 * Interaction: drag vertically (or use the mouse wheel / arrow keys when
 * focused) to change the value. Emits a bubbling `input` event on every change
 * and `change` when the gesture ends. `el.value` reads/writes the number.
 */
import { OrbitKitElement, define } from './base.js';

export class OrbitKnob extends OrbitKitElement {
  static get observedAttributes() {
    return ['value', 'min', 'max', 'step', 'size', 'orbit', 'fill', 'track',
            'stroke-width', 'shape', 'unit', 'label', 'disabled', 'range', 'from', 'glow'];
  }

  readConfig() {
    const range = this._num('range', 270);
    const min = this._num('min', 0);
    const max = this._num('max', 100);
    return {
      value: this._num('value', min),
      min, max,
      span: (max - min) || 1,
      step: this._num('step', 1),
      range,
      from: this.hasAttribute('from') ? this._num('from', 0) : this._autoFrom(range),
      orbit: Math.round(this._num('orbit', 4)),
      size: this._str('size', '160px'),
      fill: this._str('fill', '#a1a1aa'),
      track: this._str('track', '#27272a'),
      strokeWidth: this._num('stroke-width', 14),
      shape: this._str('shape', 'rounded'),
      unit: this._str('unit', ''),
      disabled: this.hasAttribute('disabled'),
      glow: this.getAttribute('glow'),
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
  }

  structuralSignature(cfg) {
    const { value, label, disabled, ...rest } = cfg;
    return JSON.stringify(rest);
  }

  build(cfg) {
    // Scale --o-force so the dial (orbit-N) fits the box with a margin.
    const dialPx = parseFloat(cfg.size) || 160;
    const force = (dialPx * 12 / (cfg.orbit + 1)).toFixed(1);
    const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
    const trackStyle = `--o-fill:${cfg.track};--o-stroke:${cfg.track};--o-stroke-width:${cfg.strokeWidth}`;
    const valStyle = `--o-fill:${cfg.fill};--o-stroke:${cfg.fill};--o-stroke-width:${cfg.strokeWidth};${this._glow(cfg.fill)}`;

    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;${cfg.disabled ? 'opacity:.5;' : ''}">
        <div class="gravity-spot" style="--o-force:${force}px;">
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc value="100" shape="${cfg.shape}" style="${trackStyle}"></o-arc></div>
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc class="o-knob-dial" value="0" shape="${cfg.shape}" style="${valStyle}"></o-arc></div>
          <div class="orbit-0">
            <div class="satellite at-center">
              <div class="capsule ok-hub o-knob-readout"></div>
            </div>
          </div>
        </div>
      </div>`;

    this._dial = this.querySelector('.o-knob-dial');
    this._readout = this.querySelector('.o-knob-readout');

    // Accessibility: act as a slider.
    this.setAttribute('role', 'slider');
    this.tabIndex = cfg.disabled ? -1 : 0;
    this.style.touchAction = 'none';
    this.style.cursor = cfg.disabled ? 'default' : 'ns-resize';
  }

  sync(cfg) {
    const v = Math.min(cfg.max, Math.max(cfg.min, cfg.value));
    const pct = ((v - cfg.min) / cfg.span) * 100;
    if (this._dial) this._dial.setAttribute('value', pct.toFixed(2));
    if (this._readout) {
      this._readout.textContent = cfg.label !== null ? cfg.label : `${Math.round(v)}${cfg.unit}`;
    }
    this.setAttribute('aria-valuenow', String(v));
    this.setAttribute('aria-valuemin', String(cfg.min));
    this.setAttribute('aria-valuemax', String(cfg.max));
  }

  /** Numeric value as a property (framework-friendly). */
  get value() { return this._num('value', this._num('min', 0)); }
  set value(v) { this._commit(v); }

  onConnected() {
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKey = this._onKey.bind(this);
    this.addEventListener('pointerdown', this._onDown);
    this.addEventListener('wheel', this._onWheel, { passive: false });
    this.addEventListener('keydown', this._onKey);
  }

  onDisconnected() {
    this.removeEventListener('pointerdown', this._onDown);
    this.removeEventListener('wheel', this._onWheel);
    this.removeEventListener('keydown', this._onKey);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
  }

  _cfg() { return this.readConfig(); }

  _commit(raw, emitChange = false) {
    const cfg = this._cfg();
    if (cfg.disabled) return;
    let v = Math.min(cfg.max, Math.max(cfg.min, raw));
    if (cfg.step > 0) v = Math.round(v / cfg.step) * cfg.step;
    v = Number(v.toFixed(6));
    const prev = this._num('value', cfg.min);
    if (v !== prev) {
      this.setAttribute('value', String(v)); // triggers re-render via attributeChangedCallback
      this.dispatchEvent(new CustomEvent('input', { detail: { value: v }, bubbles: true }));
    }
    if (emitChange) {
      this.dispatchEvent(new CustomEvent('change', { detail: { value: v }, bubbles: true }));
    }
  }

  _onDown(e) {
    const cfg = this._cfg();
    if (cfg.disabled) return;
    e.preventDefault();
    this.focus();
    this._dragStartY = e.clientY;
    this._dragStartVal = this._num('value', cfg.min);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
  }

  _onMove(e) {
    const cfg = this._cfg();
    // Full sweep ~= 200px of vertical travel; up increases.
    const dy = this._dragStartY - e.clientY;
    const delta = (dy / 200) * cfg.span;
    this._commit(this._dragStartVal + delta);
  }

  _onUp() {
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    this._commit(this._num('value', this._cfg().min), true);
  }

  _onWheel(e) {
    const cfg = this._cfg();
    if (cfg.disabled) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    this._commit(this._num('value', cfg.min) + dir * (cfg.step || 1), true);
  }

  _onKey(e) {
    const cfg = this._cfg();
    if (cfg.disabled) return;
    const step = cfg.step || 1;
    const map = {
      ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step,
      PageUp: step * 10, PageDown: -step * 10
    };
    if (e.key in map) {
      e.preventDefault();
      this._commit(this._num('value', cfg.min) + map[e.key], true);
    } else if (e.key === 'Home') {
      e.preventDefault(); this._commit(cfg.min, true);
    } else if (e.key === 'End') {
      e.preventDefault(); this._commit(cfg.max, true);
    }
  }
}

define('o-knob', OrbitKnob);
