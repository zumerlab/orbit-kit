import { OrbitKitElement, define, injectStyleOnce, finiteNumber, cssValue, escapeHTML as e } from './base.js';
const RADAR_CSS = `
@keyframes o-radar-sweep { to { transform: rotate(360deg); } }
@keyframes o-radar-ping { 0% { transform: scale(.5); opacity:1; } 70% { opacity:.45; } 100% { transform:scale(1.7);opacity:0; } }
o-radar .o-radar-sweep { animation:o-radar-sweep var(--o-radar-speed,4s) linear infinite;transform-origin:center; }
o-radar .ok-radar-spoke { width:var(--o-radius);left:50%;top:50%;transform-origin:0 50%;transform:rotate(calc(var(--o-from) + var(--o-angle-composite))); }
o-radar .o-radar-blip { position:relative;border-radius:50%; }
o-radar .o-radar-blip::after { content:"";position:absolute;inset:-4px;border-radius:50%;border:1px solid currentColor;animation:o-radar-ping 1.8s ease-out infinite; }
@media (prefers-reduced-motion:reduce) { o-radar .o-radar-sweep,o-radar .o-radar-blip::after { animation:none; } }
`;

/** Radar with continuous target distances and a sweep independent of target updates. */
export class OrbitRadar extends OrbitKitElement {
  static get observedAttributes() {
    return ['targets', 'rings', 'spokes', 'size', 'color', 'sweep', 'sweep-width', 'speed', 'label'];
  }
  readConfig() {
    return {
      targets: this._array('targets').map((t) => ({ angle: ((finiteNumber(t.angle) % 360) + 360) % 360, dist: Math.min(1, Math.max(0, finiteNumber(t.dist, .5))), color: cssValue(t.color) })),
      rings: Math.max(1, Math.min(180, Math.round(this._num('rings', 4)))),
      spokes: Math.max(0, Math.min(360, Math.round(this._num('spokes', 8)))), size: this._size('size', '240px'),
      color: this._color('color', '#22d3ee'), sweep: this._str('sweep', 'true') !== 'false',
      sweepWidth: Math.min(300, Math.max(10, this._num('sweep-width', 110))), speed: Math.max(.01, this._num('speed', 4)), label: this.getAttribute('label')
    };
  }
  structuralSignature({ targets, speed, label, ...structure }) { return JSON.stringify(structure); }
  _target(t, cfg) {
    const color = t.color || cfg.color;
    return `<div class="orbit-${cfg.rings * 2} ok-radar-target"><div class="satellite" style="--o-angle-composite:${t.angle - 90}deg;--o-aligment:calc(var(--o-radius) * ${1 - t.dist});color:${e(color)};"><div class="capsule o-radar-blip" style="width:9px;height:9px;background:${e(color)};box-shadow:0 0 10px ${e(color)};"></div></div></div>`;
  }
  build(cfg) {
    injectStyleOnce('orbit-kit-radar', RADAR_CSS);
    const outer = cfg.rings * 2;
    const rings = Array.from({ length: cfg.rings }, (_, i) => `<div class="orbit-${(i + 1) * 2}" style="border:1px solid ${e(this._rgba(cfg.color, .1 + i / cfg.rings * .22))};"></div>`).join('');
    const spokes = cfg.spokes ? `<div class="orbit-${outer} range-360 from-0">${Array.from({ length: cfg.spokes }, () => `<div class="vector ok-radar-spoke" style="background:${e(this._rgba(cfg.color, .14))};height:1px;"></div>`).join('')}</div>` : '';
    const w = cfg.sweepWidth;
    const beam = `conic-gradient(from 0deg, ${this._rgba(cfg.color, 0)} 0deg, ${this._rgba(cfg.color, .05)} ${w / 2}deg, ${this._rgba(cfg.color, .30)} ${w - 3}deg, ${this._rgba(cfg.color, .85)} ${w}deg, transparent ${w}deg, transparent 360deg)`;
    const sweep = cfg.sweep ? `<div class="orbit-${outer} o-radar-sweep" style="--o-radar-speed:${cfg.speed}s;background:${e(beam)};"></div>` : '';
    this.innerHTML = `<div class="bigbang" style="width:${e(cfg.size)};aspect-ratio:1;height:auto;container-type:inline-size;">
      <div class="gravity-spot" style="--o-force:calc(100cqw * 12 / ${outer + 1});">
        ${rings}${spokes}${sweep}${cfg.targets.map((t) => this._target(t, cfg)).join('')}
        <div class="orbit-0"><div class="satellite at-center"><div class="capsule" style="display:flex;flex-direction:column;align-items:center;gap:4px;">
          <span style="width:6px;height:6px;border-radius:50%;background:${e(cfg.color)};"></span>
          <span class="ok-radar-label" style="font-weight:800;font-size:.7em;letter-spacing:.15em;color:${e(cfg.color)};">${e(cfg.label)}</span>
        </div></div></div>
      </div></div>`;
    this._scope = this.querySelector('.gravity-spot');
    this._targets = [...this.querySelectorAll('.ok-radar-target')];
    this._label = this.querySelector('.ok-radar-label');
    this._sweep = this.querySelector('.o-radar-sweep');
  }
  sync(cfg) {
    // Reconcile only the target layers, keeping the animated sweep node alive.
    while (this._targets.length > cfg.targets.length) this._targets.pop().remove();
    while (this._targets.length < cfg.targets.length && this._scope?.insertAdjacentHTML) {
      this._scope.insertAdjacentHTML('beforeend', this._target(cfg.targets[this._targets.length], cfg));
      this._targets.push(this._scope.lastElementChild);
    }
    this._targets.forEach((layer, i) => {
      const t = cfg.targets[i], color = t.color || cfg.color;
      const satellite = layer.querySelector('.satellite'), blip = layer.querySelector('.o-radar-blip');
      satellite.style.setProperty('--o-angle-composite', `${t.angle - 90}deg`);
      satellite.style.setProperty('--o-aligment', `calc(var(--o-radius) * ${1 - t.dist})`);
      satellite.style.setProperty('color', color);
      blip.style.setProperty('background', color);
      blip.style.setProperty('box-shadow', `0 0 10px ${color}`);
    });
    this._sweep?.style.setProperty('--o-radar-speed', `${cfg.speed}s`);
    if (this._label) this._label.textContent = cfg.label ?? '';
    this._describe([cfg.label || 'Radar', ...cfg.targets.map((t, i) => `Target ${i + 1}: ${t.angle} degrees, ${Math.round(t.dist * 100)}% distance`)].join('; '));
  }
  _rgba(color, alpha) { return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`; }
}
define('o-radar', OrbitRadar);
