/**
 * <o-menu> — radial / pie menu, single- or multi-level, two expansion modes.
 *
 * Each sector is an <o-arc> whose curved label rides the arc itself (Orbit
 * renders textContent along the sector path, auto-centered — no angle math).
 * Items may nest via `children`. Two ways to reveal a branch's children:
 *
 *   expand="drill"       (default) — the ring REPLACES itself with the
 *                          sub-level; the center becomes a "back" button.
 *   expand="concentric"  — the parent ring STAYS and the children fan out in an
 *                          outer arc aligned to the chosen sector's wedge
 *                          (the radial-editor look). Click an open branch to
 *                          collapse it; the center resets to the top.
 *
 * Items may carry an `icon` (emoji or raw SVG string), placed dead-center on
 * the sector via `--o-angle-composite` and kept upright with `spin-lock`.
 *
 * Events (bubbling):
 *   - `select`   detail { value, label, item, path:[indices] }
 *   - `navigate` detail { path:[indices], depth }
 *
 * `el.path` reads the open path; `el.back()` / `el.reset()` navigate.
 */
import { OrbitKitElement, define, injectStyleOnce } from './base.js';

const MENU_CSS = `
o-menu { --o-menu-hub: rgba(20,22,30,.92); }
o-menu o-arc.o-menu-item { cursor: pointer; transition: filter .18s ease; }
o-menu o-arc.o-menu-item:hover { filter: brightness(1.25); }
o-menu o-arc.o-menu-item.is-active { filter: brightness(1.4) drop-shadow(0 0 6px currentColor); }
o-menu .o-menu-icon { pointer-events: none; }
o-menu .o-menu-icon .capsule { display: flex; align-items: center; justify-content: center; }
o-menu .ok-menu-ring { animation: ok-menu-in .22s cubic-bezier(.2,.7,.3,1); transform-origin: center; }
@keyframes ok-menu-in { from { opacity: .25; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
o-menu .o-menu-hub {
  border-radius: 50%;
  background: var(--o-menu-hub);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
  padding: 16%;
  font-weight: 800; text-align: center; line-height: 1.12;
  display: flex; align-items: center; justify-content: center;
  transition: color .18s ease, background .18s ease;
}
o-menu .o-menu-hub.is-back { cursor: pointer; }
o-menu .o-menu-hub.is-back:hover { background: var(--o-menu-hub-hover, rgba(36,40,54,.96)); }
/* Monochrome theme: slate sectors that tint to the accent on hover / active. */
o-menu.o-menu--mono o-arc.o-menu-item { --o-fill: var(--ok-menu-slate, #2b333f); --o-stroke: var(--ok-menu-slate, #2b333f); transition: filter .18s, --o-fill .18s; }
o-menu.o-menu--mono o-arc.o-menu-item:hover { --o-fill: var(--ok-menu-accent, #3da9fc); --o-stroke: var(--ok-menu-accent, #3da9fc); filter: none; }
o-menu.o-menu--mono o-arc.o-menu-item.is-active { --o-fill: var(--ok-menu-accent, #3da9fc); --o-stroke: var(--ok-menu-accent, #3da9fc); filter: none; }
`;

// Refined, slightly desaturated palette (not the saturated rainbow).
const PALETTE = ['#6b72c9', '#3ea58f', '#cf9a52', '#cf6b6b', '#5e9fd0', '#9b80c9', '#c77ba2', '#85ab5c'];

export class OrbitMenu extends OrbitKitElement {
  static get observedAttributes() {
    return ['items', 'size', 'orbit', 'range', 'from', 'gap', 'fill', 'label', 'label-color', 'expand', 'theme', 'accent'];
  }

  /** Recursively normalize the items tree. */
  _norm(items) {
    return (items || []).map((it, i) => ({
      label: it.label != null ? String(it.label) : `Item ${i + 1}`,
      value: it.value !== undefined ? it.value : (it.label ?? i),
      color: it.color || null,
      icon: it.icon != null ? String(it.icon) : null,
      children: it.children ? this._norm(it.children) : null
    }));
  }

  readConfig() {
    const range = this._num('range', 360);
    return {
      items: this._norm(this._json('items', []) || []),
      range,
      from: this.hasAttribute('from') ? this._num('from', 0)
                                      : (range === 360 ? 0 : this._autoFrom(range)),
      orbit: Math.round(this._num('orbit', 4)),
      size: this._str('size', '280px'),
      gap: this._num('gap', 6),
      labelColor: this._str('label-color', '#f8fafc'),
      theme: this._str('theme', 'mono') === 'color' ? 'color' : 'mono',
      accent: this._str('accent', '#3da9fc'),
      expand: this._str('expand', 'drill') === 'concentric' ? 'concentric' : 'drill',
      label: this.hasAttribute('label') ? this.getAttribute('label') : 'MENU'
    };
  }

