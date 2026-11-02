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
  const vertical = Math.abs(def.y) > Math.abs(def.x);
  const local = vertical
    ? { x: 0, y: def.y >= 0 ? 1 : -1 }
    : { x: def.x >= 0 ? 1 : -1, y: 0 };
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
    if (wire.route) {
      signature += `r:${wire.route.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';')};`;
    }
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

function segmentCrossesBox(a: Point, b: Point, box: Rect): boolean {
  if (Math.abs(a.y - b.y) < 0.5) {
    return (
      a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width
    );
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    return (
      a.x > box.x &&
      a.x < box.x + box.width &&
      Math.max(a.y, b.y) > box.y &&
      Math.min(a.y, b.y) < box.y + box.height
    );
  }
  return false;
}

function segmentsOverlap(a: Point, b: Point, c: Point, d: Point, tolerance = 6): boolean {
  const aH = Math.abs(a.y - b.y) < 0.5;
  const cH = Math.abs(c.y - d.y) < 0.5;
  if (aH !== cH) return false;
  if (aH) {
    if (Math.abs(a.y - c.y) > tolerance) return false;
    return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) + 6;
  }
  if (Math.abs(a.x - c.x) > tolerance) return false;
  return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) + 6;
}

/**
 * Route a wire on a visibility graph of component edges so it goes around
 * component bodies instead of through them. Returns null when no clean path
 * exists (e.g. overlapping components); callers then keep the direct route.
 */
