import { describe, expect, it } from 'vitest';
import { componentBounds, getWireRoutes, isOrthogonalRoute, manualWireRoute, moveComponent, moveWireSegment, pathsOverlap, parseCircuitJSON, serializeCircuit, wirePath, wirePolyline, wireSegmentsForEditing } from '@circuitlab/circuit-core';
import { EXPERIMENTS } from '@circuitlab/teaching-engine';
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

  it('keeps every preset orthogonal and free of overlapping wires', () => {
    for (const experiment of EXPERIMENTS) {
      const doc = experiment.build!();
      const routes = getWireRoutes(doc);
      for (const wire of doc.wires) {
        const points = routes[wire.id];
        expect(points.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1];
          const b = points[i];
          expect(a.x === b.x || a.y === b.y).toBe(true);
        }
      }
      for (let i = 0; i < doc.wires.length; i += 1) {
        for (let j = i + 1; j < doc.wires.length; j += 1) {
          expect(
            pathsOverlap(routes[doc.wires[i].id], routes[doc.wires[j].id]),
            `${experiment.id}: wires ${i} and ${j} overlap`,
          ).toBe(false);
        }
      }
      // and they must not run through any other component's body
      for (const wire of doc.wires) {
        const points = routes[wire.id];
        for (const comp of doc.components) {
          if (comp.id === wire.from.componentId || comp.id === wire.to.componentId) continue;
          const b = componentBounds(comp);
          const box = { x: b.x + 2, y: b.y + 2, width: b.width - 4, height: b.height - 4 };
          for (let i = 1; i < points.length; i += 1) {
            const a = points[i - 1];
            const p = points[i];
            const horizontal = Math.abs(a.y - p.y) < 0.5;
            const crosses = horizontal
              ? a.y > box.y &&
                a.y < box.y + box.height &&
                Math.max(a.x, p.x) > box.x &&
                Math.min(a.x, p.x) < box.x + box.width
              : a.x > box.x &&
                a.x < box.x + box.width &&
                Math.max(a.y, p.y) > box.y &&
                Math.min(a.y, p.y) < box.y + box.height;
            expect(crosses, `${experiment.id}: wire ${wire.id} crosses ${comp.id}`).toBe(false);
          }
        }
      }
    }
  });

  it('detours around a component that blocks the direct path', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', x: 0, y: 0 },
        { kind: 'resistor', x: 600, y: 0 },
        { kind: 'resistor', x: 300, y: 0 },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const routes = getWireRoutes(doc);
    const blocker = doc.components[2];
    const b = componentBounds(blocker);
    const box = { x: b.x + 2, y: b.y + 2, width: b.width - 4, height: b.height - 4 };
    for (const wire of doc.wires) {
      const points = routes[wire.id];
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const p = points[i];
        const horizontal = Math.abs(a.y - p.y) < 0.5;
        const crosses = horizontal
          ? a.y > box.y &&
            a.y < box.y + box.height &&
            Math.max(a.x, p.x) > box.x &&
            Math.min(a.x, p.x) < box.x + box.width
          : a.x > box.x &&
            a.x < box.x + box.width &&
            Math.max(a.y, p.y) > box.y &&
            Math.min(a.y, p.y) < box.y + box.height;
        expect(crosses).toBe(false);
      }
    }
  });

  it('reroutes dragged layouts into parallel lanes without overlap', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', params: { emf: 6 }, x: 140, y: 260 },
        { kind: 'resistor', params: { resistance: 10 }, x: 380, y: 260 },
        { kind: 'resistor', params: { resistance: 20 }, x: 620, y: 260 },
        { kind: 'ammeter', x: 860, y: 260 },
        { kind: 'voltmeter', x: 620, y: 420 },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 2, 'a'],
        [2, 'b', 3, 'a'],
        [3, 'b', 0, 'neg'],
        [2, 'a', 4, 'a'],
        [2, 'b', 4, 'b'],
      ],
    );
    const dragged = moveComponent(doc, doc.components[2].id, 380, 420);
    const routes = getWireRoutes(dragged);
    const list = dragged.wires.map((w) => routes[w.id]);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        expect(pathsOverlap(list[i], list[j]), `wires ${i} and ${j} overlap after drag`).toBe(false);
      }
    }
    // the two voltmeter leads become coincident straight lines after the drag,
    // so one must be pushed into a parallel lane with terminal jogs.
    const leadA = routes[dragged.wires[4].id];
    const leadB = routes[dragged.wires[5].id];
    const maxY = Math.max(...[...leadA, ...leadB].map((p) => p.y));
    expect(maxY).toBeGreaterThan(420);
  });

  it('honours a valid manual route and ignores stale or diagonal ones', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', x: 0, y: 0 },
        { kind: 'resistor', x: 200, y: 0 },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const wire = doc.wires[0];
    const auto = wirePolyline(doc, wire);
    const moved = moveWireSegment(auto, 0, { x: 0, y: 40 });
    expect(moved).not.toBeNull();
    expect(isOrthogonalRoute(moved!)).toBe(true);
    expect(moved![0]).toEqual(auto[0]);
    expect(moved![moved!.length - 1]).toEqual(auto[auto.length - 1]);
    const withRoute = { ...doc, wires: doc.wires.map((w) => (w.id === wire.id ? { ...w, route: moved! } : w)) };
    const routeWire = withRoute.wires.find((w) => w.id === wire.id)!;
    expect(wirePolyline(withRoute, routeWire)).toEqual(moved);
    expect(manualWireRoute(withRoute, routeWire)).toEqual(moved);

    // The manual route survives a JSON round-trip.
    const parsed = parseCircuitJSON(serializeCircuit(withRoute));
    expect(parsed.ok).toBe(true);
    expect(parsed.doc?.wires.find((w) => w.id === wire.id)?.route).toEqual(moved);

    // A diagonal route is rejected and the automatic route is used.
    const diagonal = [auto[0], { x: auto[0].x + 40, y: auto[0].y + 40 }, auto[auto.length - 1]];
    const bad = { ...withRoute, wires: withRoute.wires.map((w) => (w.id === wire.id ? { ...w, route: diagonal } : w)) };
    const badWire = bad.wires.find((w) => w.id === wire.id)!;
    expect(manualWireRoute(bad, badWire)).toBeNull();
    const autoDoc = { ...bad, wires: bad.wires.map((w) => ({ id: w.id, from: w.from, to: w.to })) };
    expect(wirePolyline(bad, badWire)).toEqual(wirePolyline(autoDoc, autoDoc.wires.find((w) => w.id === wire.id)!));

    // Moving the component invalidates the stored route (terminals moved).
    const dragged = moveComponent(withRoute, withRoute.components[1].id, 220, 60);
    expect(manualWireRoute(dragged, dragged.wires.find((w) => w.id === wire.id)!)).toBeNull();
  });

  it('exposes movable segments for wire editing', () => {
    const doc = buildDoc(
      [
        { kind: 'cell', x: 0, y: 0 },
        { kind: 'resistor', x: 200, y: 0 },
      ],
      [
        [0, 'pos', 1, 'a'],
        [1, 'b', 0, 'neg'],
      ],
    );
    const wire = doc.wires[0];
    const straight = wireSegmentsForEditing(doc, wire);
    expect(straight.some((segment) => segment.movable)).toBe(true);
    const auto = wirePolyline(doc, wire);
    const jogged = moveWireSegment(auto, 0, { x: 0, y: 30 })!;
    const withRoute = { ...doc, wires: doc.wires.map((w) => (w.id === wire.id ? { ...w, route: jogged } : w)) };
    const segments = wireSegmentsForEditing(withRoute, wire);
    expect(segments.length).toBeGreaterThan(2);
    expect(segments[0].movable).toBe(false);
    expect(segments[segments.length - 1].movable).toBe(false);
    expect(segments.some((segment) => segment.movable)).toBe(true);
  });

  it('gives parallel corridors different lanes when they would coincide', () => {
    // Two components sit on the same spot, so their wires to the third
    // component share a corridor. The router must not draw them on top of
    // each other.
    const doc = buildDoc(
      [
        { kind: 'resistor', x: 0, y: 0 },
        { kind: 'resistor', x: 0, y: 0 },
        { kind: 'resistor', x: 200, y: 0 },
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
