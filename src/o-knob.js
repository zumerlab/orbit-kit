/**
 * <o-knob> — rotary slider. Drag vertically, use the wheel while focused,
 * or press arrows / Page Up·Down / Home·End. Emits input while changing and
 * change when a gesture commits. This standalone control is not form-associated.
 */
import { OrbitKitElement, define, escapeHTML, finiteNumber } from './base.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class OrbitKnob extends OrbitKitElement {
  static get observedAttributes() {
    return ['value', 'min', 'max', 'step', 'size', 'orbit', 'fill', 'track',
      'stroke-width', 'shape', 'unit', 'label', 'disabled', 'range', 'from', 'glow'];
  }

  constructor() {
    super();
    for (const name of ['_onDown', '_onMove', '_onUp', '_onWheel', '_onKey']) {
      this[name] = this[name].bind(this);
    }
  }

  readConfig() {
    const range = clamp(this._num('range', 270), 0, 360);
    const min = this._num('min', 0);
    const max = Math.max(min, this._num('max', 100));
    const cfg = {
      min, max, span: max - min || 1,
      step: Math.max(0, this._num('step', 1)) || 1,
      range,
      from: this.hasAttribute('from') ? this._num('from', 0) : this._autoFrom(range),
      orbit: Math.max(1, Math.round(this._num('orbit', 4))),
      size: this._size('size', '160px'),
      fill: this._color('fill', '#a1a1aa'), track: this._color('track', '#27272a'),
      strokeWidth: Math.max(0, this._num('stroke-width', 14)),
      shape: this._str('shape', 'rounded'), unit: this._str('unit', ''),
      disabled: this.hasAttribute('disabled'), glow: this.getAttribute('glow'),
      label: this.hasAttribute('label') ? this.getAttribute('label') : null
    };
    cfg.value = this._normalize(this._num('value', min), cfg);
    return cfg;
  }

  _normalize(raw, cfg) {
    const value = clamp(finiteNumber(raw, cfg.min), cfg.min, cfg.max);
    // Keep both endpoints reachable, even when step does not divide the span.
    if (value === cfg.min || value === cfg.max) return value;
    const snapped = cfg.min + Math.round((value - cfg.min) / cfg.step) * cfg.step;
    return clamp(Number(snapped.toFixed(10)), cfg.min, cfg.max);
  }

  structuralSignature(cfg) {
    const { value, label, disabled, ...rest } = cfg;
    return JSON.stringify(rest);
  }

  build(cfg) {
    const e = escapeHTML;
    const ring = `--o-range:${cfg.range}deg;--o-from:${cfg.from}deg;`;
    const trackStyle = `--o-fill:${cfg.track};--o-stroke:${cfg.track};--o-stroke-width:${cfg.strokeWidth}`;
    const valStyle = `--o-fill:${cfg.fill};--o-stroke:${cfg.fill};--o-stroke-width:${cfg.strokeWidth};${this._glow(cfg.fill)}`;
    this.innerHTML = `
      <div class="bigbang" style="width:${e(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
        <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / ${cfg.orbit + 1});">
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc aria-hidden="true" value="100" shape="${e(cfg.shape)}" style="${e(trackStyle)}"></o-arc></div>
          <div class="orbit-${cfg.orbit}" style="${ring}"><o-arc aria-hidden="true" class="o-knob-dial" value="0" shape="${e(cfg.shape)}" style="${e(valStyle)}"></o-arc></div>
          <div class="orbit-0"><div class="satellite at-center"><div class="capsule ok-hub o-knob-readout" aria-hidden="true"></div></div></div>
        </div>
      </div>`;
    this._box = this.querySelector('.bigbang');
    this._dial = this.querySelector('.o-knob-dial');
    this._readout = this.querySelector('.o-knob-readout');
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-orientation', 'vertical');
  }

  sync(cfg) {
    if (this._dial) this._dial.setAttribute('value', (((cfg.value - cfg.min) / cfg.span) * 100).toFixed(2));
    if (this._readout) this._readout.textContent = cfg.label ?? `${cfg.value}${cfg.unit}`;
    this.setAttribute('aria-valuenow', String(cfg.value));
    this.setAttribute('aria-valuemin', String(cfg.min));
    this.setAttribute('aria-valuemax', String(cfg.max));
    this.setAttribute('aria-valuetext', `${cfg.value}${cfg.unit}`);
    this.setAttribute('aria-disabled', String(cfg.disabled));
    if (!this.hasAttribute('aria-labelledby') && (!this.hasAttribute('aria-label') || this.getAttribute('aria-label') === this._autoLabel)) {
      this._autoLabel = cfg.label || 'Rotary control';
      this.setAttribute('aria-label', this._autoLabel);
    }
    this.tabIndex = cfg.disabled ? -1 : 0;
    this.style.touchAction = cfg.disabled ? 'auto' : 'none';
    this.style.cursor = cfg.disabled ? 'default' : 'ns-resize';
    if (this._box) this._box.style.opacity = cfg.disabled ? '.5' : '';
    if (cfg.disabled) this._stopDrag();
  }

  get value() { return this.readConfig().value; }
  set value(value) { this._commit(finiteNumber(value, this.value)); }

  onConnected() {
    this.addEventListener('pointerdown', this._onDown);
    this.addEventListener('lostpointercapture', this._onUp);
    this.addEventListener('wheel', this._onWheel, { passive: false });
    this.addEventListener('keydown', this._onKey);
  }

  onDisconnected() {
    this.removeEventListener('pointerdown', this._onDown);
    this.removeEventListener('lostpointercapture', this._onUp);
    this.removeEventListener('wheel', this._onWheel);
    this.removeEventListener('keydown', this._onKey);
    this._stopDrag();
  }

  _emit(type, value) {
    this.dispatchEvent(new CustomEvent(type, { detail: { value }, bubbles: true, composed: true }));
  }

  _commit(raw, emitChange = false) {
    const cfg = this.readConfig();
    const value = this._normalize(raw, cfg);
    const changed = value !== cfg.value;
    if (this.getAttribute('value') !== String(value)) this.setAttribute('value', String(value));
    if (changed) {
      this._emit('input', value);
      if (emitChange) this._emit('change', value);
    }
  }

  _onDown(event) {
    if (this.hasAttribute('disabled') || event.button !== 0 || this._pointerId != null) return;
    event.preventDefault();
    this.focus();
    this._pointerId = event.pointerId;
    this._dragStartY = event.clientY;
    this._dragStartVal = this.value;
    this.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  _onMove(event) {
    if (event.pointerId !== this._pointerId || this.hasAttribute('disabled')) return;
    this._commit(this._dragStartVal + (this._dragStartY - event.clientY) / 200 * this.readConfig().span);
  }

  _stopDrag() {
    if (typeof window === 'undefined') return;
    if (this._pointerId != null && this.hasPointerCapture?.(this._pointerId)) this.releasePointerCapture(this._pointerId);
    this._pointerId = null;
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
  }

  _onUp(event) {
    if (event.pointerId !== this._pointerId) return;
    const changed = this.value !== this._dragStartVal;
    this._stopDrag();
    if (changed && !this.hasAttribute('disabled')) this._emit('change', this.value);
  }

  _onWheel(event) {
    if (this.hasAttribute('disabled') || this.ownerDocument?.activeElement !== this || !event.deltaY) return;
    event.preventDefault();
    this._commit(this.value + (event.deltaY < 0 ? 1 : -1) * this.readConfig().step, true);
  }

  _onKey(event) {
    if (this.hasAttribute('disabled')) return;
    const cfg = this.readConfig();
    const steps = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    if (Object.hasOwn(steps, event.key)) {
      event.preventDefault();
      this._commit(cfg.value + steps[event.key] * cfg.step, true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this._commit(event.key === 'Home' ? cfg.min : cfg.max, true);
    }
  }
}

define('o-knob', OrbitKnob);