function routeAroundComponents(
  doc: CircuitDocument,
  wire: Wire,
  from: Point,
  fromNormal: Point,
  to: Point,
  toNormal: Point,
  placed: Point[][],
): Point[] | null {
  const aComp = doc.components.find((c) => c.id === wire.from.componentId);
  const bComp = doc.components.find((c) => c.id === wire.to.componentId);
  if (!aComp || !bComp) return null;
  const stub = 22;
  const start = { x: from.x + fromNormal.x * stub, y: from.y + fromNormal.y * stub };
  const end = { x: to.x + toNormal.x * stub, y: to.y + toNormal.y * stub };
  const boxes: Rect[] = [];
  for (const comp of doc.components) {
    const b = componentBounds(comp);
    const pad = comp.id === wire.from.componentId || comp.id === wire.to.componentId ? 2 : 8;
    boxes.push({ x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 });
  }
  const inside = (p: Point) =>
    boxes.some((b) => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height);
  if (inside(start) || inside(end)) return null;

  const xsSet = new Set<number>([start.x, end.x]);
  const ysSet = new Set<number>([start.y, end.y]);
  for (const b of boxes) {
    xsSet.add(b.x);
    xsSet.add(b.x + b.width);
    ysSet.add(b.y);
    ysSet.add(b.y + b.height);
  }
  const xs = [...xsSet].sort((a, b) => a - b);
  const ys = [...ysSet].sort((a, b) => a - b);
  const nx = xs.length;
  const ny = ys.length;
  const nodeIndex = (ix: number, iy: number) => ix * ny + iy;
  const pointAt = (ix: number, iy: number): Point => ({ x: xs[ix], y: ys[iy] });
  const blocked = (ix: number, iy: number) => inside(pointAt(ix, iy));
  const startIx = xs.indexOf(start.x);
  const startIy = ys.indexOf(start.y);
  const endIx = xs.indexOf(end.x);
  const endIy = ys.indexOf(end.y);
  if (startIx < 0 || startIy < 0 || endIx < 0 || endIy < 0) return null;
  const clear = (a: Point, b: Point) => boxes.every((box) => !segmentCrossesBox(a, b, box));
  const wirePenalty = (a: Point, b: Point): number => {
    let penalty = 0;
    for (const route of placed) {
      for (let i = 0; i < route.length - 1; i += 1) {
        if (segmentsOverlap(a, b, route[i], route[i + 1])) penalty += 60;
      }
    }
    return penalty;
  };

  const N = nx * ny;
  const dist = new Float64Array(N * 3).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(N * 3).fill(-1);
  const seen = new Uint8Array(N * 3);
  const heap: { c: number; s: number }[] = [];
  const push = (c: number, s: number) => {
    heap.push({ c, s });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].c <= heap[i].c) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop() as { c: number; s: number };
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < heap.length && heap[l].c < heap[best].c) best = l;
        if (r < heap.length && heap[r].c < heap[best].c) best = r;
        if (best === i) break;
        [heap[i], heap[best]] = [heap[best], heap[i]];
        i = best;
      }
    }
    return top;
  };
  const heuristic = (ix: number, iy: number) => Math.abs(xs[ix] - end.x) + Math.abs(ys[iy] - end.y);
  const goalNode = nodeIndex(endIx, endIy);
  const startState = nodeIndex(startIx, startIy) * 3;
  dist[startState] = 0;
  push(heuristic(startIx, startIy), startState);
  const dirs = [
    { dx: 1, dy: 0, kind: 1 },
    { dx: -1, dy: 0, kind: 1 },
    { dx: 0, dy: 1, kind: 2 },
    { dx: 0, dy: -1, kind: 2 },
  ];

  while (heap.length > 0) {
    const { s } = pop();
    if (seen[s]) continue;
    seen[s] = 1;
    const node = Math.floor(s / 3);
    const dir = s % 3;
    const ix = Math.floor(node / ny);
    const iy = node % ny;
    if (node === goalNode) break;
    for (const move of dirs) {
      const jx = ix + move.dx;
      const jy = iy + move.dy;
      if (jx < 0 || jx >= nx || jy < 0 || jy >= ny) continue;
      if (blocked(jx, jy)) continue;
      const a = pointAt(ix, iy);
      const b = pointAt(jx, jy);
      if (!clear(a, b)) continue;
      const turn = dir !== 0 && dir !== move.kind ? 6 : 0;
      const nd = dist[s] + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + turn + wirePenalty(a, b);
      const ns = nodeIndex(jx, jy) * 3 + move.kind;
      if (nd < dist[ns]) {
        dist[ns] = nd;
        prev[ns] = s;
        push(nd + heuristic(jx, jy), ns);
      }
    }
  }

  let best = Number.POSITIVE_INFINITY;
  let bestState = -1;
  for (let dir = 1; dir <= 2; dir += 1) {
    const state = goalNode * 3 + dir;
    if (dist[state] < best) {
      best = dist[state];
      bestState = state;
    }
  }
  if (bestState < 0 || !Number.isFinite(best)) return null;
  const path: Point[] = [];
  let state = bestState;
  while (state >= 0) {
    const node = Math.floor(state / 3);
    path.push(pointAt(Math.floor(node / ny), node % ny));
    state = prev[state];
  }
  path.reverse();
  return dedupeCollinear([from, ...path, to]);
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

// ---------------------------------------------------------------------------
// Clean auto-routing: every wire can leave a terminal along its normal or
// tangentially along the component edge. Candidates are scored by length,
// bends, crossings and overlap, and any candidate that cuts through a
// component body is rejected. This keeps dragged multi-row circuits tidy
// without forcing long loops around the terminal pins.
// ---------------------------------------------------------------------------