  structuralSignature(cfg) {
    return JSON.stringify(cfg);
  }

  build(cfg) {
    injectStyleOnce('orbit-kit-menu', MENU_CSS);
    this._cfg = cfg;
    this.classList.toggle('o-menu--mono', cfg.theme === 'mono');
    this.style.setProperty('--ok-menu-accent', cfg.accent);
    if (!this._path) this._path = [];
    if (cfg.expand === 'concentric') this._buildConcentric(cfg);
    else this._buildDrill(cfg);
    this._wireKeys();
  }

  /** Render one ring of sectors (+ centered icons) at a given orbit/wedge. */
  _ring(items, from, range, orbit, level, openIndex, cfg) {
    const N = items.length || 1;
    const sliceW = range / N;
    const arcs = items.map((it, i) => {
      const color = it.color || PALETTE[i % PALETTE.length];
      const isBranch = !!(it.children && it.children.length);
      const text = it.icon ? '' : it.label + (isBranch ? ' ›' : '');
      const cls = `o-menu-item${isBranch ? ' is-branch' : ''}${openIndex === i ? ' is-active' : ''}`;
      // Mono theme paints fills via CSS (so :hover/:active can tint them);
      // color theme sets the per-item color inline.
      const style = cfg.theme === 'mono'
        ? `--o-gap:${cfg.gap};--o-color:${cfg.labelColor};font-weight:700;`
        : `--o-fill:${color};--o-stroke:${color};--o-gap:${cfg.gap};--o-color:${cfg.labelColor};font-weight:700;`;
      // Flip labels whose sector sits in the lower half so text stays upright.
      const phi = (((from + (i + 0.5) * sliceW) % 360) + 360) % 360;
      const flip = phi > 90 && phi < 270 ? ' flip' : '';
      return `<o-arc class="${cls}" data-level="${level}" data-index="${i}" shape="rounded"${flip} style="${style}">${text}</o-arc>`;
    }).join('');
    const arcRing = `<div class="orbit-${orbit} ok-menu-ring" style="--o-range:${range}deg;--o-from:${from}deg;">${arcs}</div>`;
    // Icons live in their OWN orbit so they don't pollute the arcs' count-based
    // distribution. Each is pinned to its sector center via an explicit
    // composite that MATCHES the count-based arc center (no fit-range, which
    // would shift the arcs and misalign the icons).
    const icons = items.map((it, i) => it.icon
      ? `<div class="satellite spin-lock o-menu-icon" style="--o-angle-composite:calc(${((i + 0.5) * sliceW - 90).toFixed(2)}deg);"><div class="capsule">${it.icon}</div></div>`
      : '').join('');
    const iconRing = icons
      ? `<div class="orbit-${orbit}" style="--o-from:${from}deg;">${icons}</div>`
      : '';
    return arcRing + iconRing;
  }

