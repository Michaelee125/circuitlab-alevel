import { getComponentDef } from './defs';
import type {
  CircuitDocument,
  ComponentInstance,
  Point,
  Rotation,
  TerminalDef,
  Wire,
} from './types';

export const GRID = 20;

export function snap(value: number, grid = GRID): number {
  return Math.round(value / grid) * grid;
}

export function snapPoint(p: Point, grid = GRID): Point {
  return { x: snap(p.x, grid), y: snap(p.y, grid) };
}

const ROTATION_COS: Record<Rotation, number> = {
  0: 1,
  90: 0,
  180: -1,
  270: 0,
};
const ROTATION_SIN: Record<Rotation, number> = {
  0: 0,
  90: 1,
  180: 0,
  270: -1,
};

/** Rotate a local vector clockwise (screen coordinates, y down). */
export function rotateVector(p: Point, rotation: Rotation): Point {
  const c = ROTATION_COS[rotation] ?? 1;
  const s = ROTATION_SIN[rotation] ?? 0;
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function rotatePointAround(p: Point, origin: Point, rotation: Rotation): Point {
  const v = rotateVector({ x: p.x - origin.x, y: p.y - origin.y }, rotation);
  return { x: origin.x + v.x, y: origin.y + v.y };
}

/** World position of a terminal. */
export function terminalWorld(comp: ComponentInstance, terminal: TerminalDef): Point {
  const v = rotateVector({ x: terminal.x, y: terminal.y }, comp.rotation);
  return { x: comp.x + v.x, y: comp.y + v.y };
}

export function getTerminalDef(comp: ComponentInstance, terminalId: string): TerminalDef | undefined {
  return getComponentDef(comp.kind).terminals.find((t) => t.id === terminalId);
}

/** All terminals of a component in world coordinates. */
export function componentTerminals(comp: ComponentInstance): (TerminalDef & Point)[] {
  return getComponentDef(comp.kind).terminals.map((t) => ({
    ...t,
    ...terminalWorld(comp, t),
  }));
}

/** Outward direction a wire should leave a terminal with. */
export function terminalNormal(comp: ComponentInstance, terminalId: string): Point {
  const def = getTerminalDef(comp, terminalId);
  if (!def) return { x: 1, y: 0 };
  const local = { x: def.x > 0 ? 1 : -1, y: 0 };
  return rotateVector(local, comp.rotation);
}

function dedupeCollinear(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinearX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
    const collinearY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
    if (collinearX || collinearY) out.splice(i, 1);
  }
  return out;
}

/**
 * Orthogonal route between two terminals. The route leaves each terminal
 * perpendicular to its component body so wires never overlap the symbol.
 * `lane` offsets the middle segment so near-identical wires can be separated.
 */
export function wirePath(
  from: Point,
  fromNormal: Point,
  to: Point,
  toNormal: Point,
  stub = 22,
  lane = 0,
): Point[] {
  const a1 = { x: from.x + fromNormal.x * stub, y: from.y + fromNormal.y * stub };
  const b1 = { x: to.x + toNormal.x * stub, y: to.y + toNormal.y * stub };
  const fromHorizontal = Math.abs(fromNormal.x) >= Math.abs(fromNormal.y);
  const toHorizontal = Math.abs(toNormal.x) >= Math.abs(toNormal.y);
  // Long connections between two horizontal terminals are routed below the
  // component row so the wire does not run through the symbols between them.
  if (
    fromHorizontal &&
    toHorizontal &&
    Math.abs(from.x - to.x) > 280 &&
    Math.abs(from.y - to.y) < 48
  ) {
    const laneY = Math.max(from.y, to.y) + 220 + lane;
    // Shift both drops with the lane so two parallel return wires are fully
    // separated, not just their horizontal runs.
    const dropA = a1.x + lane;
    const dropB = b1.x + lane;
    return dedupeCollinear([
      from,
      a1,
      { x: dropA, y: a1.y },
      { x: dropA, y: laneY },
      { x: dropB, y: laneY },
      { x: dropB, y: b1.y },
      b1,
      to,
    ]);
  }
  const pts: Point[] = [from, a1];
  if (fromHorizontal && toHorizontal) {
    const midX = (a1.x + b1.x) / 2 + lane;
    pts.push({ x: midX, y: a1.y }, { x: midX, y: b1.y });
  } else if (!fromHorizontal && !toHorizontal) {
    const midY = (a1.y + b1.y) / 2 + lane;
    pts.push({ x: a1.x, y: midY }, { x: b1.x, y: midY });
  } else if (fromHorizontal) {
    pts.push({ x: b1.x, y: a1.y });
  } else {
    pts.push({ x: a1.x, y: b1.y });
  }
  pts.push(b1, to);
  return dedupeCollinear(pts);
}

export function wireEndpoints(
  doc: CircuitDocument,
  wire: Wire,
): { from: Point; to: Point } | null {
  const a = doc.components.find((c) => c.id === wire.from.componentId);
  const b = doc.components.find((c) => c.id === wire.to.componentId);
  if (!a || !b) return null;
  const ta = getTerminalDef(a, wire.from.terminalId);
  const tb = getTerminalDef(b, wire.to.terminalId);
  if (!ta || !tb) return null;
  return { from: terminalWorld(a, ta), to: terminalWorld(b, tb) };
}

