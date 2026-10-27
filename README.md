# Orbit Kit

Ready-made radial components built on [Orbit](https://github.com/zumerlab/orbit): gauges, donut charts, activity rings, knobs, radial menus, instruments, clocks, compasses, radars, timers and status rings. One tag each.

```html
<o-gauge value="72" unit="%"></o-gauge>
```

That tag writes the Orbit structure you would write by hand into the page: a `.bigbang`, a `.gravity-spot`, a ring, two arcs and a readout. It scales with its box, takes your CSS and shows up as plain elements in the inspector. When you need something the kit does not do, start from what it built.

[Documentation and live examples](https://zumerlab.com/orbit/kit/)

## Install

The kit needs Orbit 2 on the page: its stylesheet, and its script, which draws the arcs.

```sh
npm install @zumer/orbit @zumer/orbit-kit
```

```js
import '@zumer/orbit/style'
import '@zumer/orbit'
import '@zumer/orbit-kit'
```

Or in a plain page:

```html
<link rel="stylesheet" href="https://unpkg.com/@zumer/orbit/dist/orbit.min.css">
<script defer src="https://unpkg.com/@zumer/orbit/dist/orbit.min.js"></script>
<script type="module" src="https://unpkg.com/@zumer/orbit-kit/src/orbit-kit.js"></script>
```

The entry registers every component. To load only the ones you use, import their files:

```js
import '@zumer/orbit-kit/o-gauge.js'
import '@zumer/orbit-kit/o-timer.js'
```

`@zumer/orbit` 2 is a peer dependency. The kit does not work with Orbit 1.x. Components are standard custom elements, so they work in plain HTML and in any framework that renders the DOM.

## Components

| Tag | What it is |
| --- | --- |
| [`<o-gauge>`](https://zumerlab.com/orbit/kit/gauge.html) | One value on an arc, with a readout. |
| [`<o-donut>`](https://zumerlab.com/orbit/kit/donut.html) | A donut chart from a JSON array. |
| [`<o-rings>`](https://zumerlab.com/orbit/kit/rings.html) | Concentric activity rings. |
| [`<o-knob>`](https://zumerlab.com/orbit/kit/knob.html) | A rotary control: pointer, wheel and keys. |
| [`<o-menu>`](https://zumerlab.com/orbit/kit/menu.html) | A radial menu, flat or nested. |
| [`<o-instrument>`](https://zumerlab.com/orbit/kit/instrument.html) | Needle gauges with ticks, zones and presets. |
| [`<o-clock>`](https://zumerlab.com/orbit/kit/clock.html) | Clocks and watch faces, live or fixed. |
| [`<o-compass>`](https://zumerlab.com/orbit/kit/compass.html) | A heading indicator. |
| [`<o-radar>`](https://zumerlab.com/orbit/kit/radar.html) | A scope with a sweep and blips. |
| [`<o-timer>`](https://zumerlab.com/orbit/kit/timer.html) | A countdown ring with start, pause and reset. |
| [`<o-status>`](https://zumerlab.com/orbit/kit/status.html) | Health of many things as colored segments, in layers. |
| [`<o-range>`](https://zumerlab.com/orbit/kit/range.html) | A circular range slider: two handles, numbers or times of day. |
| [`<o-time-picker>`](https://zumerlab.com/orbit/kit/time-picker.html) | A clock-face time picker: hours, then minutes. |
| [`<o-spinner>`](https://zumerlab.com/orbit/kit/spinner.html) | A loading indicator in five variants, with determinate progress. |
| [`<o-radar-chart>`](https://zumerlab.com/orbit/kit/radar-chart.html) | A radar (spider) chart: one polygon per series on a shared web. |
| [`<o-sunburst>`](https://zumerlab.com/orbit/kit/sunburst.html) | A tree as nested rings: hover a branch, click to zoom in. |
| [`<o-wheel>`](https://zumerlab.com/orbit/kit/wheel.html) | A prize wheel: spins, slows down and lands on a result picked by weight. |
| [`<o-color-wheel>`](https://zumerlab.com/orbit/kit/color-wheel.html) | A color picker: hue ring, saturation and brightness square, swatches. A form control. |

`<o-meter>`, a basic needle gauge from 0.x, still ships. `<o-instrument>` does all it does and more.

A few of them:

```html
<o-donut label="$2.4k" data='[{"value":52,"label":"Rent"},{"value":28,"label":"Food"},{"value":20,"label":"Other"}]'></o-donut>

<o-knob value="65" unit="%" aria-label="Volume"></o-knob>

<o-instrument preset="tachometer" value="6.2"></o-instrument>

<o-clock preset="chrono" live></o-clock>

<o-timer duration="1:30" label="Tea"></o-timer>

<o-status label="Services" data='[{"label":"API","status":"ok"},{"label":"DB","status":"warn"},{"label":"Queue","status":"down"}]'></o-status>
```

Every attribute, event and custom property is on the component's page in the documentation.

## What they share

- `size` sets the width with any CSS length. `100%` follows the container as it resizes.
- `thickness` sets band thickness in lanes, Orbit's unit: a twelfth of the radius.
- `fill` and `track` color the band components; `accent` is the highlight of the dial components.
- `label` and `unit` set the text in the middle; `range` and `from` the arc span and start angle.
- `min`, `max`, `step`, `format` and `theme`: see [Shared options](#shared-options).
- `glow` adds a glow in the indicator color (`glow="12"` for the blur in px).
- Lists (`data`, `items`, `targets`, `zones`) are JSON in the attribute.
- Change an attribute and the component updates. Values only move what moves.

Colors are custom properties that inherit, so one rule themes a whole panel:

```css
.dashboard {
  --ok-fill: #2dd4bf;
  --ok-track: #12302c;
  --ok-accent: #f97316;
  --ok-text: #e2e8f0;
}
```

Text scales with the widget: the base font size is a share of its box (`--ok-font-size`) and readouts are sized in `em`.

## Shared options

Four things work the same in every component that has them.

**Themes.** `theme="dark"`, `"light"` or `"glass"` on a component, or the class `ok-theme-dark`, `ok-theme-light` or `ok-theme-glass` on a container, and everything inside follows. A theme is only a set of the `--ok-*` properties above, at zero specificity, so any rule of yours still wins. Without a theme nothing changes.

```html
<section class="ok-theme-light">
  <o-gauge value="64" unit="%"></o-gauge>
  <o-knob value="40"></o-knob>
</section>
```

**Number format.** `format` is `decimal`, `percent`, `currency`, `unit` or `compact`, with `decimals`, `currency` and `locale`. It goes through `Intl.NumberFormat` and reaches readouts, tick labels and `aria-valuetext`. `percent` shows where the value sits between `min` and `max`. `unit` stays plain text after the number, except with `format="unit"`, where it names an Intl unit. For full control, set a function:

```html
<o-gauge value="1234.5" max="5000" format="currency" currency="EUR" locale="de-DE"></o-gauge>
<o-instrument max="240" value="88" format="unit" unit="kilometer-per-hour"></o-instrument>
```

```js
gauge.formatter = (value, { kind }) => kind === 'tick' ? `${value}` : `${value} pts`
```

**min, max and step.** Every component with a value reads them the way `<input type="range">` does: values are clamped, `step` snaps them (`step="any"` turns it off), and a `max` below `min` becomes `min`. Arrow keys move one step, Page Up and Page Down ten.

**Forms.** `<o-knob>` and `<o-menu>` are form controls. Give them a `name` and they submit with the form, follow `disabled` (also from a `<fieldset>`), reset with it and come back on page restore. The menu takes `required` and a `value` to start from. Both fire `input` and `change` like native inputs; setting `value` from code fires neither.

```html
<form>
  <o-knob name="volume" value="30"></o-knob>
  <o-menu name="action" required items='[{"label":"Cut","value":"cut"},{"label":"Copy","value":"copy"}]'></o-menu>
</form>
```

Every component has a role and a name that follow its value: gauges and instruments are meters, the knob is a slider, the menu is a menu, the timer is a timer. `aria-valuetext` uses the number format. An `aria-label` of yours is kept. Decorative motion stops with `prefers-reduced-motion`.

## How it works

Components render into the light DOM on purpose. Orbit places things with global CSS and inherited `--o-*` properties, and its runtime watches the document to number rings and draw arcs, so the kit's markup has to live where both can reach it. Each component is sized by its universe, like any Orbit 2 layout: the `.bigbang` is as wide as `size`, `orbit-12` touches its edge, and everything else is laid out in lanes.

## Coming from 0.x

Tag names and attributes still work. What changed is underneath:

- The kit runs on Orbit 2.
- Components are sized by their universe instead of a scaled `--o-force`. The outer band touches the edge of the widget, so a gauge looks a little bigger in the same `size`.
- `thickness` sets band thickness. `orbit` and `stroke-width` still work as before.
- `gap` is a share of the widget width, the same in the donut, the menu and the status ring.
- Colors are custom properties you can set from CSS.
- New: `<o-timer>`, `<o-status>`, `min` on the gauge, `accent` on the compass and the radar.

The [CHANGELOG](CHANGELOG.md) has the full list.

## Development

```sh
npm install
npx playwright install chromium
npm test
```

`npm test` runs the Node checks and a browser suite against a real Orbit 2 build. It uses `ORBIT_DIR` when set, then a sibling `../orbit` checkout with a fresh `dist/`, then `node_modules/@zumer/orbit`. Chromium is required; Firefox and WebKit run when installed (`BROWSERS=chromium,firefox,webkit` makes them required). The browser suite fails on page errors, console errors and any `[orbit]` warning.

To try changes in the documentation site, copy `src/` to `docs/kit/src/` in the Orbit repository and run its `npm run demo`; a sibling `orbit-kit` checkout is picked up on its own.

## Browser support

Modern evergreen browsers. Orbit needs CSS `sin()`, `cos()`, container query units and `:has()`; the radar and clock faces also use `conic-gradient` and `color-mix()`.

## Sponsor

Orbit Kit is free and made in spare time. If it saves you time, you can [sponsor it on GitHub](https://github.com/sponsors/tinchox5).

## License

[MIT](LICENSE). Juan Martín Muda, [Zumerlab](https://github.com/zumerlab).
