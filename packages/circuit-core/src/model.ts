import { componentBounds, GRID } from './geometry';
import type {
  CircuitDocument,
  ComponentInstance,
  ComponentKind,
  Rotation,
  Wire,
  WireEndpoint,
} from './types';
import { createId } from './ids';
import { defaultParamsFor, getComponentDef } from './defs';
import { buildTopology, pinKey } from './topology';

export function createComponent(
  kind: ComponentKind,
  x: number,
  y: number,
  overrides: Partial<ComponentInstance> = {},
): ComponentInstance {
  const { params, ...rest } = overrides;
  return {
    id: createId(kind),
    kind,
    x,
    y,
    rotation: 0,
    ...rest,
    params: { ...defaultParamsFor(kind), ...(params ?? {}) },
  };
}

export function createWire(from: WireEndpoint, to: WireEndpoint): Wire {
  return { id: createId('w'), from, to };
}

export function createDocument(name = 'Untitled circuit'): CircuitDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: createId('circuit'),
    name,
    createdAt: now,
    updatedAt: now,
    components: [],
    wires: [],
    meta: {},
  };
}

export function cloneDocument(doc: CircuitDocument): CircuitDocument {
  return structuredClone(doc);
}

/** Deep copy that keeps component/wire ids — used for before/after simulations. */
export function snapshotDocument(doc: CircuitDocument): CircuitDocument {
  return cloneDocument(doc);
}

/** Move a component, snapping to the grid unless free is requested. */
export function moveComponent(
  doc: CircuitDocument,
  componentId: string,
  x: number,
  y: number,
  grid = GRID,
): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: doc.components.map((c) =>
      c.id === componentId
        ? { ...c, x: Math.round(x / grid) * grid, y: Math.round(y / grid) * grid }
        : c,
    ),
  };
}

export function rotateComponent(
  doc: CircuitDocument,
  componentId: string,
  delta = 90,
): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: doc.components.map((c) =>
      c.id === componentId
        ? { ...c, rotation: (((c.rotation + delta) % 360 + 360) % 360) as Rotation }
        : c,
    ),
  };
}

export function updateParams(
  doc: CircuitDocument,
  componentId: string,
  params: Partial<ComponentInstance['params']>,
): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: doc.components.map((c) =>
      c.id === componentId ? { ...c, params: { ...c.params, ...params } } : c,
    ),
  };
}

/** Remove a component and every wire attached to it. */
export function removeComponent(doc: CircuitDocument, componentId: string): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: doc.components.filter((c) => c.id !== componentId),
    wires: doc.wires.filter(
      (w) => w.from.componentId !== componentId && w.to.componentId !== componentId,
    ),
  };
}

export function addComponent(doc: CircuitDocument, comp: ComponentInstance): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: [...doc.components, comp],
  };
}

export function removeWire(doc: CircuitDocument, wireId: string): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    wires: doc.wires.filter((w) => w.id !== wireId),
  };
}

/** Reject duplicate wires between the same pair of pins (in either direction). */
export function wireExists(doc: CircuitDocument, from: WireEndpoint, to: WireEndpoint): boolean {
  const a = pinKey(from.componentId, from.terminalId);
  const b = pinKey(to.componentId, to.terminalId);
  return doc.wires.some((w) => {
    const c = pinKey(w.from.componentId, w.from.terminalId);
    const d = pinKey(w.to.componentId, w.to.terminalId);
    return (c === a && d === b) || (c === b && d === a);
  });
}

export function connectTerminals(
  doc: CircuitDocument,
  from: WireEndpoint,
  to: WireEndpoint,
): { doc: CircuitDocument; wire?: Wire; error?: string } {
  if (from.componentId === to.componentId && from.terminalId === to.terminalId) {
    return { doc, error: 'A terminal cannot be connected to itself.' };
  }
  const a = doc.components.find((c) => c.id === from.componentId);
  const b = doc.components.find((c) => c.id === to.componentId);
  if (!a || !b) return { doc, error: 'Unknown component.' };
  if (wireExists(doc, from, to)) return { doc, error: 'These terminals are already connected.' };
  const wire = createWire(from, to);
  return {
    doc: { ...doc, updatedAt: new Date().toISOString(), wires: [...doc.wires, wire] },
    wire,
  };
}

