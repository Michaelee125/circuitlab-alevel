import { describe, expect, it } from 'vitest';
import { solveCircuit, ldrIlluminanceForResistance } from '@circuitlab/physics-engine';
import { buildComparison, explainChange } from '@circuitlab/reasoning-engine';
import type { CircuitDocument } from '@circuitlab/circuit-core';
import { buildDoc, compId } from './helpers';

const LDR_PARAMS = { referenceResistance: 100, gamma: 0.7 };

function seriesLdrDoc(ohms: number): CircuitDocument {
  return buildDoc(
    [
      { kind: 'cell', params: { emf: 12, internalResistance: 0 } },
      { kind: 'ldr', params: { ...LDR_PARAMS, illuminance: ldrIlluminanceForResistance(ohms, LDR_PARAMS) } },
      { kind: 'resistor', params: { resistance: 4 } },
    ],
    [
      [0, 'pos', 1, 'a'],
      [1, 'b', 2, 'a'],
      [2, 'b', 0, 'neg'],
    ],
    'LDR series',
  );
}

function parallelLdrDoc(ohms: number): CircuitDocument {
  return buildDoc(
    [
      { kind: 'cell', params: { emf: 12, internalResistance: 0 } },
      { kind: 'ldr', params: { ...LDR_PARAMS, illuminance: ldrIlluminanceForResistance(ohms, LDR_PARAMS) } },
      { kind: 'resistor', params: { resistance: 4 } },
    ],
    [
      [0, 'pos', 1, 'a'],
      [0, 'pos', 2, 'a'],
      [1, 'b', 0, 'neg'],
      [2, 'b', 0, 'neg'],
    ],
    'LDR parallel',
  );
}

/** Apply a parameter change in place (the real app keeps component ids stable). */
function withParam(
  doc: CircuitDocument,
  index: number,
  params: Record<string, unknown>,
): CircuitDocument {
  const targetId = doc.components[index].id;
  return {
    ...doc,
    components: doc.components.map((c) =>
      c.id === targetId ? { ...c, params: { ...c.params, ...params } } : c,
    ),
  };
}

function explainPair(before: CircuitDocument, after: CircuitDocument) {
  const beforeSolution = solveCircuit(before);
  const afterSolution = solveCircuit(after);
  return explainChange({ before, after, beforeSolution, afterSolution });
}

