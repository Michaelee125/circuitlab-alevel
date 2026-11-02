# Agent progress

Last updated: 2026-11-01 (Phase 1 build + review fixes)

## Status

| Area | State |
| --- | --- |
| Monorepo scaffold | ✅ complete |
| `circuit-core` (model, topology, geometry, validation, serialisation) | ✅ complete |
| `physics-engine` (MNA, non-linear, transient, sweeps) | ✅ complete, 25 tests |
| `reasoning-engine` (structural rules + verified chains, en/zh) | ✅ complete, 10 tests |
| `teaching-engine` (11 experiments, guided, dataset) | ✅ complete, 8 tests |
| `i18n`, `ui`, `platform-adapters` (web + WeChat) | ✅ complete |
| `circuit-renderer` (schematic + realistic, particles, meters) | ✅ complete |
| `apps/web` (editor, modes, panels, responsive, persistence) | ✅ complete |
| GitHub Actions workflow | 🟡 template ready, activation blocked by missing OAuth `workflow` scope |
| GitHub Pages deployment | ✅ live from `gh-pages`, verified |
| WeChat mini-program | 🟡 scaffold + adapter layer only (Phase 2, not published) |

- Unit/physics/reasoning/teaching/routing/flow tests: **77 passed**
- Desktop e2e: **20 passed** (`desktop-chromium`, includes the smoke test)
- Mobile e2e: iPhone 13 **7 passed**, Pixel 7 **7 passed**, iPad **7 passed**
- Total Playwright: **41 passed**, 63 intentionally skipped
- TypeScript: strict, no errors
- Production build: passing (Pixi + ECharts split into chunks)
- Live site verified: HTTP 200, assets 200, WebGL + LDR reasoning, 0 console errors

## Review fixes (after first live delivery)

- Language switching is always reachable: three explicit options (EN / 中文 / EN/中) on desktop and a native select on phones; chart axes, component descriptions, meter notes and toast messages were localized too.
- The Explain panel can be pinned so it stays visible under Properties.
- Cells and batteries with `r > 0` now draw an internal resistor and an `r = … Ω` annotation in both visual modes, with terminal p.d. / lost-volts cards in the inspector.
- Wire logic: connections between pins that are already on the same node are refused with a localized message; overlapping routes are pushed into parallel lanes; wires can be selected and deleted.

## Visual overhaul (second review)

- Replaced the dark-blue theme with an Apple-inspired Liquid Glass system: pure-black dark background, translucent layered panels with specular hairlines, iOS segmented controls, spring switches, frosted settings popover and glass sheets/modals.
- Rebuilt the realistic renderer with gradient materials (ceramic, brushed metal, glass, LCD) and added animated feedback layers: a lamp halo that scales with dissipated power, a breathing selection ring, a soft pulse whenever a component's current changes, and brighter current particles.
- Added an optional, collision-aware V / I / R overlay next to every component in both visual modes. Chips are drawn in screen space so they stay legible at any zoom, avoid other components and each other, and are clamped inside the canvas.
- Updated the shared UI palette, chart colours and typography to match the new design language; the light theme is a full Apple-style light surface.

## Second visual pass (third review)

- Redrew every realistic component again with richer materials: ceramic resistor with beveled colour bands and metal end caps, glass bulb with screw base and filament supports, cylindrical cell with wrapper, "+" marking and copper cap, LDR disc with gold serpentine and glass highlight, aluminium capacitor with vent and sleeve, diode with metal band and printed symbol, meters with recessed LCD, scanlines and screw posts, switch with brushed plate and chrome lever, plated terminal posts everywhere.
- Restored the current animation (it had become nearly invisible against the new wire colour) and upgraded it to additive comet trails whose speed, size and colour respond to the current; particle size is normalised so it stays tasteful at any zoom.
- Added a one-tap dark / light theme toggle back to both the desktop and mobile top bars.
- Fit-to-view is tighter, and the canvas now shrinks above the chart dock so circuits (including voltmeters) are never hidden behind the graph panel.

## Third visual pass (fourth review)

- Voltmeter/ammeter readings no longer collide with the long return wire: detour lanes now run 220 units below the row (document bounds include routed wires so fit-to-view cannot clip them), and meter text is scaled down when a reading would overflow its display.
- The live-values feature now has a clearly labelled **Values** pill in the canvas toolbar (active state + aria-pressed), in addition to the settings and help switches; the preference persists.
- Value cards were restyled as Liquid Glass panels: gradient frost, top sheen, double hairline border, soft contact shadow and an accent rail.
- Card placement is strict: eight candidate positions around each component, rejecting any overlap with components, designator labels, other cards or wire segments; when no free position exists the card is omitted rather than drawn over the circuit (it reappears as you pan or zoom).

## Mobile control pass (fifth review)