/** Lists every pin that is attached to at least one wire. */
export function connectedPins(doc: CircuitDocument): Set<string> {
  const set = new Set<string>();
  for (const w of doc.wires) {
    set.add(pinKey(w.from.componentId, w.from.terminalId));
    set.add(pinKey(w.to.componentId, w.to.terminalId));
  }
  return set;
}

/**
 * Simple layered auto-layout: sources on the left, then breadth-first layers of
 * the component graph. Positions are snapped to the grid and columns are spaced
 * so labels never collide.
 */

/**
 * Recognise a single source → series chain → source loop. This is the common
 * teaching circuit (source, resistor/LDR/lamp/ammeter, return). Rows keep the
 * auto-arranged layout clean; shunt voltmeters sit under the element they
 * measure. Returns null for branched circuits so the generic layout applies.
 */
function seriesRowLayout(doc: CircuitDocument): Map<string, { x: number; y: number }> | null {
  const source = doc.components.find((c) => c.kind === 'cell' || c.kind === 'battery');
  if (!source) return null;
  const topology = buildTopology(doc);
  const nodeOf = (comp: ComponentInstance, terminalId: string) =>
    topology.nodeOfPin[pinKey(comp.id, terminalId)];
  const sourceDef = getComponentDef(source.kind);
  const posTerm = sourceDef.terminals.find((t) => t.id === 'pos');
  const negTerm = sourceDef.terminals.find((t) => t.id === 'neg');
  if (!posTerm || !negTerm) return null;
  const posNode = nodeOf(source, posTerm.id);
  const negNode = nodeOf(source, negTerm.id);
  if (!posNode || !negNode) return null;

  const pinsAt = new Map<string, { comp: ComponentInstance; terminalId: string }[]>();
  for (const comp of doc.components) {
    for (const terminal of getComponentDef(comp.kind).terminals) {
      const node = nodeOf(comp, terminal.id);
      if (!node) continue;
      const list = pinsAt.get(node) ?? [];
      list.push({ comp, terminalId: terminal.id });
      pinsAt.set(node, list);
    }
  }

  const chain: ComponentInstance[] = [];
  const visited = new Set<string>([source.id]);
  let node = posNode;
  let previous = source.id;
  for (let guard = 0; guard <= doc.components.length + 1; guard += 1) {
    if (node === negNode) break;
    const candidates = (pinsAt.get(node) ?? []).filter((pin) => {
      if (pin.comp.id === previous || visited.has(pin.comp.id)) return false;
      const def = getComponentDef(pin.comp.kind);
      return def.terminals.length === 2 && pin.comp.kind !== 'voltmeter';
    });
    if (candidates.length !== 1) return null;
    const chosen = candidates[0];
    const def = getComponentDef(chosen.comp.kind);
    const other = def.terminals.find((t) => t.id !== chosen.terminalId);
    if (!other) return null;
    const next = nodeOf(chosen.comp, other.id);
    if (!next) return null;
    chain.push(chosen.comp);
    visited.add(chosen.comp.id);
    previous = chosen.comp.id;
    node = next;
  }
  if (node !== negNode) return null;

  const shunts: { comp: ComponentInstance; target: ComponentInstance }[] = [];
  for (const comp of doc.components) {
    if (visited.has(comp.id)) continue;
    if (comp.kind !== 'voltmeter') return null;
    const def = getComponentDef(comp.kind);
    if (def.terminals.length !== 2) return null;
    const n1 = nodeOf(comp, def.terminals[0].id);
    const n2 = nodeOf(comp, def.terminals[1].id);
    const target = [source, ...chain].find((candidate) => {
      const candidateDef = getComponentDef(candidate.kind);
      if (candidateDef.terminals.length !== 2) return false;
      const a = nodeOf(candidate, candidateDef.terminals[0].id);
      const b = nodeOf(candidate, candidateDef.terminals[1].id);
      return (a === n1 && b === n2) || (a === n2 && b === n1);
    });
    if (!target) return null;
    shunts.push({ comp, target });
  }

  const row = [source, ...chain];
  const positions = new Map<string, { x: number; y: number }>();
  row.forEach((comp, index) => positions.set(comp.id, { x: 160 + index * 220, y: 200 }));
  const shuntCount = new Map<string, number>();
  for (const { comp, target } of shunts) {
    const targetPosition = positions.get(target.id);
    if (!targetPosition) return null;
    const index = shuntCount.get(target.id) ?? 0;
    shuntCount.set(target.id, index + 1);
    positions.set(comp.id, { x: targetPosition.x, y: 380 + index * 120 });
  }
  return positions;
}

