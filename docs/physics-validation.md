# Physics validation

This document records the model, the assumptions and the numbers the automated
tests assert. Tests live in `tests/physics.test.ts`, `tests/transient.test.ts`,
`tests/reasoning.test.ts` and `tests/teaching.test.ts`.

## Modified Nodal Analysis

Unknowns are node voltages (excluding the reference node) plus one current per
ideal voltage source (including the internal EMF of each cell).

For a conductance `g` between nodes `a` and `b`:

```
G[a][a] += g   G[b][b] += g   G[a][b] -= g   G[b][a] -= g
```

For a current source `I₀` flowing from `a` to `b`:

```
i[a] -= I₀   i[b] += I₀
```

For an ideal source `E` with positive node `p` and negative node `n` and branch
current `j`:

```
A[p][j] += 1   A[n][j] -= 1
A[j][p] += 1   A[j][n] -= 1
rhs[j]  = E
```

`j` is positive when current flows from `p` to `n` **inside** the source. A
source delivering power therefore has a negative `j`, and the delivered current
is `−j`. The cell writes its terminal p.d. as `V(pos) − V(neg)`.

### Units and scale

All SI (V, A, Ω, F, W, s). Numbers are checked with `toBeCloseTo(…, 3)` or
`toHaveAttribute` tolerances; no test deletes or relaxes assertions to pass.

## Component models

| Component | Model | Notes |
| --- | --- | --- |
| resistor, variable resistor | `I = V/R` | `R ∈ [0.01, 10⁹] Ω` |
| LDR | `R = R_ref (10 lx / E)^γ`, defaults `R_ref=100 Ω`, `γ=0.7` | light ↑ ⇒ R ↓ |
| NTC thermistor | `R = R₂₅ exp(B(1/T − 1/T₂₅))`, `R₂₅=1 kΩ`, `B=3500 K` | temperature ↑ ⇒ R ↓ |
| filament lamp | `I(V) = V / (R₀(1 + k|V|))` | smooth, odd, strictly increasing, always dissipative |
| diode | Shockley `I = I_s(e^{V/(nV_T)} − 1)`, `I_s=1 nA`, `n=1.8`, `V_T=25.852 mV` | exponent clamped, damped Newton |
| cell/battery | ideal EMF + series `r` via an internal node | terminal p.d. `E − Ir` |
| switch | closed `1 µΩ`, open ⇒ no stamp | open switch splits conductive islands |
| ammeter | ideal-ish `1 µΩ` | series |
| voltmeter | ideal-ish `1 GΩ` | parallel |
| capacitor | open at DC | transient handled separately |

**Ideal meter note.** A literal 0 Ω ammeter or ∞ Ω voltmeter makes the MNA
matrix singular or ill-conditioned. `1 µΩ` and `1 GΩ` are used instead; the
error is below one part in 10⁶ for teaching circuits and the UI rounds
accordingly. This is stated here and in the UI inspector.

## Non-linear iteration

Each non-linear element is replaced by a Norton companion
`I ≈ g(V₀)V + [I(V₀) − g(V₀)V₀]` at the current operating point.
The matrix is reassembled and solved until the node-voltage change is below
`1e-10 V` (max 80 iterations). Diodes limit each Newton step to ±0.12 V to keep
the exponential stable. Non-convergence is reported as a warning; the result is
never silently presented as exact.

## Transients

Only one capacitor is supported (explicit error otherwise). The rest of the
circuit is reduced to a Thévenin equivalent at the capacitor terminals:

- `V∞`: solve the DC circuit with the capacitor open and read the open-circuit
  p.d. across its terminals.
- `R_th`: set every EMF to 0 V, insert a 1 V probe source across the capacitor
  terminals, solve, and take `R_th = 1 / |I_probe|`.

Then

```
τ = R_th C
Vc(t) = V∞ + (V₀ − V∞) e^(−t/τ)
i(t)  = (V∞ − Vc(t)) / R_th
```