- The phone toolbars no longer clip: the stage overlay scroll container was removed, the Values control collapses to its icon (still with aria-pressed), and at ≤380 px the controls shrink so undo, redo, delete, fit and view switch all remain visible at 320 px.
- The canvas is inset 64 px on phones, so the floating toolbar never covers the circuit; fit-to-view uses the remaining area.
- The phone top bar was regrouped: brand + mode segmented on the left, spacer, then the language picker and a single glass cluster holding the experiment library, theme toggle and menu, separated by hairlines. The native select is now an Apple-style pill with a custom chevron.
- Compact value cards (80 × 44, 7.7 px mono) let three cards sit above a phone circuit without overlapping; desktop keeps the larger glass cards.
- Toasts now sit above the phone tab bar instead of covering it.

## Liquid Glass interaction pass (sixth review)

- Every glass control now answers a press with a liquid-glass reaction: it compresses slightly (0.95 spring), gains an inner rim light, a specular sheen sweeps across it, and a soft light ring blooms from the pointer (installed once in `liquid.ts`, honours reduced motion, never blocks clicks).
- The desktop chart dock became a floating Liquid Glass panel: layered translucent gradient, 50 px backdrop blur with saturation and brightness lift, inset top highlight, 24 px corners and a deep soft shadow; its header gets its own hairline sheen.
- On phones the tab bar is now a floating glass capsule (24 px radius, 46 px blur) with an active glass pill, and the bottom sheets (Properties/Explain/Compare/Graph) use the same layered glass with a specular top edge.
- Fixed the internal-resistance example wiring (voltmeter polarity) so its leads no longer cross the cell, and meter readings now scale into the display so digits stay inside the instrument.

## Wire routing and current animation pass (seventh review)

- Rewrote route selection as a scored search over several lanes: a candidate is penalised for overlapping existing wires, crossing other component bodies, and unnecessary detour. Results are cached against a document signature (positions + terminal bindings) so in-place edits cannot serve stale routes.
- Straight wires that would coincide (common after dragging a voltmeter next to a resistor) are now offset into a parallel lane with short terminal jogs instead of being drawn on top of each other. All preset circuits now route with zero overlapping pairs.
- The wiring guide is an unmistakable ghost: wide-gap dashes, a soft glow and a ring at the fingertip; it only appears after the pointer has moved away from the terminal.
- Fixed the stray diagonal lines in the current animation: a comet trail could wrap around the end of a wire and draw a chord across the whole circuit. Trails now clamp at the wire ends and interpolate along the polyline.
- Added routing regression tests for preset orthogonality/no-overlap and for dragged layouts; unit suite is now 54 tests.

## Routing and reasoning coverage pass (eighth review)

