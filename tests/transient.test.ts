import { describe, expect, it } from 'vitest';
import { solveCircuit, solveRCTransient, sweepCharacteristic } from '@circuitlab/physics-engine';
import { buildDoc, compId } from './helpers';

describe('RC transient solver', () => {
  it('charges a capacitor through a resistor analytically', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 10000 } },
        { kind: 'capacitor', params: { capacitance: 470e-6 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const t = solveRCTransient(doc, { initialVoltage: 0 });
    expect(t.ok).toBe(true);
    expect(t.mode).toBe('charging');
    expect(t.timeConstant).toBeCloseTo(4.7, 6);
    expect(t.equivalentResistance).toBeCloseTo(10000, 3);
    expect(t.finalVoltage).toBeCloseTo(12, 6);
    expect(t.points[0].voltage).toBeCloseTo(0, 9);
    expect(t.points[0].current).toBeCloseTo(12 / 10000, 9);
    const atTau = t.points.find((p) => Math.abs(p.t - t.timeConstant) < 0.05);
    expect(atTau).toBeDefined();
    expect(atTau?.voltage).toBeCloseTo(12 * (1 - Math.exp(-1)), 2);
    expect(t.points[t.points.length - 1].voltage).toBeGreaterThan(11.9);
    expect(t.points[t.points.length - 1].voltage).toBeLessThanOrEqual(12);
  });

  it('discharges a capacitor through a resistor', () => {
    const doc = buildDoc(
      [
        { kind: 'resistor', params: { resistance: 10000 } },
        { kind: 'capacitor', params: { capacitance: 470e-6 } },
      ],
      [
        [0, 'a', 1, 'a'],
        [0, 'b', 1, 'b'],
      ],
    );
    const t = solveRCTransient(doc, { initialVoltage: 6 });
    expect(t.ok).toBe(true);
    expect(t.mode).toBe('discharging');
    expect(t.timeConstant).toBeCloseTo(4.7, 6);
    expect(t.finalVoltage).toBeCloseTo(0, 6);
    const atTau = t.points.find((p) => Math.abs(p.t - t.timeConstant) < 0.05);
    expect(atTau?.voltage).toBeCloseTo(6 * Math.exp(-1), 3);
    expect(t.points[t.points.length - 1].voltage).toBeLessThan(0.1);
  });

  it('uses the Thévenin resistance seen by the capacitor', () => {
    // Potential divider: 4 Ω and 8 Ω in series, capacitor across the 8 Ω.
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 4 } },
        { kind: 'resistor', params: { resistance: 8 } },
        { kind: 'capacitor', params: { capacitance: 0.001 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
        [2, 'a', 3, 'a'],
        [3, 'b', 2, 'b'],
      ],
    );
    const t = solveRCTransient(doc);
    expect(t.ok).toBe(true);
    expect(t.finalVoltage).toBeCloseTo(8, 6);
    // 8 Ω in parallel with 4 Ω = 2.6667 Ω
    expect(t.equivalentResistance).toBeCloseTo((8 * 4) / 12, 4);
    expect(t.timeConstant).toBeCloseTo(((8 * 4) / 12) * 0.001, 8);
  });

  it('rejects a capacitor directly across an ideal source', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'capacitor', params: { capacitance: 470e-6 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const t = solveRCTransient(doc);
    expect(t.ok).toBe(false);
    expect(t.warnings.length).toBeGreaterThan(0);
  });
});

describe('characteristic sweep', () => {
  it('produces a linear I–V characteristic for a resistor', () => {
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
    const sweep = sweepCharacteristic(doc, { from: 0, to: 6, steps: 6 });
    expect(sweep.ok).toBe(true);
    expect(sweep.points.length).toBe(7);
    for (const point of sweep.points) {
      expect(point.current).toBeCloseTo(point.voltage / 12, 6);
    }
  });

  it('produces a non-linear characteristic for a diode', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 1 } },
        { kind: 'resistor', params: { resistance: 100 } },
        { kind: 'diode' },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const sweep = sweepCharacteristic(doc, { from: 0, to: 1.2, steps: 24, componentId: doc.components[2].id });
    expect(sweep.ok).toBe(true);
    const currents = sweep.points.map((p) => p.current);
    for (let i = 1; i < currents.length; i += 1) {
      expect(currents[i]).toBeGreaterThanOrEqual(currents[i - 1] - 1e-12);
    }
    const high = sweep.points[sweep.points.length - 1];
    expect(high.current).toBeGreaterThan(1e-3);
  });

  it('reports a solved short circuit rather than fake data', () => {
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
    const sweep = sweepCharacteristic(doc, { from: 0, to: 3, steps: 3, componentId: compId(doc, 1) });
    expect(sweep.ok).toBe(false);
    expect(sweep.warnings.length).toBeGreaterThan(0);
    expect(solveCircuit(doc).status).toBe('short-circuit');
  });
});
