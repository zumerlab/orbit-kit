/**
 * OrbitKitElement — shared base for orbit-kit high-level components.
 *
 * Every kit component collapses a multi-level Orbit recipe
 * (.bigbang > .gravity-spot > .orbit-N > o-arc|o-progress|.satellite)
 * into a single declarative tag. They all share the same lifecycle:
 *
 *   readConfig()            -> parse attributes into a plain config object
 *   structuralSignature(c)  -> string; when it changes the subtree is rebuilt
 *   build(cfg)              -> render the Orbit structure into the light DOM
 *   sync(cfg)               -> patch cheap/animated values without a rebuild
 *
 * LIGHT DOM on purpose: Orbit positions elements through global CSS
 * (cos()/sin()/:has()) and inherited --o-* custom properties, so the kit must
 * render into the light DOM for orbit.css to apply and the inner <o-arc> /
 * <o-progress> to participate in the cascade. Requires @zumer/orbit (CSS + JS)
 * loaded on the page; orbit-kit declares it as a peer dependency.
 */
export class OrbitKitElement extends HTMLElement {
  connectedCallback() {
    this._render();
    this.onConnected?.();
  }

  attributeChangedCallback() {
    if (this.isConnected) this._render();
  }

  disconnectedCallback() {
    this.onDisconnected?.();
  }

  /** Parse a numeric attribute with a fallback. */
  _num(name, fallback) {
    const raw = this.getAttribute(name);
    if (raw === null || raw === '') return fallback;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Read a string attribute with a fallback. */
  _str(name, fallback) {
    const raw = this.getAttribute(name);
    return raw === null ? fallback : raw;
  }

  /** Parse a JSON attribute (array/object) with a fallback; never throws. */
  _json(name, fallback) {
    const raw = this.getAttribute(name);
    if (raw === null || raw.trim() === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`<${this.localName}> invalid JSON in "${name}":`, err.message);
      return fallback;
    }
  }

  /**
   * Default `from` angle that centers an arc's gap at the bottom (6 o'clock),
   * matching the classic 3/4 gauge: range 270 -> from 225.
   */
  _autoFrom(range) {
    return ((360 - range / 2) % 360 + 360) % 360;
  }

  /**
   * Opt-in neon glow. When the `glow` attribute is present, returns a
   * `filter: drop-shadow(...)` fragment tinted with the indicator color so the
   * fill reads as emissive. `glow="12"` overrides the blur radius (px).
   */
  _glow(color, fallbackPx = 6) {
    if (!this.hasAttribute('glow')) return '';
    const px = this._num('glow', fallbackPx) || fallbackPx;
    return `filter:drop-shadow(0 0 ${px}px ${color});`;
  }

  _render() {
    const cfg = this.readConfig();
    const sig = this.structuralSignature ? this.structuralSignature(cfg) : null;
    if (!this._built || sig === null || sig !== this._sig) {
      this.build(cfg);
      this._sig = sig;
      this._built = true;
    }
    this.sync?.(cfg);
  }
}

/** Register a custom element once (safe against double-registration). */
export function define(tag, cls) {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, cls);
  }
}

/** Inject a stylesheet once, keyed by id (used by animated components). */
export function injectStyleOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Kit baseline overrides, injected once for the whole kit.
 *
 * Orbit's default theme draws `border: 1px solid currentcolor` on every
 * `.satellite` (see orbit _themes.scss). For composed widgets that's an
 * unwanted ring around the center label / cardinals / radar blips. We strip it
 * — but ONLY inside kit components, so hand-written Orbit markup keeps the
 * default. `:where()` keeps specificity at (0,1,0) and the rule lands after
 * orbit.css in document order, so the user can still re-add a border.
 */
const KIT_BASE_CSS = `
:where(o-gauge,o-donut,o-rings,o-meter,o-knob,o-menu,o-compass,o-radar,o-clock,o-instrument) .satellite {
  border: none;
  background: transparent;
}
/* Shared center hub: a soft radial halo behind the label. Uses a gradient
   (not a hard circle) so wide readouts like "125 km/h" never get clipped.
   Theme it with --ok-hub-bg / --ok-hub-color. */
:where(o-gauge,o-donut,o-rings,o-meter,o-knob,o-compass) .ok-hub {
  font-weight: 800;
  text-align: center;
  line-height: 1.15;
  padding: .5em .7em;
  color: var(--ok-hub-color, inherit);
  background: radial-gradient(closest-side, var(--ok-hub-bg, rgba(8, 12, 18, .82)), transparent 100%);
}`;

injectStyleOnce('orbit-kit-base', KIT_BASE_CSS);
