import { describe, expect, it } from 'vitest';
import { solveCircuit } from '@circuitlab/physics-engine';
import { ldrIlluminanceForResistance, lampCurrent } from '@circuitlab/physics-engine';
import { parseCircuitJSON, serializeCircuit } from '@circuitlab/circuit-core';
import { buildDoc, compId, SERIES_LDR } from './helpers';

const near = (actual: number, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);

describe('DC circuit solver', () => {
  it('computes series resistance, current and p.d.', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12, internalResistance: 0 } },
        { kind: 'resistor', params: { resistance: 4 } },
        { kind: 'resistor', params: { resistance: 8 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    expect(solution.ok).toBe(true);
    expect(solution.status).toBe('ok');
    near(solution.totalResistance ?? 0, 12);
    near(solution.components[compId(doc, 0)].currentMagnitude, 1);
    near(solution.components[compId(doc, 1)].voltageMagnitude, 4);
    near(solution.components[compId(doc, 2)].voltageMagnitude, 8);
  });

  it('computes parallel resistance and branch currents', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 4 } },
        { kind: 'resistor', params: { resistance: 8 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [0, 'pos', 2, 'a'],
        [1, 'b', 0, 'neg'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    near(solution.components[compId(doc, 1)].currentMagnitude, 3);
    near(solution.components[compId(doc, 2)].currentMagnitude, 1.5);
    near(solution.components[compId(doc, 0)].currentMagnitude, 4.5);
    near(solution.totalResistance ?? 0, 12 / 4.5);
    near(solution.components[compId(doc, 1)].voltageMagnitude, 12);
  });

  it('solves a mixed series/parallel network', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 2 } },
        { kind: 'resistor', params: { resistance: 4 } },
        { kind: 'resistor', params: { resistance: 4 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [1, 'b', 3, 'a'],
        [2, 'b', 0, 'neg'],
        [3, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    near(solution.components[compId(doc, 0)].currentMagnitude, 3);
    near(solution.components[compId(doc, 1)].voltageMagnitude, 6);
    near(solution.components[compId(doc, 2)].voltageMagnitude, 6);
    near(solution.components[compId(doc, 3)].currentMagnitude, 1.5);
    // KCL: current through R1 equals the sum of the parallel branch currents
    near(
      solution.components[compId(doc, 1)].currentMagnitude,
      solution.components[compId(doc, 2)].currentMagnitude +
        solution.components[compId(doc, 3)].currentMagnitude,
    );
  });

  it('obeys Ohm’s law', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'resistor', params: { resistance: 12 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    near(solution.components[compId(doc, 1)].currentMagnitude, 0.5);
    near(solution.components[compId(doc, 1)].voltageMagnitude, 6);
    near(solution.components[compId(doc, 1)].power, 3);
  });

  it('computes a potential divider', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 4 } },
        { kind: 'resistor', params: { resistance: 8 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    near(solution.components[compId(doc, 1)].voltageMagnitude, 4);
    near(solution.components[compId(doc, 2)].voltageMagnitude, 8);
    near(solution.components[compId(doc, 2)].power, 8);
  });

  it('handles internal resistance and terminal voltage', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6, internalResistance: 0.5 } },
        { kind: 'resistor', params: { resistance: 2.5 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    const cell = solution.components[compId(doc, 0)];
    const resistor = solution.components[compId(doc, 1)];
    near(resistor.currentMagnitude, 2);
    near(cell.terminalVoltage ?? 0, 5);
    near(cell.internalPower ?? 0, 2);
    near(solution.totalResistance ?? 0, 2.5);
  });

  it('detects an open circuit', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 9 } },
        { kind: 'resistor', params: { resistance: 10 } },
      ],
      [[0, 'pos', 1, 'a']],
    );
    const solution = solveCircuit(doc);
    expect(solution.status).toBe('open-circuit');
    expect(solution.components[compId(doc, 0)].currentMagnitude).toBeLessThan(1e-9);
    expect(solution.components[compId(doc, 1)].valid).toBe(false);
  });

  it('detects a short circuit through an ideal ammeter', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'ammeter' },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    expect(solution.status).toBe('short-circuit');
    expect(solution.ok).toBe(false);
    expect(solution.errors[0].code).toBe('short-circuit');
  });

  it('reports contradictory ideal sources as a singular system', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'cell', params: { emf: 9 } },
      ],
      [
        [0, 'pos', 1, 'pos'],
        [0, 'neg', 1, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    expect(solution.status).toBe('singular');
    expect(solution.ok).toBe(false);
  });

  it('treats an open switch as an open circuit', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'switch', params: { closed: false } },
        { kind: 'resistor', params: { resistance: 10 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    expect(solution.status).toBe('open-circuit');
    near(solution.components[compId(doc, 2)].currentMagnitude, 0);
  });

  it('uses ideal-ish meter models', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 10 } },
        { kind: 'ammeter' },
        { kind: 'voltmeter' },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
        [0, 'pos', 3, 'a'],
        [3, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    near(solution.components[compId(doc, 2)].currentMagnitude, 1.2, 3);
    near(solution.components[compId(doc, 3)].voltageMagnitude, 12, 4);
    expect(solution.components[compId(doc, 3)].currentMagnitude).toBeLessThan(1e-6);
  });

  it('solves a circuit with a lamp using a non-linear model', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'lamp', params: { coldResistance: 2, thermalCoefficient: 0.5 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    const lamp = solution.components[compId(doc, 1)];
    near(lamp.currentMagnitude, lampCurrent(2, 0.5, 6));
    // Non-ohmic: effective resistance is larger than the cold resistance.
    expect(lamp.resistance ?? 0).toBeGreaterThan(2);
  });

  it('rectifies with a diode model', () => {
    const forward = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'resistor', params: { resistance: 100 } },
        { kind: 'diode' },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const f = solveCircuit(forward);
    expect(f.ok).toBe(true);
    const fc = f.components[compId(forward, 2)];
    expect(fc.current).toBeGreaterThan(0.01);
    expect(fc.voltage).toBeGreaterThan(0.5);

    const reverse = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'resistor', params: { resistance: 100 } },
        { kind: 'diode' },
      ],
      [
        [0, 'neg', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'pos'],
      ],
    );
    const r = solveCircuit(reverse);
    expect(Math.abs(r.components[compId(reverse, 2)].current)).toBeLessThan(1e-6);
  });

  it('solves separate networks independently', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'resistor', params: { resistance: 6 } },
        { kind: 'cell', params: { emf: 3 } },
        { kind: 'resistor', params: { resistance: 3 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
        [2, 'pos', 3, 'a'],
        [3, 'b', 2, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    near(solution.components[compId(doc, 1)].currentMagnitude, 1);
    near(solution.components[compId(doc, 3)].currentMagnitude, 1);
    expect(solution.warnings.some((w) => w.code === 'multiple-islands')).toBe(true);
  });

  it('does not mutate the document', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 4 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const snapshot = JSON.stringify(doc);
    solveCircuit(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe('LDR and thermistor models', () => {
  it('solves the LDR series experiment before and after the light change', () => {
    const before = buildDoc(SERIES_LDR(8).specs, SERIES_LDR(8).links);
    const after = buildDoc(SERIES_LDR(2).specs, SERIES_LDR(2).links);

    const s1 = solveCircuit(before);
    const s2 = solveCircuit(after);

    near(s1.totalResistance ?? 0, 12);
    near(s2.totalResistance ?? 0, 6);
    near(s1.components[compId(before, 2)].currentMagnitude, 1);
    near(s2.components[compId(after, 2)].currentMagnitude, 2);
    near(s1.components[compId(before, 2)].voltageMagnitude, 4);
    near(s2.components[compId(after, 2)].voltageMagnitude, 8);
    near(s1.components[compId(before, 1)].voltageMagnitude, 8);
    near(s2.components[compId(after, 1)].voltageMagnitude, 4);
  });

  it('solves the LDR parallel experiment before and after the light change', () => {
    const make = (resistance: number) =>
      buildDoc(
        [
          { kind: 'cell', params: { emf: 12 } },
          {
            kind: 'ldr',
            params: { illuminance: ldrIlluminanceForResistance(resistance, { referenceResistance: 100, gamma: 0.7 }) },
          },
          { kind: 'resistor', params: { resistance: 4 } },
        ],
        [
          [0, 'pos', 1, 'a'],
          [0, 'pos', 2, 'a'],
          [1, 'b', 0, 'neg'],
          [2, 'b', 0, 'neg'],
        ],
      );
    const doc1 = make(8);
    const doc2 = make(2);
    const s1 = solveCircuit(doc1);
    const s2 = solveCircuit(doc2);

    near(s1.components[compId(doc1, 1)].currentMagnitude, 1.5);
    near(s2.components[compId(doc2, 1)].currentMagnitude, 6);
    near(s1.components[compId(doc1, 2)].currentMagnitude, 3);
    near(s2.components[compId(doc2, 2)].currentMagnitude, 3);
    near(s1.components[compId(doc1, 2)].voltageMagnitude, 12);
    near(s2.components[compId(doc2, 2)].voltageMagnitude, 12);
    near(s1.components[compId(doc1, 0)].currentMagnitude, 4.5);
    near(s2.components[compId(doc2, 0)].currentMagnitude, 9);
  });

  it('models an NTC thermistor: resistance and p.d. fall as it warms', () => {
    const make = (temperatureC: number) =>
      buildDoc(
        [
          { kind: 'cell', params: { emf: 12 } },
          { kind: 'thermistor', params: { temperatureC, referenceResistance: 1000, beta: 3500 } },
          { kind: 'resistor', params: { resistance: 1000 } },
        ],
        [
          [0, 'pos', 1, 'a'],
          [1, 'b', 2, 'a'],
          [2, 'b', 0, 'neg'],
        ],
      );
    const cold = make(25);
    const warm = make(100);
    const sCold = solveCircuit(cold);
    const sWarm = solveCircuit(warm);
    const rCold = sCold.components[compId(cold, 1)].resistance ?? 0;
    const rWarm = sWarm.components[compId(warm, 1)].resistance ?? 0;
    expect(rWarm).toBeLessThan(rCold);
    expect(sWarm.components[compId(warm, 1)].currentMagnitude).toBeGreaterThan(
      sCold.components[compId(cold, 1)].currentMagnitude,
    );
    expect(sWarm.components[compId(warm, 1)].voltageMagnitude).toBeLessThan(
      sCold.components[compId(cold, 1)].voltageMagnitude,
    );
  });
});


describe('three-terminal sliding rheostat', () => {
  const divider = (wiper: number) =>
    buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'potentiometer', params: { resistance: 100, wiper } },
        { kind: 'voltmeter' },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
        [1, 'w', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
      'Potential divider',
    );

  it('divides the supply p.d. in proportion to the wiper position', () => {
    const doc = divider(0.25);
    const solution = solveCircuit(doc);
    expect(solution.ok).toBe(true);
    const rp = solution.components[compId(doc, 1)];
    const voltmeter = solution.components[compId(doc, 2)];
    expect(rp.extra?.wiperFraction).toBeCloseTo(0.25, 6);
    expect(rp.extra?.resistanceAW).toBeCloseTo(75, 6);
    expect(rp.extra?.resistanceWB).toBeCloseTo(25, 6);
    expect(rp.extra?.wiperVoltage).toBeCloseTo(3, 2);
    expect(voltmeter.voltageMagnitude).toBeCloseTo(3, 2);
    expect(rp.currentMagnitude).toBeCloseTo(0.12, 4);
  });

  it('uses only the A–W section in a two-terminal connection', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'potentiometer', params: { resistance: 100, wiper: 0.25 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'w', 0, 'neg'],
      ],
      'Two-wire rheostat',
    );
    const solution = solveCircuit(doc);
    const rp = solution.components[compId(doc, 1)];
    expect(rp.extra?.resistanceAW).toBeCloseTo(75, 6);
    expect(rp.currentMagnitude).toBeCloseTo(12 / 75, 4);
    expect(rp.voltageMagnitude).toBeCloseTo(12, 4);
  });

  it('uses the whole track when the wiper is left unconnected', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'potentiometer', params: { resistance: 100, wiper: 0.25 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
      'Track only',
    );
    const solution = solveCircuit(doc);
    const rp = solution.components[compId(doc, 1)];
    expect(rp.currentMagnitude).toBeCloseTo(0.12, 4);
    expect(rp.voltageMagnitude).toBeCloseTo(12, 4);
    expect(rp.resistance).toBeCloseTo(100, 6);
  });

  it('round-trips both track resistance and wiper through JSON', () => {
    const doc = divider(0.25);
    const parsed = parseCircuitJSON(serializeCircuit(doc));
    expect(parsed.ok).toBe(true);
    const rp = parsed.doc?.components.find((comp) => comp.kind === 'potentiometer');
    expect(rp?.params.resistance).toBe(100);
    expect(rp?.params.wiper).toBe(0.25);
  });
});