interface PortPoint {
  point: Point;
  normal: boolean;
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

function pathBends(points: Point[]): number {
  return Math.max(0, axisSegments(points).length - 1);
}

function pathCrossings(a: Point[], b: Point[]): number {
  const segsA = axisSegments(a);
  const segsB = axisSegments(b);
  let count = 0;
  for (const sa of segsA) {
    for (const sb of segsB) {
      if (sa.horizontal === sb.horizontal) continue;
      const h = sa.horizontal ? sa : sb;
      const v = sa.horizontal ? sb : sa;
      if (
        v.fixed > Math.min(h.a.x, h.b.x) + 6 &&
        v.fixed < Math.max(h.a.x, h.b.x) - 6 &&
        h.fixed > Math.min(v.a.y, v.b.y) + 6 &&
        h.fixed < Math.max(v.a.y, v.b.y) - 6
      ) {
        count += 1;
      }
    }
  }
  return count;
}

function terminalPorts(comp: ComponentInstance, terminal: TerminalDef): PortPoint[] {
  const p = terminalWorld(comp, terminal);
  const n = terminalNormal(comp, terminal.id);
  const horizontal = Math.abs(n.x) >= Math.abs(n.y);
  const dirs = horizontal
    ? [
        { x: Math.sign(n.x) || 1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]
    : [
        { x: 0, y: Math.sign(n.y) || 1 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
      ];
  return dirs.map((dir) => ({
    point: { x: p.x + dir.x * 18, y: p.y + dir.y * 18 },
    normal: dir.x === n.x && dir.y === n.y,
  }));
}

function connectPorts(a: Point, b: Point): Point[][] {
  const out: Point[][] = [];
  const push = (pts: Point[]) => {
    const deduped = dedupeCollinear(pts);
    if (deduped.length >= 2) out.push(deduped);
  };
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) push([a, b]);
  push([a, { x: b.x, y: a.y }, b]);
  push([a, { x: a.x, y: b.y }, b]);
  const xs = new Set([
    (a.x + b.x) / 2,
    Math.min(a.x, b.x) - 40,
    Math.max(a.x, b.x) + 40,
    a.x,
    b.x,
  ]);
  for (const x of xs) push([a, { x, y: a.y }, { x, y: b.y }, b]);
  const ys = new Set([
    (a.y + b.y) / 2,
    Math.min(a.y, b.y) - 40,
    Math.max(a.y, b.y) + 40,
    a.y,
    b.y,
  ]);
  for (const y of ys) push([a, { x: a.x, y }, { x: b.x, y }, b]);
  const seen = new Set<string>();
  return out.filter((path) => {
    const key = path.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface RouteCandidate {
  points: Point[];
  tangent: number;
}

function portRouteCandidates(doc: CircuitDocument, wire: Wire): RouteCandidate[] {
  const aComp = doc.components.find((c) => c.id === wire.from.componentId);
  const bComp = doc.components.find((c) => c.id === wire.to.componentId);
  if (!aComp || !bComp) return [];
  const aTerm = getTerminalDef(aComp, wire.from.terminalId);
  const bTerm = getTerminalDef(bComp, wire.to.terminalId);
  if (!aTerm || !bTerm) return [];
  const from = terminalWorld(aComp, aTerm);
  const to = terminalWorld(bComp, bTerm);
  const out: RouteCandidate[] = [];
  const seen = new Set<string>();
  for (const aPort of terminalPorts(aComp, aTerm)) {
    for (const bPort of terminalPorts(bComp, bTerm)) {
      for (const middle of connectPorts(aPort.point, bPort.point)) {
        const points = dedupeCollinear([from, ...middle, to]);
        const key = points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ points, tangent: (aPort.normal ? 0 : 1) + (bPort.normal ? 0 : 1) });
      }
    }
  }
  return out;
}

function routeHitsBodies(
  points: Point[],
  bodies: { id: string; box: Rect }[],
  wire: Wire,
): boolean {
  const segments = axisSegments(points);
  const endpoints = new Set([wire.from.componentId, wire.to.componentId]);
  for (const segment of segments) {
    for (const body of bodies) {
      const pad = endpoints.has(body.id) ? 0 : 4;
      if (segmentHitsBox(segment.a, segment.b, body.box, pad)) return true;
    }
  }
  return false;
}

export function getWireRoutes(doc: CircuitDocument): Record<string, Point[]> {
  const signature = docSignature(doc);
  const cached = routeCache.get(doc);
  if (cached && cached.signature === signature) return cached.routes;

  const routes: Record<string, Point[]> = {};
  const placed: Point[][] = [];
  for (const wire of doc.wires) {
    const route = manualWireRoute(doc, wire);
    if (route) {
      routes[wire.id] = route;
      placed.push(route);
    }
  }

  const bodies = doc.components.map((comp) => ({ id: comp.id, box: componentBounds(comp) }));
  const lanes = [0, 22, -22, 44, -44, 66, -66];
  const endpoint = (wire: Wire) => {
    const aComp = doc.components.find((c) => c.id === wire.from.componentId);
    const bComp = doc.components.find((c) => c.id === wire.to.componentId);
    const aTerm = aComp ? getTerminalDef(aComp, wire.from.terminalId) : undefined;
    const bTerm = bComp ? getTerminalDef(bComp, wire.to.terminalId) : undefined;
    if (!aComp || !bComp || !aTerm || !bTerm) return null;
    const from = terminalWorld(aComp, aTerm);
    const to = terminalWorld(bComp, bTerm);
    return { aComp, bComp, aTerm, bTerm, from, to };
  };

  // Short wires first: they get the cleanest corridors; long returns and meter
  // leads then route around them instead of the other way round.
  const autoWires = doc.wires
    .filter((wire) => !routes[wire.id])
    .sort((a, b) => {
      const ea = endpoint(a);
      const eb = endpoint(b);
      const da = ea ? Math.abs(ea.from.x - ea.to.x) + Math.abs(ea.from.y - ea.to.y) : 0;
      const db = eb ? Math.abs(eb.from.x - eb.to.x) + Math.abs(eb.from.y - eb.to.y) : 0;
      return da - db;
    });

  for (const wire of autoWires) {
    const ends = endpoint(wire);
    if (!ends) continue;
    const candidates: RouteCandidate[] = portRouteCandidates(doc, wire);
    for (const lane of lanes) {
      const base = baseWirePolyline(doc, wire, lane);
      if (base.length > 1) candidates.push({ points: base, tangent: 0 });
    }

    let cleanBest: { points: Point[]; score: number } | null = null;
    let fallback: { points: Point[]; score: number } | null = null;
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const key = candidate.points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = routeHitsBodies(candidate.points, bodies, wire);
      let score = pathLength(candidate.points) * 0.03 + pathBends(candidate.points) * 5;
      score += candidate.tangent * 6;
      for (const other of placed) {
        if (pathsOverlap(candidate.points, other)) score += 80;
        score += pathCrossings(candidate.points, other) * 16;
      }
      if (!hit && (!cleanBest || score < cleanBest.score)) {
        cleanBest = { points: candidate.points, score };
      }
      if (!fallback || score < fallback.score) fallback = { points: candidate.points, score };
    }

    let chosen: Point[] | null = cleanBest?.points ?? null;
    if (!chosen) {
      const around = routeAroundComponents(
        doc,
        wire,
        ends.from,
        terminalNormal(ends.aComp, ends.aTerm.id),
        ends.to,
        terminalNormal(ends.bComp, ends.bTerm.id),
        placed,
      );
      if (around && around.length > 1) chosen = around;
    }
    if (!chosen) chosen = fallback?.points ?? baseWirePolyline(doc, wire, 0);
    if (chosen.length > 1) {
      routes[wire.id] = chosen;
      placed.push(chosen);
    }
  }

  routeCache.set(doc, { signature, routes });
  return routes;
}

/** True when every segment of the path is horizontal or vertical. */
export function isOrthogonalRoute(points: Point[]): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) return false;
  }
  return true;
}

