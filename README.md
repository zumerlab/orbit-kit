# @zumer/orbit-kit

High-level, declarative web components built on top of the
[Orbit](https://github.com/zumerlab/orbit) CSS + JavaScript layout system.

Orbit gives you **primitives** — CSS for presentation and JavaScript for radial
layout, ordering and updates. It's powerful,
but composing a single widget means nesting five levels
(`.bigbang > .gravity-spot > .orbit-N > .satellite > .capsule`) and getting the
rules exactly right. That depth is the main barrier to entry, for humans *and*
for LLMs.

**orbit-kit** wraps the common radial patterns into one-line custom elements —
gauges, charts, activity rings, knobs, pie menus, cockpit instruments, analog
clocks, compasses and radars:

```html
<!-- Before: raw primitives -->
<div class="bigbang" style="width:200px;aspect-ratio:1">
  <div class="gravity-spot">
    <div class="orbit-4" style="--o-range:270deg;--o-from:225deg">
      <o-progress value="72" shape="rounded"
        style="--o-fill:#6366f1;--o-stroke-width:8"></o-progress>
    </div>
    <div class="orbit-0">
      <div class="satellite at-center"><div class="capsule">72%</div></div>
    </div>
  </div>
</div>

<!-- After: orbit-kit -->
<o-gauge value="72" unit="%"></o-gauge>
```

---

## Install

```bash
npm install @zumer/orbit @zumer/orbit-kit
```

```js
import '@zumer/orbit/style'   // Orbit presentation
import '@zumer/orbit'         // Orbit core web components (<o-arc>, <o-progress>)
import '@zumer/orbit-kit'     // registers every kit component
```

Or straight from a CDN — no build step:

```html
<link rel="stylesheet" href="https://unpkg.com/@zumer/orbit@latest/dist/orbit.css">
<script src="https://unpkg.com/@zumer/orbit@latest/dist/orbit.js"></script>
<script type="module" src="https://unpkg.com/@zumer/orbit-kit@latest/src/orbit-kit.js"></script>
```

`@zumer/orbit` is a **peer dependency** — the kit assumes the Orbit core (CSS +
`<o-arc>` / `<o-progress>`) is present on the page.

Every component is a standard custom element, so it works in plain HTML and in
any framework (React, Vue, Svelte, Angular). Import the whole kit, or just the
components you use:

```js
import '@zumer/orbit-kit/o-gauge.js'
import '@zumer/orbit-kit/o-clock.js'
```

---

## Components

| Tag | What it is |
|-----|------------|
| [`<o-gauge>`](#o-gauge) | Single-value radial gauge |
| [`<o-donut>`](#o-donut) | Data-driven donut / pie chart |
| [`<o-rings>`](#o-rings) | Apple-style concentric activity rings |
| [`<o-knob>`](#o-knob) | Interactive rotary control (drag / wheel / keys) |
| [`<o-menu>`](#o-menu) | Radial / pie menu — single- & multi-level |
| [`<o-instrument>`](#o-instrument) | Cockpit / dashboard gauges (tach, speedo, fuel, airspeed…) |
| [`<o-clock>`](#o-clock) | Analog clock / watch face — the flagship |
| [`<o-compass>`](#o-compass) | Heading indicator |
| [`<o-radar>`](#o-radar) | Radar / scope display |

Common conventions across the kit:

- **`size`** sets the widget width with a CSS length (`200px`, `12rem`, `100%`,
  `calc(...)`, or `var(...)`). The rings follow their container when it resizes.
- **`glow`** is an opt-in neon drop-shadow tinted with the indicator color
  (`glow` or `glow="12"` for the blur radius).
- **`data` / `items` / `zones` / `targets`** take a JSON array in the attribute.
- Set attributes to update live (`el.setAttribute('value', 88)`); interactive
  components also expose JS properties and events.

---

### `<o-gauge>`

A single value on an arc, with a center readout.

```html
<o-gauge value="72" unit="%"></o-gauge>
<o-gauge value="125" max="240" label="125 km/h" range="360" glow></o-gauge>
```

| Attribute | Default | Description |
|---|---|---|
| `value` | `0` | Current value. |
| `max` | `100` | Value that fills the whole arc. |
| `range` | `270` | Arc span in degrees (`360` = full ring, `180` = semicircle). |
| `from` | auto | Start angle; defaults so the gap sits at the bottom. |
| `size` | `200px` | Widget width. |
| `label` | — | Center text; overrides the auto `value`+`unit`. |
| `unit` | `""` | Suffix on the value (`%`, `km/h`). |
| `fill` | `#6366f1` | Progress color. |
| `track` | `#262d38` | Background ring color. |
| `stroke-width` | `8` | Ring thickness. |
| `shape` | `rounded` | Arc cap shape (`rounded`, `none`). |
| `glow` | off | Neon glow on the progress arc. |

---

### `<o-donut>`

A donut / pie chart from a JSON data array. Values are normalized to their sum,
or to an explicit `total` for a partial ring.

```html
<o-donut label="$2.4k"
  data='[{"value":52,"color":"#f97316","label":"Rent"},
         {"value":28,"color":"#eab308"},
         {"value":20,"color":"#22c55e"}]'></o-donut>
```

| Attribute | Default | Description |
|---|---|---|
| `data` | `[]` | `[{ value, color?, label? }]`. Colors fall back to a palette. |
| `total` | sum | Denominator; set it for a partial ring (e.g. `total="100"`). |
| `range` / `from` | `360` / `0` | Arc span and start angle. |
| `stroke-width` | `14` | Ring thickness. |
| `gap` | `2` | Spacing between segments. |
| `shape` | `none` | Segment caps (`none`, or `rounded` to opt in). |
| `track` | faint | Background ring color. |
| `label` / `unit` | — | Center text. |
| `glow` | off | Neon glow per segment. |

---

### `<o-rings>`

Apple-style concentric activity rings (outer ring first). Each ring gets a dim,
solid track in its own color.

```html
<o-rings data='[{"value":80,"color":"#fa114f"},
                {"value":55,"color":"#a3ff00"},
                {"value":92,"color":"#00fff0"}]'></o-rings>
```

| Attribute | Default | Description |
|---|---|---|
| `data` | `[]` | `[{ value, max?, color?, label? }]`. |
| `range` / `from` | `360` | Arc span and start angle. |
| `stroke-width` | `12` | Ring thickness. |
| `step` | `1` | Orbit gap between rings. |
| `track` | auto | Track color (defaults to a dim wash of each ring's color). |
| `shape` | `rounded` | Cap shape. |
| `label` / `unit` | — | Center text. |
| `glow` | off | Neon glow per ring. |

---

### `<o-knob>`

An interactive rotary slider with a numeric `value` property. It is a standalone
control: it does not submit a value with HTML forms or implement native form
validation/reset. To submit it, synchronize its value to your form model or a
hidden input.

```html
<o-knob value="65" unit="%" fill="#3da9fc"></o-knob>
```

```js
knob.addEventListener('input',  e => console.log(e.detail.value)); // while dragging
knob.addEventListener('change', e => console.log(e.detail.value)); // on release
knob.value = 40;                                                   // read / write
```

Drag vertically, scroll the wheel while focused, or use arrow keys / Page Up·Down
/ Home·End. `role="slider"`, ARIA values, disabled state and a default accessible
name are set for you. Use `aria-label` or `aria-labelledby` for a meaningful name.
Values snap relative to `min`, stay within the range, and preserve decimals;
Home and End always reach the endpoints. Nonpositive `step` becomes `1`; a `max`
below `min` becomes `min`. Programmatic value updates work while disabled.
`input` fires for value changes; `change` fires after a changed gesture.

| Attribute | Default | Description |
|---|---|---|
| `value` | `min` | Current value. |
| `min` / `max` | `0` / `100` | Range. |
| `step` | `1` | Increment for keys / wheel and snapping. |
| `range` / `from` | `270` / auto | Arc span and start angle. |
| `size` | `160px` | Widget width. |
| `fill` | `#a1a1aa` | Value color. |
| `track` | `#27272a` | Track color. |
| `stroke-width` | `14` | Ring thickness. |
| `unit` / `label` | — | Value suffix / center readout override. `label` supplies the default accessible name. |
| `disabled` | off | Non-interactive + dimmed. |
| `glow` | off | Neon glow on the value arc. |

---

### `<o-menu>`

A radial / pie menu. Items may nest via `children` for multi-level menus, with
two ways to reveal a branch.

```html
<o-menu label="EDIT" expand="concentric"
  items='[
    {"label":"Size","icon":"🔠","children":[
      {"label":"Bigger","value":"size.up"},
      {"label":"Smaller","value":"size.down"}]},
    {"label":"Format","icon":"✏️","children":[
      {"label":"Bold","value":"fmt.bold"},
      {"label":"Italic","value":"fmt.italic"}]},
    {"label":"Color","icon":"🎨","value":"color"}]'></o-menu>
```

```js
menu.addEventListener('select',   e => e.detail); // { value, label, item, path }
menu.addEventListener('navigate', e => e.detail); // { path, depth }
menu.back(); menu.reset(); menu.path;             // navigation API
```

| Attribute | Default | Description |
|---|---|---|
| `items` | `[]` | `[{ label, value?, color?, icon?, children? }]` (recursive). |
| `expand` | `drill` | `drill` (ring replaces itself, center = back) or `concentric` (parent stays, children fan out — the editor look). |
| `theme` | `mono` | `mono` (slate sectors tinted by `accent` on hover/active) or `color` (refined per-item palette). |
| `accent` | `#3da9fc` | Accent for the `mono` theme. |
| `range` / `from` | `360` | Arc span and start angle (`270` for a quick action wheel). |
| `size` | `280px` | Widget width. |
| `gap` | `6` | Spacing between sectors. |
| `label` | `MENU` | Center / breadcrumb text. |

Keyboard: arrows cycle through visible items, Home / End move to the first /
last item, Enter / Space activate, and Esc / Backspace goes back. Tab enters the
menu once and then exits; opening a branch moves focus to its children and going
back restores the parent item. Icon-only items keep their label as an accessible
name. `navigate` fires whenever the open path changes. `selectedIndex` returns
the selected leaf index in the current level, or `-1` when the selected leaf is
in another level.

Labels are rendered as text. `icon` accepts emoji/text or sanitized inline SVG:
only basic SVG shapes and presentation attributes are retained. Scripts, event
handlers, links, external resources, embedded HTML and arbitrary HTML are removed
or rendered as text. Invalid item arrays/children are ignored.

---

### `<o-instrument>`

Cockpit / dashboard gauges with major + minor ticks, color zones, a redline, a
numeric scale, a needle and a digital readout. Driven by **presets**, or
configured by hand.

```html
<o-instrument preset="tachometer" value="6.2"></o-instrument>
<o-instrument preset="airspeed" value="120"></o-instrument>
<o-instrument min="0" max="100" value="40" unit="%" label="LOAD"
  zones='[{"from":85,"to":100,"color":"#ef4444"}]'></o-instrument>
```

**Presets:** `tachometer`, `speedometer`, `fuel`, `temp`, `boost`, `voltmeter`,
`airspeed`, `altimeter`, `cpu`, `gpu`, `vu`. Any attribute below overrides the
preset.

| Attribute | Default | Description |
|---|---|---|
| `value` | `min` | Current reading. |
| `min` / `max` | `0` / `100` | Scale range. |
| `range` / `from` | `270` / auto | Arc span and start angle. |
| `ticks` | `7` | Major tick / label count. |
| `minor` | `5` | Minor ticks between each pair of majors. |
| `zones` | `[]` | `[{ from, to, color }]` color bands (in value units). |
| `redline` | — | Sugar: a red zone from this value to `max`. |
| `tick-labels` | numeric | Custom scale labels, e.g. `'["E","½","F"]'`. |
| `unit` / `label` | — | Readout unit and caption. |
| `digital` | on | Show the numeric readout. |
| `case` | auto | `round`, `square`, `rounded`, or `bare` (auto for ≤180° arcs). |
| `accent` / `needle-color` / `tick-color` / `face` / `bezel` | — | Theming. |
| `size` | `240px` | Widget width. |
| `glow` | off | Neon glow on the needle / zones. |

> `<o-meter>` (a basic speedometer) still ships for back-compat but is
> superseded by `<o-instrument preset="speedometer">`.

---

### `<o-clock>`

The flagship: an analog clock / watch face. Live or static, with case shapes,
an oval (tonneau) dial, numerals, smartwatch complications, chronograph
sub-dials, and an iOS activity-rings face.

```html
<o-clock live seconds></o-clock>                          <!-- ticking wall clock -->
<o-clock time="10:08:42" numerals="roman" case="square"></o-clock>
<o-clock preset="smartwatch" live brand="ORBIT"></o-clock>
<o-clock preset="chrono" live></o-clock>                   <!-- tri-compax sub-dials -->
<o-clock case="rectangle" dial="oval" live smooth></o-clock>   <!-- tonneau -->
<o-clock dial="rings" live seconds></o-clock>              <!-- iOS activity-ring clock -->
```

**Presets:** `classic`, `roman`, `minimal`, `chrono`, `smartwatch`.

| Attribute | Default | Description |
|---|---|---|
| `time` | now | Static `HH:MM[:SS]`. Omit for the current time. |
| `live` | off | Tick with the real clock. |
| `smooth` | off | Sweeping (not ticking) second hand; implies `seconds`. |
| `seconds` | off | Show a second hand. |
| `numerals` | `arabic` | `arabic`, `roman`, or `none`. |
| `case` | `round` | `round`, `square`, `rounded`, `rectangle`. |
| `dial` | `round` | `round`, `oval` (tonneau, matches the case), or `rings` (iOS face). |
| `digital` / `date` / `brand` | off / off / — | Complications. |
| `subdials` | off | Chronograph sub-dials (small-seconds / 24h / date). |
| `accent` / `hand-color` / `tick-color` / `face` / `bezel` / `case-bg` | — | Theming (also via CSS vars, e.g. `--ok-clock-accent`). |
| `size` | `300px` | Widget width. |
| `glow` | off | Neon glow on the hands. |

---

### `<o-compass>`

A heading indicator: a fixed dial with a top lubber index; the card (ticks +
cardinals) rotates so the current `heading` sits under the index.

```html
<o-compass heading="045"></o-compass>
<o-compass heading="120" labels="N,NE,E,SE,S,SW,W,NW"></o-compass>
```

| Attribute | Default | Description |
|---|---|---|
| `heading` | `0` | Heading in degrees (clockwise from North). |
| `labels` | `N,E,S,W` | Cardinal labels (comma-separated). |
| `fill` | `#ef4444` | Accent (north tick + lubber). |
| `unit` | `°` | Readout suffix. |
| `size` | `220px` | Widget width. |

---

### `<o-radar>`

A radar / scope: concentric range rings, cross-hair spokes, a rotating
conic-gradient sweep, and glowing blips.

```html
<o-radar rings="4" spokes="12" label="SCAN"
  targets='[{"angle":60,"dist":0.8},
            {"angle":200,"dist":0.45},
            {"angle":310,"dist":0.65,"color":"#ef4565"}]'></o-radar>
```

| Attribute | Default | Description |
|---|---|---|
| `targets` | `[]` | `[{ angle, dist, color? }]` — `angle` °CW from top, `dist` 0–1. |
| `rings` | `4` | Concentric range rings. |
| `spokes` | `8` | Radial cross-hair lines. |
| `sweep` | on | The rotating beam (`sweep="false"` to hide). |
| `sweep-width` | `110` | Beam span in degrees. |
| `speed` | `4` | Seconds per revolution. |
| `color` | `#22d3ee` | Scope color. |
| `label` | — | Center label. |
| `size` | `240px` | Widget width. |

---

## How it works

orbit-kit components render their structure into the **light DOM** (not shadow
DOM) on purpose. Orbit combines global CSS (`cos()` / `sin()` / `:has()`) and
inherited `--o-*` custom properties with a JavaScript layout scheduler. The
scheduler discovers rings, assigns counts/order and redraws SVG after data,
CSS or container changes. The kit uses the light DOM so the CSS cascade and
runtime can reach the composed layout.
The generated markup is exactly the documented Orbit structure — "view source"
stays honest. Inspect any component in devtools to see the rings, satellites and
arcs it expands into.

Everything is theme-able through plain CSS custom properties; the convenience
attributes above just map onto them.

## Examples

Live showcase of every component: **[zumerlab.com/orbit-kit](https://zumerlab.com/orbit-kit)**
(source in [`docs/index.html`](docs/index.html)).

To try your local changes, build the sibling Orbit checkout and start the demo:

```bash
(cd ../orbit && npm run compile)
npm run demo
# open http://127.0.0.1:5173
```

The demo serves this checkout's components and the sibling Orbit build, replacing
the gallery's CDN asset URLs. It never loads a published package in their place.
Set `ORBIT_DIR=/path/to/orbit` to choose another core checkout and `PORT=5174` to
change the port. If there is no sibling checkout, it uses the installed core in
`node_modules/@zumer/orbit`. Reload after edits; recompile Orbit when its source
changes. Try dragging the knob, using its arrow keys, and opening the nested menus.

## Development and checks

```bash
npm install
npx playwright install chromium firefox webkit
npm run test:unit
ORBIT_DIR=../orbit npm test
```

`npm test` runs Node checks and real browser regressions. The browser suite loads
local assets only: `ORBIT_DIR` points at an Orbit checkout with a fresh `dist/`;
without it, tests use `node_modules/@zumer/orbit`. Chromium is required. Firefox
and WebKit run when installed; set `BROWSERS=chromium,firefox,webkit` to require
all three. Browser tests assert keyboard/pointer behavior, focus, ARIA, data
safety, reactive layout and sizing. Screenshot scripts are optional visual aids:

```bash
ORBIT_DIR=../orbit npm run shots
ORBIT_DIR=../orbit npm run shots:menus
```

They save captures in `.shots/`, print the exact core path used, and fail on
console errors, page errors or missing local package assets. They never fall back
to a CDN build when a local file is missing.

The fixes on this branch depend on the matching updated Orbit runtime. Build
the core before testing against its checkout. Publish the kit and compatible
core builds together; the current package versions have not been advanced.

## Browser support

Modern evergreen browsers. Orbit relies on `:has()` and CSS trigonometric
functions (`cos`, `sin`), container query units and ResizeObserver; the
radar/clock visuals use `conic-gradient` and
`color-mix`. Orbit shows an upgrade notice on unsupported browsers.

## License

[MIT](LICENSE) — Juan Martin Muda · [Zumerlab](https://github.com/zumerlab)