export function autoLayout(doc: CircuitDocument): CircuitDocument {
  if (doc.components.length === 0) return doc;
  const series = seriesRowLayout(doc);
  if (series) {
    return {
      ...doc,
      updatedAt: new Date().toISOString(),
      components: doc.components.map((comp) => {
        const position = series.get(comp.id) ?? { x: comp.x, y: comp.y };
        return {
          ...comp,
          x: Math.round(position.x / GRID) * GRID,
          y: Math.round(position.y / GRID) * GRID,
        };
      }),
    };
  }
  const topology = buildTopology(doc);
  const byId = new Map(doc.components.map((c) => [c.id, c]));

  const adjacency = new Map<string, Set<string>>();
  for (const c of doc.components) adjacency.set(c.id, new Set());
  for (const node of topology.nodes) {
    const ids = [...new Set(node.pins.map((p) => p.componentId))];
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b) adjacency.get(a)?.add(b);
      }
    }
  }

  const sources = doc.components.filter((c) => c.kind === 'cell' || c.kind === 'battery');
  const start = sources.map((s) => s.id);
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const id of start) {
    level.set(id, 0);
    queue.push(id);
  }
  if (queue.length === 0) {
    level.set(doc.components[0].id, 0);
    queue.push(doc.components[0].id);
  }
  while (queue.length) {
    const id = queue.shift() as string;
    const l = level.get(id) ?? 0;
    for (const next of adjacency.get(id) ?? []) {
      if (!level.has(next)) {
        level.set(next, l + 1);
        queue.push(next);
      }
    }
  }
  let maxLevel = 0;
  for (const c of doc.components) {
    if (!level.has(c.id)) level.set(c.id, 0);
    maxLevel = Math.max(maxLevel, level.get(c.id) ?? 0);
  }

  const columns = new Map<number, string[]>();
  for (const c of doc.components) {
    const l = level.get(c.id) ?? 0;
    const list = columns.get(l) ?? [];
    list.push(c.id);
    columns.set(l, list);
  }

  const width = 220;
  const height = 150;
  const positions = new Map<string, { x: number; y: number }>();
  const totalWidth = (maxLevel + 1) * width;
  for (const [l, ids] of columns) {
    ids.forEach((id, index) => {
      const x = 160 + l * width;
      const y = 140 + index * height - ((ids.length - 1) * height) / 2;
      positions.set(id, { x, y });
    });
  }
  void totalWidth;

  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: doc.components.map((c) => {
      const p = positions.get(c.id) ?? { x: c.x, y: c.y };
      const comp = byId.get(c.id) ?? c;
      return {
        ...comp,
        x: Math.round(p.x / GRID) * GRID,
        y: Math.round(p.y / GRID) * GRID,
      };
    }),
  };
}

/** Bounding boxes of all components overlap? Used by the validator as a warning. */
export function overlappingComponentPairs(doc: CircuitDocument): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < doc.components.length; i += 1) {
    for (let j = i + 1; j < doc.components.length; j += 1) {
      const a = componentBounds(doc.components[i]);
      const b = componentBounds(doc.components[j]);
      const overlap =
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      if (overlap) pairs.push([doc.components[i].id, doc.components[j].id]);
    }
  }
  return pairs;
}


/** Stable reference designators (R1, R2, LDR1 …) in document order. */
export function getDesignators(doc: CircuitDocument): Record<string, string> {
  const counts = new Map<string, number>();
  const out: Record<string, string> = {};
  for (const comp of doc.components) {
    if (comp.label) {
      out[comp.id] = comp.label;
      continue;
    }
    const prefix = getComponentDef(comp.kind).labelPrefix;
    const next = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, next);
    out[comp.id] = `${prefix}${next}`;
  }
  return out;
}
