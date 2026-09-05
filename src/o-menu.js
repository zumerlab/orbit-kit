/**
 * <o-menu> — radial menu with drill-down or concentric branches.
 * Items contain labels, optional emoji / sanitized inline SVG, values and children.
 * select: { value, label, item, path }; navigate: { path, depth } (both bubble).
 */
import { OrbitKitElement, define, injectStyleOnce, escapeHTML, safeIcon, cssValue } from './base.js';

const MENU_CSS = `
o-menu { --o-menu-hub: rgba(20,22,30,.92); }
o-menu o-arc.o-menu-item { cursor: pointer; transition: filter .18s ease; }
o-menu o-arc.o-menu-item:hover { filter: brightness(1.25); }
o-menu o-arc.o-menu-item:is(.is-active,.is-selected) { filter: brightness(1.4) drop-shadow(0 0 6px currentColor); }
o-menu o-arc.o-menu-item:focus-visible { outline: 3px solid var(--ok-menu-accent, #3da9fc); outline-offset: 3px; }
o-menu .o-menu-icon { pointer-events: none; }
o-menu .o-menu-icon .capsule { display: flex; align-items: center; justify-content: center; }
o-menu .ok-menu-ring { animation: ok-menu-in .22s cubic-bezier(.2,.7,.3,1); transform-origin: center; }
@keyframes ok-menu-in { from { opacity: .25; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
o-menu .o-menu-hub {
  border-radius: 50%; background: var(--o-menu-hub);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); padding: 16%;
  font-weight: 800; text-align: center; line-height: 1.12;
  display: flex; align-items: center; justify-content: center;
  transition: color .18s ease, background .18s ease;
}
o-menu .o-menu-hub.is-back { cursor: pointer; }
o-menu .o-menu-hub.is-back:hover { background: var(--o-menu-hub-hover, rgba(36,40,54,.96)); }
o-menu .o-menu-hub:focus-visible { outline: 3px solid var(--ok-menu-accent, #3da9fc); }
o-menu.o-menu--mono o-arc.o-menu-item { --o-fill: var(--ok-menu-slate, #2b333f); --o-stroke: var(--ok-menu-slate, #2b333f); }
o-menu.o-menu--mono o-arc.o-menu-item:is(:hover,.is-active,.is-selected) { --o-fill: var(--ok-menu-accent, #3da9fc); --o-stroke: var(--ok-menu-accent, #3da9fc); filter: none; }
@media (prefers-reduced-motion: reduce) { o-menu .ok-menu-ring { animation: none; } o-menu o-arc.o-menu-item { transition: none; } }
`;
const PALETTE = ['#6b72c9', '#3ea58f', '#cf9a52', '#cf6b6b', '#5e9fd0', '#9b80c9', '#c77ba2', '#85ab5c'];
const equalPath = (a, b) => !!a && !!b && a.length === b.length && a.every((value, i) => value === b[i]);

export class OrbitMenu extends OrbitKitElement {
  static get observedAttributes() {
    return ['items', 'size', 'orbit', 'range', 'from', 'gap', 'label', 'label-color', 'expand', 'theme', 'accent'];
  }

  _norm(items, depth = 0) {
    if (!Array.isArray(items) || depth > 32) return [];
    return items.filter(item => item && typeof item === 'object' && !Array.isArray(item)).map((item, i) => ({
      label: item.label != null ? String(item.label) : `Item ${i + 1}`,
      value: item.value !== undefined ? item.value : (item.label ?? i),
      color: cssValue(item.color, null),
      icon: item.icon == null ? null : String(item.icon),
      children: Array.isArray(item.children) ? this._norm(item.children, depth + 1) : null
    }));
  }

  readConfig() {
    const range = Math.min(360, Math.max(0, this._num('range', 360)));
    return {
      items: this._norm(this._json('items', [])), range,
      from: this.hasAttribute('from') ? this._num('from', 0) : (range === 360 ? 0 : this._autoFrom(range)),
      orbit: Math.max(1, Math.round(this._num('orbit', 4))),
      size: this._size('size', '280px'), gap: Math.max(0, this._num('gap', 6)),
      labelColor: this._color('label-color', '#f8fafc'),
      theme: this._str('theme', 'mono') === 'color' ? 'color' : 'mono',
      accent: this._color('accent', null),
      expand: this._str('expand', 'drill') === 'concentric' ? 'concentric' : 'drill',
      label: this._str('label', 'MENU')
    };
  }

  structuralSignature(cfg) { return JSON.stringify(cfg); }