/** A validated manual route for a wire, or null when it is stale/invalid. */
export function manualWireRoute(doc: CircuitDocument, wire: Wire): Point[] | null {
  if (!wire.route || wire.route.length < 2) return null;
  const ends = wireEndpoints(doc, wire);
  if (!ends) return null;
  const points = dedupeCollinear(wire.route.map((point) => ({ x: point.x, y: point.y })));
  if (points.length < 2) return null;
  if (!isOrthogonalRoute(points)) return null;
  const near = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.75 && Math.abs(a.y - b.y) < 0.75;
  if (!near(points[0], ends.from) || !near(points[points.length - 1], ends.to)) return null;
  return points;
}

/** Full polyline for a wire: the manual route when valid, otherwise the auto route. */
export function wirePolyline(doc: CircuitDocument, wire: Wire): Point[] {
  const manual = manualWireRoute(doc, wire);
  if (manual) return manual;
  return getWireRoutes(doc)[wire.id] ?? [];
}

export interface EditableWireSegment {
  segmentIndex: number;
  orientation: 'horizontal' | 'vertical';
  a: Point;
  b: Point;
  mid: Point;
  movable: boolean;
  /** A straight wire needs jogs at both ends when it is offset. */
  needsJog: boolean;
}

/**
 * Segments a user can drag. For multi-segment wires only inner segments are
 * movable (the first/last segments carry the terminal stubs). A straight wire
 * exposes its single segment and is moved into a parallel lane with jogs.
 */
