# Changelog

## 2.0.0

Orbit Kit now runs on Orbit 2, with seven new components and four options that work the same in every component. Tag names and attributes from 0.x keep working; the few behavior changes are under Changed.

### Added

- `<o-range>`: a circular range slider with a start and an end handle on one ring, for numbers (`min`, `max`, `step`, `wrap`) or times of day (`mode="time"`, `hours="12|24"`), with `min-span` / `max-span`, a span readout, keys per handle and the band, and form value `start-end`.
- `<o-time-picker>`: pick a time on a clock face, hours (12h with AM/PM, or 24h with an inner ring) then minutes, with `minute-step`, `min` / `max`, spinbutton fields for the keyboard and form value `HH:MM`.
- `<o-spinner>`: a loading indicator (`ring`, `dots`, `segments`, `orbit`, `progress`) with `role="progressbar"`, determinate progress and a calm version for reduced motion.
- `<o-radar-chart>`: a radar chart with series, per-axis scales, tooltip, keyboard, legend, a table for screen readers and animated updates.
- `<o-sunburst>`: a hierarchical chart from a JSON tree. Labels where they fit, colors by branch, a readout with number format and share, click or Enter to zoom, keyboard navigation, `select` and `navigate` events, and an accessible tree.
- `<o-wheel>`: a prize wheel with weighted or forced results (`spin(index)`), `tick` and `result` events and `remove-winner` for raffles.
- `<o-color-wheel>`: a color picker and form control that submits hex, `rgb()` or `hsl()`, with optional swatches. `color.js` exports the color helpers.
- Themes: `theme="dark"`, `"light"` or `"glass"` on any component, or the class `ok-theme-dark`, `ok-theme-light` or `ok-theme-glass` on a container. Themes are sets of `--ok-*` properties at zero specificity; your rules and the color attributes win. New shared tokens: `--ok-hand`, `--ok-surface`, `--ok-backdrop`.
- Number format: `format` (`decimal`, `percent`, `currency`, `unit`, `compact`), `decimals`, `currency` and `locale` on the gauge, knob, meter, instrument, donut, rings, compass and radar, through `Intl.NumberFormat`. They reach readouts, tick labels, titles and `aria-valuetext`. The locale falls back to the closest `lang`. `unit` stays text unless `format="unit"`.
- `formatter`: a JS property on every component, `(value, { kind, min, max, locale }) => string`.
- `min`, `max` and `step` read the same everywhere: `step` on the gauge, meter and instrument; `min` and `max` on the rings (defaults for each ring, which can also set its own `min`) and the radar (`dist` is read between them).
- Form controls: `<o-knob>` and `<o-menu>` are form-associated custom elements with `name`, `disabled` (also from a `<fieldset>`), form reset and restore, `validity`, `checkValidity()` and `labels`. The knob adds `defaultValue`, `min`, `max`, `step`, `stepUp()` and `stepDown()`; the menu adds `required`, a `value` attribute and a `value` setter.
- `<o-menu>` fires `input` and `change` with every pick, besides `select`, and takes `disabled`.
- `<o-menu palette>`: `mono` or `color`. `theme="color"` still works and can be combined, as in `theme="color light"`.
- `<o-rings spacing>`: the new name of `step`, which still works.
- `base.js` exports the helpers for new components: `FormControl`, `formatNumber`, `normalizeRange`, `snapValue`, `rangeFraction`, `pointerAngle`, `valueAtAngle`, `THEMES`, `withShared` and the attribute groups. `DESIGN-shared.md` explains them.

### Changed

- Setting `knob.value` from code no longer fires `input`, like a native input. User changes still fire `input` and `change`.
- Readouts show the clamped value: a gauge with `value="120" max="100"` reads 100. A `max` below `min` becomes `min` on the gauge, meter and instrument too (it used to reset the range), the same as the knob and `<input type="range">`.
- A disabled knob loses focus, like a disabled input.
- `<o-instrument>` without `accent` or a preset uses `--ok-accent` (still red by default), and white preset needles follow `--ok-hand`, so themes reach them.
- `<o-meter>` draws its needle with `--ok-meter-needle` (set by `needle-color`).

### Moving to Orbit 2

#### Changed

- Requires `@zumer/orbit` `^2.0.0` (peer dependency). Orbit 1.x is no longer supported.
- Components are sized by their universe: the `.bigbang` is as wide as `size`, `orbit-12` touches its edge and the rest is laid out in lanes. The `--o-force` scaling of 0.x is gone. Outer bands now reach the edge of the widget, so gauges, knobs, donuts and rings look a little bigger at the same `size`.
- Text scales with the widget (`--ok-font-size`, readouts in `em`) instead of inheriting the page font size.
- `gap` is a share of the widget width, in percent, in `<o-donut>`, `<o-menu>` and `<o-status>`. Defaults changed to keep the same look (donut `1.5`, menu `1.2`).
- Colors are custom properties that inherit: `--ok-fill`, `--ok-track`, `--ok-accent`, `--ok-text`, `--ok-face`, `--ok-bezel`, `--ok-tick`, `--ok-case`, `--ok-focus`. The color attributes set them on the element. Component-specific properties (`--ok-clock-*`, `--ok-inst-*`, `--ok-cmp-*`, `--ok-menu-*`) still work and fall back to the shared ones.
- `<o-menu>`: the ring touches the edge, and in concentric mode open levels stack inward from it; icons are plain satellites centered in their sector; `--o-menu-hub` is now `--ok-menu-hub` (the old name still works).
- `<o-radar>`: range rings are drawn by one layer for any count; spokes are vectors from the center; blips use `--o-alignment` (the 1.x spelling `--o-aligment` is gone).
- `<o-clock>`: sub-dials are satellites holding a universe of their own; hands and ticks scale with the dial.
- `<o-instrument>`: preset captions are written in normal case (`Speed`, `Fuel`); the `vu` preset uses a scale of whole numbers.
- `<o-compass>`, `<o-instrument>`, `<o-clock>` and `<o-radar>` no longer letter-space or uppercase their captions.

#### Added

- `<o-timer>`: a countdown ring with start, pause and reset buttons, `warn`, `ticks`, methods, properties and events.
- `<o-status>`: status segments in up to three layers, with labels along the arcs, keyboard navigation and a `select` event.
- `thickness` on every band component, in lanes. `orbit` and `stroke-width` from 0.x still work.
- `<o-gauge min>`.
- `accent` on `<o-compass>` (alias of `fill`) and `<o-radar>` (alias of `color`).
- `<o-knob>` follows the pointer around its band: the track is an `interactive` `<o-arc>` with a `hit-width`. Dragging anywhere else still works vertically.
- `<o-gauge>`, `<o-instrument>` and `<o-meter>` have `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and `aria-valuetext`.
- Visible focus rings (`--ok-focus`) on the knob, menu sectors, timer buttons and status segments.
- The instrument needle eases to a new value, except with reduced motion.
- Tests for the new components, for meter semantics and for bands staying inside their box. The browser suite fails on console errors and on any `[orbit]` warning, and checks that it runs on Orbit 2.

#### Fixed

- Generated accessible names and roles never replace ones you set, including `aria-labelledby`.
- `<o-status>` and `<o-timer>` import safely during server rendering.