function baseWirePolyline(doc: CircuitDocument, wire: Wire, lane: number): Point[] {
  const a = doc.components.find((c) => c.id === wire.from.componentId);
  const b = doc.components.find((c) => c.id === wire.to.componentId);
  if (!a || !b) return [];
  const ta = getTerminalDef(a, wire.from.terminalId);
  const tb = getTerminalDef(b, wire.to.terminalId);
  if (!ta || !tb) return [];
  return wirePath(
    terminalWorld(a, ta),
    terminalNormal(a, ta.id),
    terminalWorld(b, tb),
    terminalNormal(b, tb.id),
    22,
    lane,
  );
}

interface AxisSegment {
  horizontal: boolean;
  fixed: number;
  start: number;
  end: number;
  a: Point;
  b: Point;
}

function axisSegments(points: Point[]): AxisSegment[] {
  const segments: AxisSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5) {
      segments.push({
        horizontal: true,
        fixed: a.y,
        start: Math.min(a.x, b.x),
        end: Math.max(a.x, b.x),
        a,
        b,
      });
    } else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5) {
      segments.push({
        horizontal: false,
        fixed: a.x,
        start: Math.min(a.y, b.y),
        end: Math.max(a.y, b.y),
        a,
        b,
      });
    }
  }
  return segments;
}

/**
 * True when two routes run along the same corridor for a visible distance.
 * For multi-segment routes the terminal leads are ignored: wires leaving the
 * same terminal may share the short stub, but the routed body must be
 * separated. Straight two-point wires are compared in full.
 */
export function pathsOverlap(a: Point[], b: Point[], tolerance = 7): boolean {
  const core = (segments: AxisSegment[]) =>
    segments.length > 2 ? segments.slice(1, -1) : segments;
  const segmentsA = core(axisSegments(a));
  const segmentsB = core(axisSegments(b));
  for (const sa of segmentsA) {
    for (const sb of segmentsB) {
      if (sa.horizontal !== sb.horizontal) continue;
      if (Math.abs(sa.fixed - sb.fixed) > tolerance) continue;
      const overlap = Math.min(sa.end, sb.end) - Math.max(sa.start, sb.start);
      if (overlap > 14) return true;
    }
  }
  return false;
}

interface RouteCacheEntry {
  signature: string;
  routes: Record<string, Point[]>;
}

const routeCache = new WeakMap<CircuitDocument, RouteCacheEntry>();

/** Positions plus terminal bindings; catches in-place document mutation. */
function docSignature(doc: CircuitDocument): string {
  let signature = '';
  for (const comp of doc.components) {
    signature += `${comp.id}:${comp.x},${comp.y},${comp.rotation};`;
  }
  for (const wire of doc.wires) {
    signature += `${wire.id}:${wire.from.componentId}.${wire.from.terminalId}>${wire.to.componentId}.${wire.to.terminalId};`;
  }
  return signature;
}

function segmentHitsBox(a: Point, b: Point, box: Rect, pad = 0): boolean {
  const x1 = box.x - pad;
  const x2 = box.x + box.width + pad;
  const y1 = box.y - pad;
  const y2 = box.y + box.height + pad;
  if (Math.abs(a.y - b.y) < 0.5) {
    return a.y > y1 && a.y < y2 && Math.max(a.x, b.x) > x1 && Math.min(a.x, b.x) < x2;
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    return a.x > x1 && a.x < x2 && Math.max(a.y, b.y) > y1 && Math.min(a.y, b.y) < y2;
  }
  return false;
}

/**
 * A straight wire cannot be separated by shifting its middle (there is no
 * middle). Give it a parallel lane with short jogs at each terminal instead.
 */
function offsetStraightRoute(route: Point[], lane: number): Point[] {
  if (route.length < 2 || lane === 0) return route;
  const from = route[0];
  const to = route[route.length - 1];
  const horizontal = Math.abs(from.y - to.y) < 0.5 && Math.abs(from.x - to.x) > 0.5;
  const vertical = Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) > 0.5;
  if (!horizontal && !vertical) return route;
  const stub = 22;
  if (horizontal) {
    const dir = Math.sign(to.x - from.x) || 1;
    const a = { x: from.x + dir * stub, y: from.y };
    const b = { x: to.x - dir * stub, y: to.y };
    return [
      from,
      a,
      { x: a.x, y: a.y + lane },
      { x: b.x, y: b.y + lane },
      b,
      to,
    ];
  }
  const dir = Math.sign(to.y - from.y) || 1;
  const a = { x: from.x, y: from.y + dir * stub };
  const b = { x: to.x, y: to.y - dir * stub };
  return [from, a, { x: a.x + lane, y: a.y }, { x: b.x + lane, y: b.y }, b, to];
}

/**
 * Route every wire once, choosing the cleanest corridor among several lanes.
 *
 * A candidate is scored on (1) how many existing wires it would overlap,
 * (2) how many other component bodies it would cross, and (3) how much extra
 * detour it introduces. This keeps wires separated and out of components even
 * after components are dragged to new positions.
 */