  build(cfg) {
    injectStyleOnce('orbit-kit-menu', MENU_CSS);
    const active = this.ownerDocument?.activeElement;
    const restoreFocus = active === this || (active && this.contains?.(active));
    const focusKey = this._nextFocus || this._focusKey;
    this._nextFocus = null;
    this._cfg = cfg;
    this._path ||= [];
    this._validateSelection();
    this.classList.toggle('o-menu--mono', cfg.theme === 'mono');
    this._applyTheme({ '--ok-menu-accent': cfg.accent });
    this.setAttribute('role', 'menu');
    if (!this.hasAttribute('aria-labelledby') && (!this.hasAttribute('aria-label') || this.getAttribute('aria-label') === this._autoLabel)) {
      this._autoLabel = cfg.label || 'Radial menu';
      this.setAttribute('aria-label', this._autoLabel);
    }
    if (cfg.expand === 'concentric') this._buildConcentric(cfg);
    else this._buildDrill(cfg);
    this._wireKeys();
    this._options = [...this._arcs, ...(this._path.length && this._hub ? [this._hub] : [])];
    const target = this._options.find(option => this._keyFor(option) === focusKey) || this._options[0];
    this.tabIndex = target ? -1 : 0;
    this._setFocus(target, restoreFocus);
    this._setHub();
    const pathKey = JSON.stringify(this._path);
    const pathChanged = this._announcedPath !== undefined && this._announcedPath !== pathKey;
    this._announcedPath = pathKey;
    if (pathChanged) {
      this.dispatchEvent(new CustomEvent('navigate', { detail: { path: this.path, depth: this._path.length }, bubbles: true, composed: true }));
    }
  }

  _validateSelection() {
    if (!this._selectedPath) return;
    let items = this._cfg.items, item;
    for (const index of this._selectedPath) {
      item = items[index];
      if (!item) break;
      items = item.children || [];
    }
    if (!item || item.children?.length || JSON.stringify(item.value) !== JSON.stringify(this._value)) {
      this._selectedPath = null;
      this._value = undefined;
      this._selectedLabel = undefined;
    } else this._selectedLabel = item.label;
  }

  _ring(items, from, range, orbit, level, openIndex, cfg) {
    const e = escapeHTML, slice = range / (items.length || 1);
    const arcs = items.map((item, index) => {
      const color = item.color || PALETTE[index % PALETTE.length];
      const branch = !!item.children?.length;
      const selected = !branch && equalPath(this._selectedPath, [...this._path.slice(0, level), index]);
      const text = item.icon ? '' : item.label + (branch ? ' ›' : '');
      const cls = `o-menu-item${branch ? ' is-branch' : ''}${openIndex === index ? ' is-active' : ''}${selected ? ' is-selected' : ''}`;
      const style = `${cfg.theme === 'mono' ? '' : `--o-fill:${color};--o-stroke:${color};`}--o-gap:${cfg.gap};--o-color:${cfg.labelColor};font-weight:700;`;
      const phi = ((from + (index + .5) * slice) % 360 + 360) % 360;
      return `<o-arc class="${cls}" data-level="${level}" data-index="${index}" role="menuitem" interactive tabindex="-1" aria-label="${e(item.label)}"${branch ? ` aria-haspopup="menu" aria-expanded="${openIndex === index}"` : ''}${selected ? ' aria-current="true"' : ''} shape="rounded"${phi > 90 && phi < 270 ? ' flip' : ''} style="${e(style)}">${e(text)}</o-arc>`;
    }).join('');
    const icons = items.map((item, index) => item.icon
      ? `<div class="satellite spin-lock o-menu-icon" aria-hidden="true" style="--o-angle-composite:calc(${((index + .5) * slice - 90).toFixed(2)}deg);"><div class="capsule">${safeIcon(item.icon)}</div></div>` : '').join('');
    return `<div class="orbit-${orbit} ok-menu-ring" style="--o-range:${range}deg;--o-from:${from}deg;">${arcs}</div>` +
      (icons ? `<div class="orbit-${orbit}" style="--o-from:${from}deg;">${icons}</div>` : '');
  }

  _markup(rings, hubText, outerOrbit) {
    const cfg = this._cfg, open = this._path.length > 0;
    const hubLabel = cfg.expand === 'concentric' ? 'Reset menu' : 'Back to previous menu';
    return `<div class="bigbang" style="width:${escapeHTML(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
      <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / ${outerOrbit + 1});">
        ${rings}<div class="orbit-0"><div class="satellite at-center"><div class="capsule o-menu-hub${open ? ' is-back' : ''}"${open ? ` role="menuitem" tabindex="-1" aria-label="${hubLabel}"` : ' aria-hidden="true"'}>${escapeHTML(hubText)}</div></div></div>
      </div></div>`;
  }

  _buildConcentric(cfg) {
    let rings = '', from = cfg.from, range = cfg.range, items = cfg.items, orbit = cfg.orbit;
    for (let depth = 0; ; depth++) {
      let openIndex = this._path[depth];
      const branch = items[openIndex];
      if (openIndex != null && !branch?.children?.length) {
        this._path = this._path.slice(0, depth);
        openIndex = undefined;
      }
      rings += this._ring(items, from, range, orbit, depth, openIndex, cfg);
      if (openIndex == null) break;
      const slice = range / items.length;
      from += openIndex * slice;
      range = slice;
      items = branch.children;
      orbit += 2;
    }
    this.innerHTML = this._markup(rings, cfg.label, orbit);
    this._bindArcs();
  }

