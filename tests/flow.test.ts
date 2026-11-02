import { describe, expect, it } from 'vitest';
import { solveCircuit } from '@circuitlab/physics-engine';
import { wireFlow } from '../packages/circuit-renderer/src/flow';
import { buildDoc, compId } from './helpers';

describe('wire current direction', () => {
  it('follows the conventional current around a series loop', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 6 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    const feed = doc.wires[0];
    const returnWire = doc.wires[1];
    expect(wireFlow(feed, solution)).toEqual({ current: 2, direction: 1 });
    expect(wireFlow(returnWire, solution)).toEqual({ current: 2, direction: 1 });
  });

  it('flips when the stored wire direction is reversed', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 6 } },
      ],
      [
        [1, 'a', 0, 'pos'],
        [0, 'neg', 1, 'b'],
      ],
    );
    const solution = solveCircuit(doc);
    expect(wireFlow(doc.wires[0], solution)?.direction).toBe(-1);
    expect(wireFlow(doc.wires[1], solution)?.direction).toBe(-1);
  });

  it('uses the branch current where several wires share a terminal', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 6 } },
        { kind: 'resistor', params: { resistance: 12 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [0, 'pos', 2, 'a'],
        [1, 'b', 0, 'neg'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const solution = solveCircuit(doc);
    const feedA = doc.wires.find(
      (wire) => wire.to.componentId === compId(doc, 1),
    );
    const feedB = doc.wires.find(
      (wire) => wire.to.componentId === compId(doc, 2),
    );
    expect(Math.round(wireFlow(feedA!, solution)?.current ?? 0)).toBe(2);
    expect(Math.round(wireFlow(feedB!, solution)?.current ?? 0)).toBe(1);
    expect(wireFlow(feedA!, solution)?.direction).toBe(1);
    expect(wireFlow(feedB!, solution)?.direction).toBe(1);
  });

  it('leaves an ideal voltmeter connection almost still', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'resistor', params: { resistance: 6 } },
        { kind: 'voltmeter' },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
        [1, 'a', 2, 'a'],
        [1, 'b', 2, 'b'],
      ],
    );
    const solution = solveCircuit(doc);
    const meterWire = doc.wires[2];
    expect(wireFlow(meterWire, solution)?.current ?? 0).toBeLessThan(1e-7);
  });

  it('uses the wiper terminal current of a sliding rheostat', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 12 } },
        { kind: 'potentiometer', params: { resistance: 100, wiper: 0.5 } },
        { kind: 'resistor', params: { resistance: 10 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
        [1, 'w', 2, 'a'],
        [2, 'b', 1, 'b'],
      ],
    );
    const solution = solveCircuit(doc);
    const wiper = doc.wires.find(
      (wire) =>
        wire.from.componentId === compId(doc, 1) && wire.from.terminalId === 'w',
    );
    expect(wiper).toBeDefined();
    const flow = wireFlow(wiper!, solution);
    expect(flow).not.toBeNull();
    expect(flow?.current).toBeGreaterThan(0);
    expect(flow?.direction).toBe(1);
    const pot = solution.components[compId(doc, 1)];
    const sum =
      (pot.terminalCurrents?.a ?? 0) +
      (pot.terminalCurrents?.b ?? 0) +
      (pot.terminalCurrents?.w ?? 0);
    expect(Math.abs(sum)).toBeLessThan(1e-9);
  });
});
