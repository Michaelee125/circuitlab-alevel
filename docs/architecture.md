# Architecture

CircuitLab A-Level is a pnpm workspace split into framework-free engines and
thin platform shells. The same `CircuitDocument` flows through every layer.

```
┌──────────────────────────── apps ────────────────────────────┐
│ apps/web (React + Vite + Zustand + PixiJS + ECharts)         │
│ apps/wechat (web-view shell / native renderer on the roadmap)│
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
      ┌─────────▼──────────┐        ┌──────────▼─────────────┐
      │ circuit-renderer   │        │ platform-adapters      │
      │ PixiJS draw + FX   │        │ storage/share/export   │
      └─────────┬──────────┘        └──────────┬─────────────┘
                │                              │
   ┌────────────▼──────────────────────────────▼─────────────┐
   │ teaching-engine → reasoning-engine → physics-engine     │
   │                        circuit-core                     │
   └─────────────────────────────────────────────────────────┘
```

## Hard dependency rules

| Package | May import | Must never import |
| --- | --- | --- |
| `circuit-core` | nothing (pure TS) | React, DOM, PixiJS, physics |
| `physics-engine` | `circuit-core` | React, DOM, PixiJS, reasoning |
| `reasoning-engine` | `circuit-core`, `physics-engine` | React, DOM, PixiJS |
| `teaching-engine` | all engine packages | React, DOM, PixiJS |
| `circuit-renderer` | `circuit-core`, `pixi.js`, `i18n` | React, solver decisions |
| `ui` | React only | engine packages |
| `platform-adapters` | `circuit-core` | React, PixiJS |
| `apps/web` | everything | — |

WeChat-specific code lives only in `platform-adapters` (behind capability
detection) and `apps/wechat`. The physics, reasoning and teaching engines have
no platform branches.

## Data model (`circuit-core`)

`CircuitDocument` contains components (id, kind, world position, rotation,
parameters), wires, and metadata. Terminals are defined by `COMPONENT_DEFS`, so
component art, hit testing, wiring and the solver all agree on geometry.

- **Topology**: wires union their endpoint pins with a disjoint-set structure.
  Only explicit wires create electrical connections, so crossing wires are
  visually distinct from connected wires. Node ids are derived from the
  smallest pin key, which keeps solver output stable across renders.
- **Geometry**: rotation-aware terminal positions, orthogonal wire routing with
  stubs and a below-the-row lane for long return wires, hit testing for
  components, terminals and wires.
- **Validation**: structural problems (dangling wires, duplicate ids, a source
  shorted by wires, overlapping bodies). Electrical diagnostics come from the
  solver so there is one source of truth.

## Solver (`physics-engine`)

1. Build conductive islands from elements that can carry DC. Capacitors,
   open switches and voltmeters do not join islands.
2. Each island gets a reference node (the negative terminal of its first
   source). Islands with no source return zeros but remain valid.
3. Assemble Modified Nodal Analysis equations:
   - resistors/sensors/meters: conductance stamps,
   - cells and batteries: ideal voltage-source branch plus an internal node and
     series resistance when `internalResistance > 0`,
   - lamps and diodes: Newton companion models (conductance + equivalent
     current source) iterated to convergence,
   - an optional 1 V probe source for Thévenin analysis.
4. Solve densely with LU decomposition and partial pivoting. Singular matrices
   become an explicit diagnostic instead of NaN output.
5. Post-process component currents, terminal p.d., power, equivalent
   resistance, and detect shorts, open circuits and multiple islands.

The solver never mutates the document and returns every intermediate diagnostic
with the solution.

## Reasoning (`reasoning-engine`)

```
change parameters → solve before/after → find changed parameter
                  → structural predicates (series / parallel / across source)
                  → rule with explicit preconditions
                  → verify each predicted direction against the numbers
                  → English + Chinese chain, marking points, model answer
```

`analyzeNetwork` deliberately ignores meters: an ammeter is merged into its
node (it is a wire) and a voltmeter is dropped (it is an open circuit). This is
what lets the LDR series case still be recognised when a student has added an
ammeter and a voltmeter, which is exactly the Scenario 2 circuit.

If the rule's structure does not match, or a single predicted direction
disagrees with the solution, the engine returns `supported: false` with a
bilingual reason and still returns the measured before/after quantities. It
never emits a chain it could not verify.

## Teaching (`teaching-engine`)

- 11 experiments, each a pure document factory plus parameter actions.
- Guided questions are derived from the verified chain: the correct option is
  the solved direction, so questions cannot contradict the explanation.
- The internal-resistance dataset is produced by re-solving the circuit for a
  range of rheostat values.

## Rendering (`circuit-renderer`)

A single PixiJS `Application` draws a world container with layers: grid, wires,
components, overlay (selection, terminals, wiring preview), particles, labels.

- **Schematic mode** draws IEC-style symbols with cyan strokes.
- **Realistic mode** draws apparatus: ceramic resistor with colour bands, lamp
  with filament glow scaled by dissipated power, metal-cased cell, instrument
  boxes with live LCD readings, LDR disc with light arrows, capacitor can,
  diode body, switch lever.
- Both modes receive the same document and solution; switching modes only
  changes the draw calls.
- Particles travel along wire polylines; their direction is derived from the
  current entering the component at the terminal, and their speed from the
  current magnitude.
- Quality levels control device-pixel ratio, particle density and frame cap.
- Value chips (V / I / R) are drawn in a screen-space layer above the world, so
  they stay legible at any zoom. Their placement is collision-aware against
  component bounds, designators and other chips, and clamped to the canvas.
- Animated feedback lives in two layers: an additive glow layer for lamp halos
  and a normal FX layer for the breathing selection ring and value-change
  pulses. Lamp intensity is derived from the dissipated power in the solution.
- Hit testing stays in `circuit-core` (not Pixi) so touch and mouse interactions
  are testable without a GPU.

## Web state (`apps/web`)

Zustand stores the document, undo/redo stacks, the "before" snapshot used by the
reasoning engine, selection/wiring state, viewport, preferences and UI panels.
Slider drags update one history entry per edit session and keep the pre-session
document as the reasoning baseline.

Preferences (language, theme, view mode, quality) persist in `localStorage`.
Circuits persist through the `StorageAdapter` (IndexedDB with a localStorage
fallback).

## Performance notes

- The solver runs on every document change; circuits are small (tens of nodes)
  so a dense solve costs well under a millisecond.
- Pixi rebuilds static graphics only when the document or selection changes;
  particles are the only per-frame drawing.
- Charts are lazy-loaded (`import('echarts')`) and only mounted when the graph
  panel is open.

## Extensibility

- New component: add a `ComponentDef`, a draw function for both modes, a model
  in the solver, and (optionally) a reasoning rule.
- New experiment: add an `Experiment` object with a `build()` factory.
- New platform: implement `PlatformAdapters` and reuse every engine package.