  _buildConcentric(cfg) {
    let rings = '', from = cfg.from, range = cfg.range, items = cfg.items, orbit = cfg.orbit;
    for (let d = 0; ; d++) {
      const openIndex = this._path[d];
      rings += this._ring(items, from, range, orbit, d, openIndex ?? null, cfg);
      if (openIndex == null) break;
      const branch = items[openIndex];
      if (!branch || !branch.children || !branch.children.length) { this._path = this._path.slice(0, d); break; }
      const sliceW = range / (items.length || 1);
      from = from + openIndex * sliceW;
      range = sliceW;
      items = branch.children;
      orbit += 2;
    }
    const open = this._path.length > 0;
    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot">
          ${rings}
          <div class="orbit-0"><div class="satellite at-center"><div class="capsule o-menu-hub${open ? ' is-back' : ''}">${cfg.label}</div></div></div>
        </div>
      </div>`;
    this._hub = this.querySelector('.o-menu-hub');
    this._arcs = [...this.querySelectorAll('.o-menu-item')];
    this._bindArcs((lvl, i) => this._activateAt(lvl, i));
    if (this._hub && open) this._hub.addEventListener('click', () => this.reset());
  }

  _buildDrill(cfg) {
    const { level, trail } = this._resolveLevel(cfg.items);
    this._level = level;
    const atRoot = this._path.length === 0;
    const hubText = atRoot ? cfg.label : `‹ ${trail[trail.length - 1].label}`;
    const ring = this._ring(level, cfg.from, cfg.range, cfg.orbit, this._path.length, null, cfg);
    this.innerHTML = `
      <div class="bigbang" style="width:${cfg.size};aspect-ratio:1;">
        <div class="gravity-spot">
          ${ring}
          <div class="orbit-0"><div class="satellite at-center"><div class="capsule o-menu-hub${atRoot ? '' : ' is-back'}">${hubText}</div></div></div>
        </div>
      </div>`;
    this._hub = this.querySelector('.o-menu-hub');
    this._arcs = [...this.querySelectorAll('.o-menu-item')];
    this._bindArcs((lvl, i) => this._activateAt(this._path.length, i));
    if (this._hub && !atRoot) this._hub.addEventListener('click', () => this.back());
  }

  _bindArcs(onActivate) {
    this._arcs.forEach((arc) => {
      const lvl = Number(arc.dataset.level), i = Number(arc.dataset.index);
      arc.addEventListener('click', () => onActivate(lvl, i));
      arc.addEventListener('pointerenter', () => this._setHub(this._itemsAtLevel(lvl)[i]?.label));
      arc.addEventListener('pointerleave', () => this._setHub());
    });
  }

  _wireKeys() {
    this.tabIndex = 0;
    if (this._keyBound) return;
    this._keyBound = true;
    this.addEventListener('keydown', (e) => {
      if ((e.key === 'Escape' || e.key === 'Backspace') && this._path.length) {
        e.preventDefault();
        this._cfg.expand === 'concentric' ? (this._path = this._path.slice(0, -1), this.build(this._cfg)) : this.back();
      }
    });
  }

  /** Items array at a given depth, walking the open path. */
  _itemsAtLevel(level) {
    let items = this._cfg.items;
    for (let d = 0; d < level; d++) {
      const node = items[this._path[d]];
      if (!node || !node.children) return items;
      items = node.children;
    }
    return items;
  }

  /** Drill-mode: resolve items at the current path; reset if invalid. */
  _resolveLevel(root) {
    let level = root; const trail = [];
    for (const idx of this._path) {
      const node = level[idx];
      if (!node || !node.children || !node.children.length) { this._path = []; return { level: root, trail: [] }; }
      trail.push(node); level = node.children;
    }
    return { level, trail };
  }

  _setHub(text) {
    if (!this._hub) return;
    this._hub.textContent = text != null ? text
      : (this._path.length && this._cfg.expand === 'drill'
          ? `‹ ${this._itemsAtLevel(this._path.length - 1)[this._path[this._path.length - 1]]?.label ?? this._cfg.label}`
          : (this._selectedLabel ?? this._cfg.label));
  }

  /** Activate sector `i` at depth `level`: drill/expand a branch, or select a leaf. */
  _activateAt(level, i) {
    const items = this._itemsAtLevel(level);
    const it = items[i];
    if (!it) return;
    const isBranch = it.children && it.children.length;
    if (isBranch) {
      // Concentric toggles; drill always opens the next level.
      if (this._cfg.expand === 'concentric' && this._path[level] === i) this._path = this._path.slice(0, level);
      else this._path = [...this._path.slice(0, level), i];
      this.build(this._cfg);
      this.dispatchEvent(new CustomEvent('navigate', { detail: { path: [...this._path], depth: this._path.length }, bubbles: true }));
    } else {
      this._value = it.value;
      this._selectedLabel = it.label;
      this._path = this._path.slice(0, level);
      this.build(this._cfg);
      this.dispatchEvent(new CustomEvent('select', {
        detail: { value: it.value, label: it.label, item: it, path: [...this._path, i] }, bubbles: true
      }));
    }
  }

  // --- public API ---
  get path() { return [...(this._path || [])]; }
  get value() { return this._value; }
  back() {
    if (!this._path || !this._path.length) return;
    this._path = this._path.slice(0, -1);
    this.build(this._cfg);
    this.dispatchEvent(new CustomEvent('navigate', { detail: { path: [...this._path], depth: this._path.length }, bubbles: true }));
  }
  reset() {
    if (!this._path.length) return;
    this._path = [];
    this.build(this._cfg);
    this.dispatchEvent(new CustomEvent('navigate', { detail: { path: [], depth: 0 }, bubbles: true }));
  }

  // Back-compat with the former flat menu.
  _activate(i) { this._activateAt(this._path.length, i); }
  _select(i) { this._activateAt(this._path.length, i); }
  get selectedIndex() { return this._value != null && this._path.length === 0 ? this._arcs.findIndex((a) => a.classList.contains('is-active')) : -1; }
}

define('o-menu', OrbitMenu);
