import assert from 'node:assert/strict';

// Small unit-only DOM. Real focus, pointer events, lifecycle and SVG are covered
// separately in browser.mjs; these checks exercise numeric/public API contracts.
const style = () => ({ _p: {}, setProperty(key,value) { this._p[key]=String(value); }, getPropertyValue(key) { return this._p[key] || ''; } });
const child = () => ({ style:style(), dataset:{}, setAttribute() {}, addEventListener() {}, textContent:'' });
class Element {
  constructor() { this.attributes = new Map(); this.style=style(); this.classList={toggle(){}}; this.events=[]; this.listeners = new Map(); this.isConnected=false; this.nodes=new Map(); }
  hasAttribute(key) { return this.attributes.has(key); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  setAttribute(key,value) { const old=this.getAttribute(key); this.attributes.set(key,String(value)); if(this.constructor.observedAttributes?.includes(key)) this.attributeChangedCallback?.(key,old,String(value)); }
  removeAttribute(key) { const old=this.getAttribute(key); this.attributes.delete(key); if(this.constructor.observedAttributes?.includes(key)) this.attributeChangedCallback?.(key,old,null); }
  querySelector(key) { if (!this.nodes.has(key)) this.nodes.set(key,child()); return this.nodes.get(key); }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { if(!this.listeners.has(type)) this.listeners.set(type,new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type,fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) { this.events.push(event); for(const fn of this.listeners.get(event.type)||[])fn(event); return true; }
  set innerHTML(value) { this.html=value; this.nodes.clear(); }
  get innerHTML() { return this.html || ''; }
}
globalThis.HTMLElement=Element;
globalThis.CustomEvent=class { constructor(type, options) { this.type=type; Object.assign(this, options); } };
globalThis.customElements={ registry:new Map(),get(tag){return this.registry.get(tag);},define(tag,Class){this.registry.set(tag,Class);} };
const { OrbitKnob }=await import('../src/o-knob.js');
const { OrbitMenu }=await import('../src/o-menu.js');
function make(Class,attributes) {const node=new Class();for(const [key,value]of Object.entries(attributes))node.setAttribute(key,value);node.isConnected=true;node._render();return node;}

const knob=make(OrbitKnob,{min:0,max:10,step:6,value:6});
knob.value=10;
assert.equal(knob.value,10);
assert.equal(knob.getAttribute('aria-valuenow'),'10');
assert.equal(knob.events.at(-1).detail.value,10);
knob.setAttribute('min','1'); knob.setAttribute('step','2'); knob.value=1;
assert.equal(knob.value,1);
knob.value=4; assert.equal(knob.value,5);
knob.setAttribute('step','.1'); knob.value=1.2;
assert.equal(knob.value,1.2);
assert.equal(knob._readout.textContent,'1.2');
knob.value=Number.NaN; assert.equal(knob.value,1.2);
knob.setAttribute('value','99'); assert.equal(knob.value,10);
assert.equal(knob.getAttribute('aria-valuenow'),'10');
knob.setAttribute('disabled','');
assert.equal(knob.tabIndex,-1);
assert.equal(knob.getAttribute('aria-disabled'),'true');
assert.equal(knob._box.style.opacity,'.5');
knob._onKey({key:'Home',preventDefault(){throw new Error('Disabled control consumed key');}});
assert.equal(knob.value,10);
knob.value=4; assert.equal(knob.value,4,'Programmatic updates remain possible while disabled');
knob.removeAttribute('disabled');
assert.equal(knob.tabIndex,0);
assert.equal(knob._box.style.opacity,'');
knob.setAttribute('fill','red;position:fixed'); assert.equal(knob.readConfig().fill,'#a1a1aa');
knob.setAttribute('max','-10'); assert.equal(knob.value,1);
assert.equal(knob.getAttribute('aria-valuemin'),knob.getAttribute('aria-valuemax'));

for (const expand of ['drill','concentric']) {
  const menu=make(OrbitMenu,{expand,items:JSON.stringify([{label:'Edit',children:[{label:'Cut',value:'cut'}]},{label:'Quit',value:'quit'}])});
  menu._activateAt(0,0);
  assert.deepEqual(menu.path,[0]);
  assert.deepEqual(menu.events.filter(event=>event.type==='navigate').map(event=>event.detail.path),[[0]]);
  menu._activateAt(1,0);
  assert.equal(menu.value,'cut'); assert.equal(menu.selectedIndex,0);
  assert.deepEqual(menu.events.at(-1).detail.path,[0,0]);
  menu.back(); assert.deepEqual(menu.path,[]); assert.equal(menu.selectedIndex,-1);
  menu._activateAt(0,1); assert.equal(menu.selectedIndex,1);
  assert.ok(menu.innerHTML.includes('is-selected'));
  menu.setAttribute('items','{}'); assert.deepEqual(menu.readConfig().items,[]); assert.equal(menu.value,undefined);
  menu.setAttribute('items','[null,42,{"label":"Okay","children":{}}]');
  assert.equal(menu.readConfig().items.length,1);
  assert.equal(menu.readConfig().items[0].children,null);
  menu.reset();
}
const colored=make(OrbitMenu,{items:JSON.stringify([{label:'A',color:'red;position:fixed'}]),accent:'red;position:fixed'});
assert.equal(colored.readConfig().items[0].color,null); assert.equal(colored.readConfig().accent,null);
const unconnected=new OrbitMenu(); assert.doesNotThrow(()=>unconnected.reset());
console.log('Control numeric, disabled, events, selection and malformed-data regressions passed.');