export function getWireRoutes(doc: CircuitDocument): Record<string, Point[]> {
  const signature = docSignature(doc);
  const cached = routeCache.get(doc);
  if (cached && cached.signature === signature) return cached.routes;

  const routes: Record<string, Point[]> = {};
  const placed: Point[][] = [];
  const lanes = [0, 22, -22, 44, -44, 66, -66, 88, -88];

  for (const wire of doc.wires) {
    const obstacles: Rect[] = [];
    for (const comp of doc.components) {
      if (comp.id === wire.from.componentId || comp.id === wire.to.componentId) continue;
      const b = componentBounds(comp);
      obstacles.push({ x: b.x + 8, y: b.y + 8, width: Math.max(0, b.width - 16), height: Math.max(0, b.height - 16) });
    }

    let best: Point[] = [];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const lane of lanes) {
      const base = baseWirePolyline(doc, wire, 0);
      const candidate =
        lane !== 0 && base.length > 0 && base.length <= 3
          ? offsetStraightRoute(base, lane)
          : baseWirePolyline(doc, wire, lane);
      if (candidate.length === 0) continue;
      const segments = axisSegments(candidate);
      const core = segments.length > 2 ? segments.slice(1, -1) : segments;
      let score = Math.abs(lane) * 0.15 + Math.max(0, candidate.length - 2) * 0.4;
      for (const other of placed) {
        if (pathsOverlap(candidate, other)) score += 120;
      }
      for (const segment of core) {
        for (const box of obstacles) {
          if (segmentHitsBox(segment.a, segment.b, box)) score += 14;
        }
      }
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
      // A clean, straight route cannot be improved by further detours.
      if (bestScore === 0) break;
    }
    if (best.length === 0) best = baseWirePolyline(doc, wire, 0);
    routes[wire.id] = best;
    if (best.length > 0) placed.push(best);
  }

  routeCache.set(doc, { signature, routes });
  return routes;
}

/** Full polyline for a wire, including the routing stubs and lane offsets. */
export function wirePolyline(doc: CircuitDocument, wire: Wire): Point[] {
  return getWireRoutes(doc)[wire.id] ?? [];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function componentBounds(comp: ComponentInstance): Rect {
  const def = getComponentDef(comp.kind);
  const half = comp.rotation === 90 || comp.rotation === 270
    ? { w: def.height / 2, h: def.width / 2 }
    : { w: def.width / 2, h: def.height / 2 };
  return {
    x: comp.x - half.w,
    y: comp.y - half.h,
    width: half.w * 2,
    height: half.h * 2,
  };
}

export function documentBounds(doc: CircuitDocument): Rect {
  if (doc.components.length === 0) return { x: -200, y: -150, width: 400, height: 300 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const comp of doc.components) {
    for (const t of componentTerminals(comp)) {
      minX = Math.min(minX, t.x);
      maxX = Math.max(maxX, t.x);
      minY = Math.min(minY, t.y);
      maxY = Math.max(maxY, t.y);
    }
    const b = componentBounds(comp);
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + b.width);
    minY = Math.min(minY, b.y);
    maxY = Math.max(maxY, b.y + b.height);
  }
  for (const wire of doc.wires) {
    for (const point of wirePolyline(doc, wire)) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  const pad = 36;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

/** Hit test a component body; returns the topmost match. */
export function componentAt(doc: CircuitDocument, p: Point, tolerance = 6): ComponentInstance | null {
  for (let i = doc.components.length - 1; i >= 0; i -= 1) {
    const comp = doc.components[i];
    // inverse-rotate the point into the component's local frame
    const local = rotateVector({ x: p.x - comp.x, y: p.y - comp.y }, (360 - comp.rotation) % 360 as Rotation);
    const def = getComponentDef(comp.kind);
    if (
      Math.abs(local.x) <= def.width / 2 + tolerance &&
      Math.abs(local.y) <= def.height / 2 + tolerance
    ) {
      return comp;
    }
  }
  return null;
}

export interface TerminalHit {
  componentId: string;
  terminalId: string;
  point: Point;
}

export function terminalAt(doc: CircuitDocument, p: Point, radius = 18): TerminalHit | null {
  let best: TerminalHit | null = null;
  let bestDist = radius;
  for (const comp of doc.components) {
    for (const t of componentTerminals(comp)) {
      const d = distance(p, t);
      if (d <= bestDist) {
        bestDist = d;
        best = { componentId: comp.id, terminalId: t.id, point: { x: t.x, y: t.y } };
      }
    }
  }
  return best;
}

export function wireAt(doc: CircuitDocument, p: Point, tolerance = 10): Wire | null {
  for (let i = doc.wires.length - 1; i >= 0; i -= 1) {
    const poly = wirePolyline(doc, doc.wires[i]);
    for (let j = 0; j < poly.length - 1; j += 1) {
      if (distanceToSegment(p, poly[j], poly[j + 1]) <= tolerance) return doc.wires[i];
    }
  }
  return null;
}
