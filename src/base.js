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
export const HTMLElementBase = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

/** Text and attribute escaping share the same conservative encoding. */
export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function finiteNumber(value, fallback = 0) {
  if (value == null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function arrayData(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** A declaration value, never a second declaration or active URL. */
export function cssValue(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text && !/[;{}<>"'\\\x00-\x1f]/.test(text) && !/(?:url|expression)\s*\(/i.test(text) ? text : fallback;
}

export function cssLength(value, fallback = '200px') {
  const text = cssValue(value);
  if (!text || /^(?:auto|inherit|initial|unset|none)$/i.test(text)) return fallback;
  if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('width', text) ? text : fallback;
  return /^(?:0|(?:\d*\.)?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|svw|svh|dvw|dvh|cqw|cqh|ch|ex)|(?:calc|min|max|clamp|var)\(.+\))$/i.test(text) ? text : fallback;
}

/** Icons are text or a small inert SVG vocabulary; no HTML, scripts or URLs. */
export function safeIcon(value) {
  const source = String(value ?? '');
  if (!/^\s*<svg(?:\s|>)/i.test(source) || typeof document === 'undefined') return escapeHTML(source);
  const template = document.createElement('template');
  template.innerHTML = source;
  if (!template.content) return escapeHTML(source);
  const roots = [...template.content.children];
  if (roots.length !== 1 || roots[0].localName !== 'svg') return escapeHTML(source);
  const tags = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'title', 'desc']);
  const attrs = new Set(['viewbox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'transform', 'preserveaspectratio', 'xmlns', 'aria-hidden', 'focusable']);
  const clean = (node) => {
    for (const child of [...node.children]) {
      if (!tags.has(child.localName)) child.remove();
      else clean(child);
    }
    for (const attr of [...node.attributes]) {
      if (!attrs.has(attr.name.toLowerCase()) || /(?:url\s*\(|javascript:|data:|https?:|[<>])/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  };
  clean(roots[0]);
  roots[0].setAttribute('aria-hidden', 'true');
  roots[0].setAttribute('focusable', 'false');
  return roots[0].outerHTML;
}

export class OrbitKitElement extends HTMLElementBase {
  connectedCallback() {
    this._render();
    this.onConnected?.();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.isConnected) this._render();
  }

  disconnectedCallback() {
    this.onDisconnected?.();
  }

  /** Parse a numeric attribute with a fallback. */
  _num(name, fallback) {
    const raw = this.getAttribute(name);
    if (raw === null || raw === '') return fallback;
    return finiteNumber(raw, fallback);
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

  _array(name, fallback = []) { return arrayData(this._json(name, fallback)); }
  _size(name = 'size', fallback = '200px') { return cssLength(this.getAttribute(name), fallback); }
  _color(name, fallback) { return cssValue(this.getAttribute(name), fallback); }

  /** Restore the author's original inline declaration when an override ends. */
  _applyTheme(values) {
    this._themeOriginals ??= new Map();
    for (const [prop, value] of Object.entries(values)) {
      if (value != null && value !== '') {
        if (!this._themeOriginals.has(prop)) this._themeOriginals.set(prop, [this.style.getPropertyValue?.(prop) || '', this.style.getPropertyPriority?.(prop) || '']);
        this.style.setProperty(prop, cssValue(value));
      } else if (this._themeOriginals.has(prop)) {
        const [original, priority] = this._themeOriginals.get(prop);
        if (original) this.style.setProperty(prop, original, priority);
        else this.style.removeProperty?.(prop);
        this._themeOriginals.delete(prop);
      }
    }
  }

  /** Generated descriptions preserve any explicitly supplied accessible name. */
  _describe(text, role = 'img') {
    if (!this.hasAttribute('role')) this.setAttribute('role', role);
    const current = this.getAttribute('aria-label');
    if (current == null || current === this._generatedLabel) {
      this._generatedLabel = String(text);
      if (current !== this._generatedLabel) this.setAttribute('aria-label', this._generatedLabel);
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
    const px = Math.max(0, this._num('glow', fallbackPx));
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
  if (typeof document === 'undefined' || !document.head || document.getElementById(id)) return;
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
:where(o-gauge,o-donut,o-rings,o-meter,o-knob,o-menu,o-compass,o-radar,o-clock,o-instrument) [hidden] { display: none !important; }
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