describe('physics reasoning engine', () => {
  it('explains the LDR series case with a verified chain', () => {
    const before = seriesLdrDoc(8);
    const after = withParam(before, 1, {
      illuminance: ldrIlluminanceForResistance(2, LDR_PARAMS),
    });
    const result = explainPair(before, after);

    expect(result.supported).toBe(true);
    expect(result.ruleId).toBe('sensor-series-light');
    expect(result.steps.length).toBeGreaterThanOrEqual(5);

    const text = result.answer.en;
    expect(text).toContain('8.00 Ω');
    expect(text).toContain('2.00 Ω');
    expect(text).toContain('12.00 Ω');
    expect(text).toContain('6.00 Ω');
    expect(text).toContain('1.00 A');
    expect(text).toContain('2.00 A');
    expect(text).toContain('4.00 V');
    expect(text).toContain('8.00 V');
    expect(text.toLowerCase()).toContain('total resistance');

    // the chain must follow light → R_LDR → R_total → I → V_R
    const ids = result.steps.map((s) => s.id);
    expect(ids).toEqual(['cause', 'resistance', 'total-resistance', 'current', 'fixed-pd', 'sensor-pd']);

    expect(result.markingPoints.length).toBeGreaterThanOrEqual(4);
    expect(result.markingPoints[0].en.toLowerCase()).toContain('light intensity');
    expect(result.markingScheme).toBe('software-authored');
  });

  it('produces a different, correct parallel explanation', () => {
    const before = parallelLdrDoc(8);
    const after = withParam(before, 1, {
      illuminance: ldrIlluminanceForResistance(2, LDR_PARAMS),
    });
    const result = explainPair(before, after);

    expect(result.supported).toBe(true);
    expect(result.ruleId).toBe('sensor-parallel-light');

    const text = result.answer.en;
    expect(text).toContain('stays at 12.00 V');
    expect(text).toContain('1.50 A');
    expect(text).toContain('6.00 A');
    expect(text).toContain('3.00 A');
    expect(text).toContain('4.50 A');
    expect(text).toContain('9.00 A');
    // the fixed resistor's p.d. must not be claimed to increase
    expect(text).not.toMatch(/p\.d\. across R\d+ increases/i);

    const fixedId = compId(after, 2);
    const fixedVoltage = result.changes[`V:${fixedId}`];
    expect(fixedVoltage.direction).toBe('unchanged');
    expect(fixedVoltage.before).toBeCloseTo(12, 6);

    // series reasoning must not be reused here
    expect(result.steps.some((s) => s.id === 'total-resistance')).toBe(false);
  });

  it('keeps Chinese and English explanations physically identical', () => {
    const before = seriesLdrDoc(8);
    const after = withParam(before, 1, {
      illuminance: ldrIlluminanceForResistance(2, LDR_PARAMS),
    });
    const result = explainPair(before, after);
    expect(result.steps.every((s) => s.en.length > 0 && s.zh.length > 0)).toBe(true);
    expect(result.steps.length).toBe(
      result.steps.filter((s) => s.zh.length > 0).length,
    );
    const answerZh = result.answer.zh;
    expect(answerZh).toContain('8.00 Ω');
    expect(answerZh).toContain('2.00 Ω');
    expect(answerZh).toContain('12.00 V');
    expect(answerZh).toContain('1.00 A');
    expect(answerZh).toContain('2.00 A');
    expect(answerZh).toContain('电动势');
    expect(result.markingPoints.every((p) => p.zh.length > 0)).toBe(true);
  });

  it('explains an NTC thermistor in series as it warms', () => {
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
    const before = make(25);
    const after = withParam(before, 1, { temperatureC: 100 });
    const result = explainPair(before, after);
    expect(result.supported).toBe(true);
    expect(result.ruleId).toBe('sensor-series-temperature');
    expect(result.cause?.en.toLowerCase()).toContain('temperature');
    expect(result.cause?.zh).toContain('温度');
  });

  it('explains a fixed resistor change in a series circuit', () => {
    const make = (r1: number) =>
      buildDoc(
        [
          { kind: 'cell', params: { emf: 12 } },
          { kind: 'resistor', params: { resistance: r1 } },
          { kind: 'resistor', params: { resistance: 4 } },
        ],
        [
          [0, 'pos', 1, 'a'],
          [1, 'b', 2, 'a'],
          [2, 'b', 0, 'neg'],
        ],
      );
    const before = make(4);
    const after = withParam(before, 1, { resistance: 8 });
    const result = explainPair(before, after);
    expect(result.supported).toBe(true);
    expect(result.ruleId).toBe('resistor-series-divider');
    expect(result.answer.en).toContain('total resistance rises');
    expect(result.answer.en).toContain('current decreases');
  });

  it('explains a supply EMF change', () => {
    const make = (emf: number) =>
      buildDoc(
        [
          { kind: 'cell', params: { emf } },
          { kind: 'resistor', params: { resistance: 2 } },
          { kind: 'resistor', params: { resistance: 4 } },
        ],
        [
          [0, 'pos', 1, 'a'],
          [1, 'b', 2, 'a'],
          [2, 'b', 0, 'neg'],
        ],
      );
    const before = make(6);
    const after = withParam(before, 0, { emf: 12 });
    const result = explainPair(before, after);
    expect(result.supported).toBe(true);
    expect(result.ruleId).toBe('source-emf-series');
    expect(result.answer.en).toContain('current increases');
  });

  it('refuses to invent an explanation when no rule applies', () => {
    const make = (ohms: number) =>
      buildDoc(
        [
          { kind: 'cell', params: { emf: 12 } },
          {
            kind: 'ldr',
            params: { ...LDR_PARAMS, illuminance: ldrIlluminanceForResistance(ohms, LDR_PARAMS) },
          },
          { kind: 'resistor', params: { resistance: 4 } },
          { kind: 'resistor', params: { resistance: 8 } },
        ],
        [
          [0, 'pos', 1, 'a'],
          [1, 'b', 2, 'a'],
          [2, 'b', 3, 'a'],
          [3, 'b', 0, 'neg'],
        ],
      );
    const before = make(8);
    const after = withParam(before, 1, {
      illuminance: ldrIlluminanceForResistance(2, LDR_PARAMS),
    });
    const result = explainPair(before, after);
    expect(result.supported).toBe(false);
    expect(result.steps).toHaveLength(0);
    expect(result.reason?.en.length).toBeGreaterThan(0);
    expect(result.reason?.zh.length).toBeGreaterThan(0);
    // measured values are still reported, but no causal claim is made
    expect(Object.keys(result.changes).length).toBeGreaterThan(0);
  });

  it('refuses to explain a structural change', () => {
    const before = seriesLdrDoc(8);
    const after = withParam(before, 1, {
      illuminance: ldrIlluminanceForResistance(2, LDR_PARAMS),
    });
    const changed: CircuitDocument = {
      ...after,
      wires: after.wires.slice(0, 2),
    };
    const result = explainPair(before, changed);
    expect(result.supported).toBe(false);
    expect(result.reason?.en.toLowerCase()).toContain('connections');
  });

  it('does not explain anything when no parameter changed', () => {
    const before = seriesLdrDoc(8);
    const result = explainPair(before, before);
    expect(result.supported).toBe(false);
    expect(result.reason?.en.toLowerCase()).toContain('no physical change');
  });

  it('builds compare rows with directions for R, I, V and P', () => {
    const before = seriesLdrDoc(8);
    const after = withParam(before, 1, {
      illuminance: ldrIlluminanceForResistance(2, LDR_PARAMS),
    });
    const rows = buildComparison(before, after, solveCircuit(before), solveCircuit(after));
    const fixedId = compId(after, 2);
    const voltage = rows.find((r) => r.componentId === fixedId && r.quantity === 'voltage');
    const current = rows.find((r) => r.componentId === fixedId && r.quantity === 'current');
    const resistance = rows.find((r) => r.componentId === fixedId && r.quantity === 'resistance');
    expect(voltage?.direction).toBe('increase');
    expect(voltage?.before).toBeCloseTo(4, 6);
    expect(voltage?.after).toBeCloseTo(8, 6);
    expect(current?.direction).toBe('increase');
    expect(resistance?.direction).toBe('unchanged');
  });
});