Directly across an ideal source (`R_th < 100 µΩ`) returns an explicit error
rather than an infinite current.

## Diagnostics

| Condition | Result |
| --- | --- |
| No components | `empty` |
| No source | `no-source`, all currents zero |
| Source island has no closed path | `open-circuit`, all currents zero |
| Wire-only short across a source | validation error |
| Huge current (> 200 A) | `short-circuit`, no results presented as valid |
| Two ideal sources in parallel with different EMFs | `singular` |
| Unconnected terminal | component marked invalid + warning |
| Separate networks | each solved; `multiple-islands` warning |
| Non-convergent Newton | warning + approximate flag |

Node voltages are referenced to the first source's negative terminal in the main
island. Floating (source-less) islands are referenced locally and reported.

## Asserted values

All values are produced by the solver, not hard-coded into the UI.

| Case | Circuit | Expected |
| --- | --- | --- |
| Series | 12 V, 4 Ω + 8 Ω | `I=1.000 A`, `R_total=12.00 Ω`, p.d. 4 V / 8 V |
| Parallel | 12 V, 4 Ω ‖ 8 Ω | branch 3.000 A / 1.500 A, total 4.500 A, `R_eq=2.667 Ω` |
| Mixed | 12 V, 2 Ω + (4 Ω ‖ 4 Ω) | `I=3.000 A`, 6.000 V across each 4 Ω |
| Ohm's law | 6 V, 12 Ω | 0.500 A, 3.00 W |
| Potential divider | 12 V, 4 Ω + 8 Ω | 4.000 V / 8.000 V |
| Internal resistance | 6 V, r=0.50 Ω, 2.5 Ω | `I=2.000 A`, terminal 5.000 V, lost volts 1.000 V |
| LDR series 8 Ω→2 Ω | 12 V, LDR + 4 Ω | `R_total 12→6 Ω`, `I 1→2 A`, `V_R 4→8 V`, `V_LDR 8→4 V` |
| LDR parallel 8 Ω→2 Ω | 12 V, LDR ‖ 4 Ω | `I_LDR 1.5→6 A`, `I_R=3 A` unchanged, `V_R=12 V` unchanged, total `4.5→9 A` |
| Thermistor 25→100 °C | 12 V, NTC + 1 kΩ | R falls ≈1000→94 Ω, p.d. across NTC falls |
| Open circuit | source + one-wire resistor | status `open-circuit`, `I=0` |
| Short circuit | source + ideal ammeter | status `short-circuit`, no fake values |
| RC charging | 12 V, 10 kΩ, 470 µF | `τ=4.70 s`, `V(τ)=7.58 V`, `I(0)=1.20 mA` |
| RC discharging | 10 kΩ, 470 µF, V₀=6 V | `V(τ)=2.21 V` |
| Thévenin | 12 V, 4 Ω + 8 Ω, C across 8 Ω | `V∞=8 V`, `R_th=2.667 Ω`, `τ=2.667 ms` |
| Lamp | 6 V across 2 Ω cold, k=0.5 | `I = 6/(2(1+3)) = 0.750 A` |
| Diode forward | 6 V, 100 Ω + diode | `0.01 A < I < 0.1 A`, `0.5 V < V_d` |
| Diode reverse | reversed source | `|I| < 1 µA` |
| Two sources in parallel | 6 V ‖ 9 V | status `singular` |

## Limitations (explicit)

- No AC, phasors, inductance or mutual inductance.
- One capacitor per transient; multiple capacitors return an unsupported error.
- The lamp model is a teaching model of a tungsten filament, not a datasheet
  curve.
- Diode parameters are generic; no thermal runaway or breakdown.
- `R_th` probing assumes linear elements around the operating point.
- Internal-resistance reasoning is deliberately disabled for circuits with
  non-zero source resistance; the numbers remain available.
- Exam marking is keyword-based practice marking, in English only.
