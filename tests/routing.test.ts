import { describe, expect, it } from 'vitest';
import { getWireRoutes, pathsOverlap, wirePath, wirePolyline } from '@circuitlab/circuit-core';
import { buildDoc } from './helpers';

describe('wire routing', () => {
  const horizontal = wirePath({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 400, y: 0 }, { x: -1, y: 0 });
  const offset = wirePath({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 400, y: 0 }, { x: -1, y: 0 }, 22, 24);

  it('keeps routes orthogonal and starts/ends at the terminals', () => {
    expect(horizontal[0]).toEqual({ x: 0, y: 0 });
    expect(horizontal[horizontal.length - 1]).toEqual({ x: 400, y: 0 });
    for (let i = 0; i < horizontal.length - 1; i += 1) {
      const a = horizontal[i];
      const b = horizontal[i + 1];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it('moves the routed lane by the requested offset', () => {
    const laneY = Math.max(...horizontal.map((p) => p.y));
    const shiftedY = Math.max(...offset.map((p) => p.y));
    expect(shiftedY - laneY).toBeCloseTo(24, 6);
  });

  it('detects corridors that overlap and separates offset lanes', () => {
    expect(pathsOverlap(horizontal, horizontal)).toBe(true);
    expect(pathsOverlap(horizontal, offset)).toBe(false);
    const corridorA = [{ x: 0, y: 0 }, { x: 120, y: 0 }];
    const corridorB = [{ x: 0, y: 4 }, { x: 120, y: 4 }];
    const farB = [{ x: 0, y: 40 }, { x: 120, y: 40 }];
    expect(pathsOverlap(corridorA, corridorB)).toBe(true);
    expect(pathsOverlap(corridorA, farB)).toBe(false);
  });

  it('routes every wire and caches the result per document', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 } },
        { kind: 'resistor', params: { resistance: 10 } },
        { kind: 'resistor', params: { resistance: 20 } },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 0, 'neg'],
      ],
    );
    const routes = getWireRoutes(doc);
    expect(Object.keys(routes).sort()).toEqual(doc.wires.map((w) => w.id).sort());
    for (const wire of doc.wires) {
      expect(routes[wire.id]).toEqual(wirePolyline(doc, wire));
      expect(routes[wire.id].length).toBeGreaterThanOrEqual(2);
    }
    // the WeakMap cache returns the same object for the same immutable document
    expect(getWireRoutes(doc)).toBe(routes);
  });

  it('gives parallel corridors different lanes when they would coincide', () => {
    // Two components sit on the same spot, so their wires to the third
    // component share a corridor. The router must not draw them on top of
    // each other.
    const doc = buildDoc(
      [
        { kind: 'resistor', x: 0, y: 0 },
        { kind: 'resistor', x: 0, y: 0 },
        { kind: 'resistor', x: 400, y: 0 },
      ],
      [
        [0, 'a', 2, 'a'],
        [1, 'a', 2, 'a'],
      ],
    );
    const routes = getWireRoutes(doc);
    const [w1, w2] = doc.wires;
    expect(routes[w1.id]).not.toEqual(routes[w2.id]);
  });
});