  _buildDrill(cfg) {
    const { level, trail } = this._resolveLevel(cfg.items);
    const hubText = this._path.length ? `‹ ${trail[trail.length - 1].label}` : cfg.label;
    this.innerHTML = this._markup(this._ring(level, cfg.from, cfg.range, cfg.orbit, this._path.length, null, cfg), hubText, cfg.orbit);
    this._bindArcs();
  }

  _bindArcs() {
    this._hub = this.querySelector('.o-menu-hub');
    this._arcs = [...this.querySelectorAll('.o-menu-item')];
    for (const arc of this._arcs) {
      const level = Number(arc.dataset.level), index = Number(arc.dataset.index);
      arc.addEventListener('click', () => { arc.focus(); this._activateAt(level, index); });
      arc.addEventListener('focus', () => { this._setFocus(arc); this._setHub(this._itemsAtLevel(level)[index]?.label); });
      arc.addEventListener('blur', () => this._setHub());
      arc.addEventListener('pointerenter', () => this._setHub(this._itemsAtLevel(level)[index]?.label));
      arc.addEventListener('pointerleave', () => this._setHub());
    }
    if (this._hub && this._path.length) {
      this._hub.addEventListener('focus', () => this._setFocus(this._hub));
      this._hub.addEventListener('click', () => { this._hub.focus(); this._cfg.expand === 'concentric' ? this.reset() : this.back(); });
    }
  }

  _keyFor(option) { return option === this._hub ? 'hub' : `${option?.dataset.level}:${option?.dataset.index}`; }
  _setFocus(option, move = false) {
    if (!option) return;
    this._focusKey = this._keyFor(option);
    for (const candidate of this._options || []) candidate.tabIndex = candidate === option ? 0 : -1;
    if (move) option.focus();
  }

  _wireKeys() {
    if (this._keyBound) return;
    this._keyBound = true;
    this.addEventListener('keydown', event => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const options = this._options || [];
      const index = Math.max(0, options.indexOf(this.ownerDocument?.activeElement));
      if ((Object.hasOwn(keys, event.key) || event.key === 'Home' || event.key === 'End') && options.length) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + keys[event.key] + options.length) % options.length;
        this._setFocus(options[next], true);
      } else if ((event.key === 'Enter' || event.key === ' ') && options.length) {
        event.preventDefault();
        options[index].click();
      } else if ((event.key === 'Escape' || event.key === 'Backspace') && this._path.length) {
        event.preventDefault();
        this.back();
      }
    });
  }

  _itemsAtLevel(level) {
    let items = this._cfg.items;
    for (let depth = 0; depth < level; depth++) {
      const node = items[this._path[depth]];
      if (!node?.children) return [];
      items = node.children;
    }
    return items;
  }

  _resolveLevel(root) {
    let level = root;
    const trail = [];
    for (const index of this._path) {
      const node = level[index];
      if (!node?.children?.length) { this._path = []; return { level: root, trail: [] }; }
      trail.push(node);
      level = node.children;
    }
    return { level, trail };
  }

  _setHub(text) {
    if (!this._hub) return;
    const nextText = text ?? (this._path.length && this._cfg.expand === 'drill'
      ? `‹ ${this._itemsAtLevel(this._path.length - 1)[this._path[this._path.length - 1]]?.label ?? this._cfg.label}`
      : (this._selectedLabel ?? this._cfg.label));
    // Keep the hit-tested text node stable through hover and focus transitions.
    if (this._hub.textContent !== nextText) this._hub.textContent = nextText;
  }

  _activateAt(level, index) {
    const item = this._itemsAtLevel(level)[index];
    if (!item) return;
    if (item.children?.length) {
      const collapse = this._cfg.expand === 'concentric' && this._path[level] === index;
      this._path = collapse ? this._path.slice(0, level) : [...this._path.slice(0, level), index];
      this._nextFocus = collapse ? `${level}:${index}` : `${level + 1}:0`;
      this.build(this._cfg);
    } else {
      this._value = item.value;
      this._selectedLabel = item.label;
      this._path = this._path.slice(0, level);
      this._selectedPath = [...this._path, index];
      this._nextFocus = `${level}:${index}`;
      this.build(this._cfg);
      this.dispatchEvent(new CustomEvent('select', { detail: { value: item.value, label: item.label, item, path: [...this._selectedPath] }, bubbles: true, composed: true }));
    }
  }

  get path() { return [...(this._path || [])]; }
  get value() { return this._value; }
  get selectedIndex() {
    const path = this._path || [];
    return this._selectedPath?.length === path.length + 1 && equalPath(this._selectedPath.slice(0, -1), path)
      ? this._selectedPath[this._selectedPath.length - 1] : -1;
  }
  back() {
    if (!this._path?.length) return;
    this._nextFocus = `${this._path.length - 1}:${this._path[this._path.length - 1]}`;
    this._path = this._path.slice(0, -1);
    this.build(this._cfg);
  }
  reset() {
    if (!this._path?.length) return;
    this._nextFocus = `0:${this._path[0]}`;
    this._path = [];
    this.build(this._cfg);
  }
  _activate(index) { this._activateAt(this._path?.length || 0, index); }
  _select(index) { this._activate(index); }
}

define('o-menu', OrbitMenu);
