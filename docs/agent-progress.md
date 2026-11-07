# Agent progress

Last updated: 2026-11-07 (Phase 1 build + review fixes)

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

- Unit/physics/reasoning/teaching/routing/flow/experiments tests: **97 passed**
- Desktop e2e: **23 passed** (`desktop-chromium`, includes the smoke test)
- Mobile e2e: iPhone 13 **7 passed**, Pixel 7 **7 passed**, iPad **7 passed**
- Total Playwright: **44 passed**, 72 intentionally skipped
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

## Full QA pass (sixteenth review)

Ran the typecheck, the production build, all 77 unit tests and the full 42-check Playwright matrix, then an exploratory pass over desktop and mobile. Found and fixed:

- The experiment panel still said "Ten runnable experiments" although 11 ship; the text now derives from `EXPERIMENTS.length`.
- At 1024 px the floating toolbar wraps to two rows, but the desktop fit still used the full canvas height, so a large circuit could sit under the toolbar. The toolbar geometry is now measured on desktop as well and fed into the fit and value-card bounds.
- At 320 px the action strip (auto-arrange/fit) was clipped off the right edge. The toolbar now wraps to a second row below 380 px, and the controls stay inside the viewport.
- At 320 px the empty-state card overlapped the wrapped toolbar and the tab bar. Short phones get a compact empty card with safe top/bottom padding.
- In bilingual mode the long toolbar labels forced the action strip past the screen edge (`flex-wrap: nowrap`). The toolbar now wraps whenever needed; the language select label is "EN/中" instead of a truncated "EN + 中".
- At 1024 px the palette header's "Experiment library" text overlapped the COMPONENTS title. The action collapses to an icon button (with aria-label/title) at ≤1180 px, and the header can wrap.

Exploratory coverage: all 11 experiments auto-arranged; all 13 component kinds added, inspected and deleted; 320/360/375/390/768/900/1024/1280/1920 viewports; light/dark; EN/ZH/bilingual; export JSON, valid import, invalid-JSON toast, share fallback, save/load; short circuit, open switch and two-supply circuits; rotate/undo; sliding-rheostat divider; 320 px experiment/graph/properties/saved/help modals and sheets; console audit (only headless WebGL driver performance warnings).

Result after fixes: **77 unit / 42 Playwright checks**, no page errors, no horizontal overflow at any tested width.

## Theory and preset audit (seventeenth review)

Read every experiment definition, instruction, action, chart and reasoning rule, then exercised the theory numerically against the solver and in the UI.

Factual errors found and fixed:

- **Lamp I–V sweep had no negative half.** The sweep goes from −6 V to +6 V, but the solver clipped the source EMF to ≥ 0, so every negative point was 0 V / 0 A and the plotted characteristic was flat on the left. Negative EMF is now allowed (the UI still limits a user-set cell to ≥ 0); the chart shows the true odd non-ohmic curve, and a test checks the negative/positive symmetry and the rising filament resistance.
- **Internal-resistance explanation omitted r from the "total resistance".** The general rule used the external equivalent (2.50 Ω) and called it total while the current values used 3.00 Ω. The total-resistance step/quantity now adds the source internal resistance and says so explicitly (3.00 → 1.00 Ω = external 2.50 → 0.500 Ω + internal 0.500 Ω), including in the guided question.
- **Falling EMF was described as "because the EMF is larger".** The cause text is now direction-aware ("smaller" / "larger").
- **Rules that assume an ideal source are now guarded.** The source-EMF series rule (and the already-guarded resistor/sensor rules) fall back to the general rule when the source has internal resistance, so they no longer claim that the external p.d.s sum to the EMF or that the total resistance is the external value. A test covers an EMF change and an LDR change with r = 0.5 Ω.
- **UI label.** `Total resistance` is now **External resistance** (外电路电阻) because the value is `V_terminal / I`; the reasoning/Compare total remains the circuit total including r.
- **Parallel instruction.** The voltmeter is across R1, so the instruction now says to watch R1's p.d. stay at the supply value (and notes R2 also has 6 V) instead of telling the student to observe R2 with a meter that is not across it.

