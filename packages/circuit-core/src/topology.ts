import { componentTerminals, getTerminalDef, terminalWorld } from './geometry';
import type {
  CircuitDocument,
  CircuitNode,
  Pin,
  Topology,
} from './types';

class DisjointSet {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root) !== root) root = this.parent.get(root) as string;
    let cur = key;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur) as string;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;
    // Always keep the lexicographically smallest key as root so node ids are stable.
    if (rankA < rankB || (rankA === rankB && ra > rb)) {
      this.parent.set(ra, rb);
      if (rankA === rankB) this.rank.set(rb, rankB + 1);
    } else {
      this.parent.set(rb, ra);
      if (rankA === rankB) this.rank.set(ra, rankA + 1);
    }
  }
}

export function pinKey(componentId: string, terminalId: string): string {
  return `${componentId}:${terminalId}`;
}

export function splitPinKey(key: string): { componentId: string; terminalId: string } {
  const idx = key.indexOf(':');
  return { componentId: key.slice(0, idx), terminalId: key.slice(idx + 1) };
}

/**
 * Build electrical nodes from wires. Only explicit wires create connections:
 * crossing wires never merge nets. Node ids are deterministic for a given
 * document so solver output can be compared across renders.
 */
export function buildTopology(doc: CircuitDocument): Topology {
  const pins: Pin[] = [];
  const pinByKey: Record<string, Pin> = {};
  for (const comp of doc.components) {
    for (const t of componentTerminals(comp)) {
      const key = pinKey(comp.id, t.id);
      const pin: Pin = {
        key,
        componentId: comp.id,
        terminalId: t.id,
        x: t.x,
        y: t.y,
      };
      pins.push(pin);
      pinByKey[key] = pin;
    }
  }

  const dsu = new DisjointSet();
  for (const pin of pins) dsu.add(pin.key);
  const wired = new Set<string>();

  for (const wire of doc.wires) {
    const a = pinKey(wire.from.componentId, wire.from.terminalId);
    const b = pinKey(wire.to.componentId, wire.to.terminalId);
    if (!pinByKey[a] || !pinByKey[b]) continue;
    dsu.union(a, b);
    wired.add(a);
    wired.add(b);
  }

  const groups = new Map<string, Pin[]>();
  for (const pin of pins) {
    if (!wired.has(pin.key)) continue;
    const root = dsu.find(pin.key);
    const list = groups.get(root) ?? [];
    list.push(pin);
    groups.set(root, list);
  }

  const nodes: CircuitNode[] = [];
  const nodeById: Record<string, CircuitNode> = {};
  const nodeOfPin: Record<string, string | undefined> = {};
  for (const pin of pins) nodeOfPin[pin.key] = undefined;

  for (const [root, group] of groups) {
    const id = `n_${root.replace(/[:]/g, '_')}`;
    const x = group.reduce((s, p) => s + p.x, 0) / group.length;
    const y = group.reduce((s, p) => s + p.y, 0) / group.length;
    const node: CircuitNode = { id, pins: group, x, y };
    nodes.push(node);
    nodeById[id] = node;
    for (const p of group) nodeOfPin[p.key] = id;
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id));

  return { pins, pinByKey, nodeOfPin, nodes, nodeById, doc };
}

export function nodeForPin(topology: Topology, componentId: string, terminalId: string): string | undefined {
  return topology.nodeOfPin[pinKey(componentId, terminalId)];
}

/** World point of a terminal of a component in the document (used by renderers). */
export function terminalPoint(doc: CircuitDocument, componentId: string, terminalId: string) {
  const comp = doc.components.find((c) => c.id === componentId);
  if (!comp) return undefined;
  const t = getTerminalDef(comp, terminalId);
  if (!t) return undefined;
  return terminalWorld(comp, t);
}

/** Adjacency of nodes through a predicate over components (defaults: everything). */
export function buildNodeGraph(
  topology: Topology,
  include: (kind: string, componentId: string) => boolean = () => true,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const node of topology.nodes) graph.set(node.id, new Set());
  for (const comp of topology.doc.components) {
    if (!include(comp.kind, comp.id)) continue;
    const terminals = componentTerminals(comp);
    if (terminals.length < 2) continue;
    const a = nodeForPin(topology, comp.id, terminals[0].id);
    const b = nodeForPin(topology, comp.id, terminals[1].id);
    if (!a || !b || a === b) continue;
    graph.get(a)?.add(b);
    graph.get(b)?.add(a);
  }
  return graph;
}

export function connectedComponent(start: string, graph: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>();
  if (!graph.has(start)) return seen;
  const stack = [start];
  while (stack.length) {
    const node = stack.pop() as string;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}