- Wires now avoid component bodies properly. When the chosen corridor would cross another component (common after dragging a part into a wire's path), the router falls back to an A* search over a visibility graph built from component edges: it finds an orthogonal route around every body, penalises running along existing wires, prefers few bends, and falls back to the direct route only when the components physically overlap. All presets and dragged layouts pass new regression tests for orthogonal, component-free, overlap-free routes.
- Added a general reasoning rule that explains any single parameter change from the numerical before/after solutions: resistance-like changes on any component (rheostat, lamp, diode), sensors, supply EMF, internal resistance, switches and capacitors. It builds cause → resistance / total resistance → current → per-component p.d.s → lamp brightness → meter readings → unaffected parallel branches, and only asserts directions verified by the solver. Specialised rules still take precedence for the classic teaching cases.
- New regression tests: 65 unit tests (general-network reasoning cases, a multi-supply guard, and component-avoidance routing) and 39 Playwright checks.

## Transparent value cards (ninth review)

- The per-component V / I / R cards are now real DOM Liquid Glass instead of painted rectangles: the renderer keeps a pointer-transparent layer inside the canvas host, reuses one element per component, and updates positions on every pan/zoom. Each card uses `backdrop-filter: blur(20px) saturate(190%)` with a translucent gradient, hairline border, inner highlight and accent rail, so the circuit is visibly frosted behind the data. Leader lines are drawn from the card edge to the component so they never cross the glass.
- Light and dark variants, compact phone cards, and the strict no-overlap placement are preserved. The values e2e test asserts three cards and a blurring backdrop filter.

## Exam mode removed (tenth review)

- Removed the Exam mode entirely: the mode switcher now offers Explore and Guided only, the exam panel and its question bank were deleted from the teaching engine, and the exam tab/sheet, marking UI, i18n strings and the exam-specific tests are gone.
- The Explain panel still shows software-authored practice marking points and a model answer; the pin control is now always available.
- Unit tests are 61 (the four exam-marking tests were removed), Playwright checks 38.

## Manual wire adjustment (eleventh review)

- Wires can now carry an optional manual orthogonal route (`Wire.route`). The renderer, particle animation, hit testing and JSON serialization all use it; the auto router seeds manual routes first so automatic wires avoid them.
- Selecting a wire shows glass handles on its movable segments (inner segments, or the whole of a straight wire). Dragging a segment reshapes the route perpendicular to itself; a straight wire is moved into a parallel lane with terminal jogs. Endpoints stay exactly on the terminals and every segment stays horizontal/vertical. Routes snap to a 4 px grid and a drag becomes one undo step.
- A stale or malformed manual route (for example after moving a component) is ignored and the automatic route is used instead.
- The Properties rail shows a "Selected wire" card with the manual/automatic state, a Reset-route action and Delete.
- Coverage: unit tests for manual routes, JSON round-trip, invalid-route fallback, stale routes and editable segments; a Playwright test drags a wire, resets it and deletes it.

## Three-terminal sliding rheostat (twelfth review)

- Added a distinct 3-terminal `potentiometer` kind ("Sliding rheostat" / 滑动变阻器) alongside the existing 2-terminal `variable-resistor`, now named "Adjustable resistor" / 可调电阻. Both remain in the component library with separate names, glyphs, descriptions and inspectors.
- The new component has terminals A, B and a wiper W. The solver stamps two track sections sharing the wiper node (`R_AW=(1−f)R`, `R_WB=fR`), uses only the A–W or W–B section when one end is unconnected, and falls back to the full track when the wiper is unconnected. Results expose the wiper p.d., wiper current and both section resistances.
- Schematic and realistic renderers draw the three-terminal symbol and wiper; the inspector adds a wiper-position slider (0 % at B, 100 % at A) and potential-divider output cards with the formula. The reasoning engine explains wiper changes with section resistances and `V_WB = (R_WB/R_total)·V_AB`.
- Router fix: endpoint component bodies are now avoided as well, so a wiper wire cannot run back through its own rheostat.
- Tests: potential-divider, two-wire, full-track and JSON round-trip cases; a reasoning test; an e2e library/inspector test. 68 unit / 40 Playwright checks.

## Power readouts (thirteenth review)

- Every Liquid Glass value card now carries a fourth row: P. Passives show dissipated power; the source card shows the external circuit power (terminal p.d. × current) plus `Pr = I²r`, the power lost in the internal resistance.
- The source inspector gained external and internal-resistance power cards and the balance line `P_EMF = P_ext + P_r`; the Measurements dock shows the same two powers in real time.
- Fixed `totalPowerDelivered`/`totalPowerDissipated`: the solver iterated `Object.values` over a Map (always empty), so these totals were reported as 0. They now use `readings.values()`; the tests assert 22 W external and 22 W dissipated for a 12 V, 0.5 Ω source driving 5.5 Ω.
- Tests: source-power physics test, source-power inspector/measurements e2e and value-card row assertions. 69 unit / 41 Playwright checks.

## Floating mobile glass shell (fourteenth review)

- The mobile stage is now full-bleed: the canvas and grid run edge to edge behind the top controls, the canvas toolbar and the bottom tab dock. The old separate top bar background, stage margin, rounded card and border are gone.
- The top bar is an absolute overlay with `pointer-events: none`; only the mode switch, language picker and action cluster capture touches, so the drawing can be panned in the gaps. The toolbar and dock remain glass and now blur the live drawing underneath.
- The fit and the value cards use the measured toolbar/tab-bar geometry (`data-inset-top` / `data-inset-bottom`), including notch safe areas and a wrapping toolbar, instead of fixed 118/96 guesses.
- E2E asserts the full-bleed canvas extends behind the dock and that the top inset is measured. 69 unit / 41 Playwright checks.

## Clean routing and current direction (fifteenth review)

- Replaced the lane-only auto-router with port-flexible candidates: each terminal may leave along its normal or tangentially, and candidates are scored by length, bends, component cuts, crossings and overlaps. Component interiors are rejected; short wires are routed first so long returns avoid them. The preset experiments report zero component cuts; a deliberately messy two-row LDR circuit now routes with shorter, non-overlapping paths.
- Added one-tap Auto-arrange to the mobile toolbar (it was desktop-only). `autoLayout` now detects a simple source → series chain → return loop and lays it out as one row, with any voltmeters below the element they measure. The same two-row circuit becomes a straight row after the tap.
- Fixed current-animation direction and magnitude: the solver exposes per-terminal currents (entering positive), and the renderer uses the smaller terminal current, so parallel branches animate with their branch current, ideal voltmeter leads stay still, and the wiper of a sliding rheostat uses its own terminal current. A pure `wireFlow` helper and tests cover series, reversed, parallel, voltmeter and potentiometer cases.
- Routing tests cover all presets, a tidied two-row circuit, orthogonality and overlaps. 77 unit / 41 Playwright checks.

## Known limitations

- RC transients support exactly one capacitor.
- Ideal meters are modelled as 1 µΩ / 1 GΩ.
- Reasoning rules cover LDR/thermistor series and parallel, fixed-resistor
  series dividers and supply EMF changes; other topologies show measurements
  with an explicit “no verified explanation” message.
- WeChat release is blocked on a registered appid and an owned HTTPS business
  domain (external credentials, not available in this environment).

## Git

- Branch: `main`
- Remote: `https://github.com/Michaelee125/circuitlab-alevel.git`
- Commit SHA and deployment status are recorded in the final delivery report
  and in the GitHub Actions run.

## Next steps

1. The only manual deployment step: `gh auth refresh -s workflow`, then
   `pnpm deploy:actions`, commit and push — this activates the tracked workflow
   and switches Pages to GitHub Actions. Until then the same build is served
   from `gh-pages`.
2. Phase 2: register the WeChat appid and an owned HTTPS business domain, then
   either ship the `web-view` shell or port the renderer for the native route.