export function wireSegmentsForEditing(doc: CircuitDocument, wire: Wire): EditableWireSegment[] {
  const points = wirePolyline(doc, wire);
  if (points.length < 2) return [];
  const out: EditableWireSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 0.5;
    if (!horizontal && !vertical) continue;
    const movable = points.length === 2 || (i >= 1 && i <= points.length - 3);
    out.push({
      segmentIndex: i,
      orientation: horizontal ? 'horizontal' : 'vertical',
      a,
      b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      movable,
      needsJog: points.length === 2 && movable,
    });
  }
  return out;
}

/**
 * Move one draggable segment by `delta` (the perpendicular component is used).
 * The endpoints stay exactly on the terminals and the result stays orthogonal.
 */
export function moveWireSegment(pointsIn: Point[], segmentIndex: number, delta: Point): Point[] | null {
  if (pointsIn.length < 2) return null;
  const points = pointsIn.map((point) => ({ ...point }));
  if (points.length === 2) {
    const from = points[0];
    const to = points[1];
    const horizontal = Math.abs(from.y - to.y) < 0.5;
    const vertical = Math.abs(from.x - to.x) < 0.5;
    if (!horizontal && !vertical) return null;
    const stub = Math.min(22, Math.abs(horizontal ? to.x - from.x : to.y - from.y) / 2);
    if (stub < 2) return null;
    if (horizontal) {
      const dir = Math.sign(to.x - from.x) || 1;
      const y = from.y + delta.y;
      return dedupeCollinear([
        from,
        { x: from.x + dir * stub, y: from.y },
        { x: from.x + dir * stub, y },
        { x: to.x - dir * stub, y },
        { x: to.x - dir * stub, y: to.y },
        to,
      ]);
    }
    const dir = Math.sign(to.y - from.y) || 1;
    const x = from.x + delta.x;
    return dedupeCollinear([
      from,
      { x: from.x, y: from.y + dir * stub },
      { x, y: from.y + dir * stub },
      { x, y: to.y - dir * stub },
      { x: to.x, y: to.y - dir * stub },
      to,
    ]);
  }
  if (segmentIndex < 1 || segmentIndex > points.length - 3) return null;
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  const horizontal = Math.abs(a.y - b.y) < 0.5;
  if (horizontal) {
    const dy = delta.y;
    points[segmentIndex] = { ...a, y: a.y + dy };
    points[segmentIndex + 1] = { ...b, y: b.y + dy };
  } else {
    const dx = delta.x;
    points[segmentIndex] = { ...a, x: a.x + dx };
    points[segmentIndex + 1] = { ...b, x: b.x + dx };
  }
  return dedupeCollinear(points);
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