Preset verification: added `tests/experiments.test.ts` (13 tests) covering every preset's status, component count, initial readings, actions, inverse sensor actions, charts, RC time constants and guided questions, plus two internal-resistance reasoning tests. Unit suite: **92 / 92**. All 11 experiments load in the UI, the internal-resistance explanation shows 3.00 → 1.00 Ω, the lamp chart spans −6 V to +6 V, and the full Playwright matrix remains **42 / 42**.

## Transparent Liquid Glass controls (eighteenth review)

The mobile screenshot showed the light-theme top controls, toolbar and tab dock as flat white cards. The light theme had drifted to near-opaque fills (72 % white on the toolbar, a 94 %/68 % white gradient on the dock) and a 24–46 px blur that averaged the light grid into a solid colour. First pass reduced the fill to 12–16 % + a cool tint with a 2–4 px blur; after the follow-up ("透明度不够，背景改成全透明") the fill was removed entirely.

- Every control surface — top-bar mode/language/actions, canvas toolbar strips, segmented containers, bottom tab dock, toast, canvas hint and zoom pill — now has **`background: transparent`** (computed `rgba(0, 0, 0, 0)`), no gradient and no tint.
- The light theme additionally sets **`backdrop-filter: none`** so the canvas grid and drawing are not hazed; a 0.5 px border, a specular top edge and a soft shadow are the only surfaces. The dark theme keeps a 6 px blur for its smoked glass, still with a transparent fill.
- Active states use a transparent fill plus an accent ring (segmented/values), an accent top bar (active dock tab) and accent text, so selection is still visible without a solid background.
- Verified in a 3× crop: the grid lines run continuously through the dock and toolbar. No layout or hit-area changes; 92 unit / 42 Playwright checks remain green.

## Parallel wiring ladder (nineteenth review)

The two parallel presets were electrically correct but drawn as a perimeter ring: source on the left, one branch above and one below, and the return wires looping right around the whole circuit. Students could not see which terminals were shared nodes.

- Both presets are now a **shared-rail ladder**. The source (and the main-branch ammeter in the resistor parallel) sits on the bottom rail; two vertical rails carry the two nodes up to the branches; the branches sit between them:
  - Parallel resistors: R1 at the top, V1 in the middle and R2 at the bottom, each between the same rails; A1 in the main branch.
  - LDR parallel: LDR + A1 form the top branch; R1 is below it; V1 sits below R1; all three branches share the rails.
- The rails are built from explicit short wires chained through the branch terminals, so each junction is a real terminal node rather than a crossing. The branch components (including the narrower meters) connect with short jogs; all routes start and end exactly on their terminals.
- The desktop fit now also measures the floating bottom hint/zoom row, so the source and A1 labels are no longer clipped by the canvas edge.
- Tests: ladder positions and shared links for both presets, route anchors for all 11 presets, all routes free of component cuts. 94 unit / 42 Playwright checks remain green; screenshots updated.

## Clear all and the Explain easter egg (twentieth review)

- **One-click clear**: a trash-with-spark button in the top bar (desktop group and the phone action pill) calls a new `clearAll` store action. It empties components/wires, resets the experiment id, recorded points, view and panels, then shows "Circuit cleared". The old document is pushed onto the history stack, so the toolbar Undo (or ⌘Z) restores the whole circuit. The button is disabled on an empty canvas.
- **Explain easter egg**: a small pure tracker records Explain clicks. Eight clicks within 3 000 ms open a glass dialog with the exact text "Thank you for using circuitlab!". Close/X, Escape and backdrop dismiss it. The tracker is unit-tested for the 8-in-3 s window, the spread-out negative case and the reset after firing; a desktop e2e clicks the Explain tab eight times and asserts the dialog.
- Both the desktop rail tab and the phone bottom tab feed the counter; on the phone the Explain sheet title is also a counter target, because the first tab tap opens the sheet over the tab bar.
- Counts: **97 unit / 44 Playwright** checks green; screenshots added.

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
