import {
  buildTopology,
  getDesignators,
  getComponentDef,
  pinKey,
} from '@circuitlab/circuit-core';
import type {
  CircuitDocument,
  ComponentInstance,
  Topology,
} from '@circuitlab/circuit-core';
import {
  ldrResistance,
  thermistorResistance,
} from '@circuitlab/physics-engine';
import type { ComponentResult, CircuitSolution } from '@circuitlab/physics-engine';
import type { Direction, QuantityChange } from './types';

export const EPS = 1e-9;

export function direction(before: number, after: number, tolerance = 1e-7): Direction {
  const scale = Math.max(Math.abs(before), Math.abs(after), 1e-12);
  if (Math.abs(after - before) / scale < tolerance) return 'unchanged';
  return after > before ? 'increase' : 'decrease';
}

export function opposite(d: Direction): Direction {
  if (d === 'increase') return 'decrease';
  if (d === 'decrease') return 'increase';
  return 'unchanged';
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  // Round to six significant figures first so floating-point noise such as
  // 0.9999999999999999 is presented as 1.00, not 1.000.
  const v = Number(value.toPrecision(6));
  if (v !== 0 && Math.abs(v) < 1e-4) {
    return v.toExponential(2).replace('e', ' × 10^');
  }
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 10) return v.toFixed(2);
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

export function formatQuantity(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

export function makeChange(before: number, after: number, unit: string): QuantityChange {
  return {
    before,
    after,
    delta: after - before,
    direction: direction(before, after),
    unit,
  };
}

/** Physical resistance of a component from its parameters (Ω), if fixed by a model. */
export function componentResistance(comp: ComponentInstance): number | null {
  switch (comp.kind) {
    case 'resistor':
    case 'variable-resistor':
      return comp.params.resistance ?? 10;
    case 'potentiometer':
      return comp.params.resistance ?? 100;
    case 'ldr':
      return ldrResistance(comp.params);
    case 'thermistor':
      return thermistorResistance(comp.params);
    case 'cell':
    case 'battery':
      return comp.params.internalResistance ?? 0;
    default:
      return null;
  }
}

export function designators(doc: CircuitDocument): Record<string, string> {
  return getDesignators(doc);
}

export function labelFor(doc: CircuitDocument, componentId: string): string {
  const labels = designators(doc);
  return labels[componentId] ?? componentId;
}

export function solutionFor(solution: CircuitSolution, componentId: string): ComponentResult | undefined {
  return solution.components[componentId];
}

export function currentThrough(solution: CircuitSolution, componentId: string): number {
  return solution.components[componentId]?.currentMagnitude ?? 0;
}

export function voltageAcross(solution: CircuitSolution, componentId: string): number {
  return solution.components[componentId]?.voltageMagnitude ?? 0;
}

export function powerOf(solution: CircuitSolution, componentId: string): number {
  return Math.abs(solution.components[componentId]?.power ?? 0);
}

/** Node ids of a component's two terminals. */
export function componentNodeIds(
  topology: Topology,
  comp: ComponentInstance,
): [string | undefined, string | undefined] {
  const def = getComponentDef(comp.kind);
  const [a, b] = def.terminals;
  return [
    topology.nodeOfPin[pinKey(comp.id, a.id)],
    topology.nodeOfPin[pinKey(comp.id, b.id)],
  ];
}

/** True when the two components share exactly one node and that node has no other pins. */
export function inSeries(doc: CircuitDocument, topology: Topology, a: ComponentInstance, b: ComponentInstance): boolean {
  const [a1, a2] = componentNodeIds(topology, a);
  const [b1, b2] = componentNodeIds(topology, b);
  if (!a1 || !a2 || !b1 || !b2) return false;
  const shared = [a1, a2].filter((n) => n === b1 || n === b2);
  if (shared.length !== 1) return false;
  const node = topology.nodeById[shared[0]];
  if (!node) return false;
  const uniqueComponents = new Set(node.pins.map((p) => p.componentId));
  return uniqueComponents.size === 2 && node.pins.length === 2;
}

/** True when both components connect the same pair of nodes. */
export function inParallel(doc: CircuitDocument, topology: Topology, a: ComponentInstance, b: ComponentInstance): boolean {
  const [a1, a2] = componentNodeIds(topology, a);
  const [b1, b2] = componentNodeIds(topology, b);
  if (!a1 || !a2 || !b1 || !b2) return false;
  return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1);
}

export function sourceOf(doc: CircuitDocument): ComponentInstance | undefined {
  return doc.components.find((c) => c.kind === 'cell' || c.kind === 'battery');
}

export function isSourceKind(kind: string): boolean {
  return kind === 'cell' || kind === 'battery';
}

export function isFixedResistor(comp: ComponentInstance): boolean {
  return comp.kind === 'resistor' || comp.kind === 'variable-resistor';
}

export function isSensor(comp: ComponentInstance): boolean {
  return comp.kind === 'ldr' || comp.kind === 'thermistor';
}

export interface ParamChange {
  componentId: string;
  key: string;
  before: unknown;
  after: unknown;
}

const PHYSICS_KEYS = new Set([
  'resistance',
  'wiper',
  'emf',
  'internalResistance',
  'closed',
  'capacitance',
  'illuminance',
  'temperatureC',
  'referenceResistance',
  'gamma',
  'beta',
  'saturationCurrent',
  'ideality',
  'coldResistance',
  'thermalCoefficient',
]);

export function findParamChanges(before: CircuitDocument, after: CircuitDocument): ParamChange[] {
  const changes: ParamChange[] = [];
  const afterById = new Map(after.components.map((c) => [c.id, c]));
  for (const comp of before.components) {
    const next = afterById.get(comp.id);
    if (!next) continue;
    for (const key of PHYSICS_KEYS) {
      const a = (comp.params as Record<string, unknown>)[key];
      const b = (next.params as Record<string, unknown>)[key];
      if (a !== b) changes.push({ componentId: comp.id, key, before: a, after: b });
    }
  }
  return changes;
}

/** Structural fingerprint ignoring positions and rotations. */
export function topologySignature(doc: CircuitDocument): string {
  const comps = doc.components
    .map((c) => `${c.id}:${c.kind}`)
    .sort()
    .join('|');
  const wires = doc.wires
    .map((w) => {
      const a = `${w.from.componentId}:${w.from.terminalId}`;
      const b = `${w.to.componentId}:${w.to.terminalId}`;
      return [a, b].sort().join('→');
    })
    .sort()
    .join('|');
  return `${comps}||${wires}`;
}

export function sameTopology(before: CircuitDocument, after: CircuitDocument): boolean {
  return topologySignature(before) === topologySignature(after);
}

export function conductiveComponentCount(doc: CircuitDocument): number {
  return doc.components.filter((c) => c.kind !== 'voltmeter' && c.kind !== 'capacitor').length;
}

export function topologyOf(doc: CircuitDocument): Topology {
  return buildTopology(doc);
}

export function unchangedSource(doc: CircuitDocument, before: CircuitDocument): boolean {
  const a = sourceOf(before);
  const b = sourceOf(doc);
  if (!a || !b) return false;
  return (
    (a.params.emf ?? 0) === (b.params.emf ?? 0) &&
    (a.params.internalResistance ?? 0) === (b.params.internalResistance ?? 0)
  );
}

export function isIdealSource(doc: CircuitDocument): boolean {
  const source = sourceOf(doc);
  return Boolean(source) && (source?.params.internalResistance ?? 0) < 1e-9;
}

export const DIR_EN: Record<Direction, string> = {
  increase: 'increases',
  decrease: 'decreases',
  unchanged: 'stays the same',
};

export const DIR_ZH: Record<Direction, string> = {
  increase: '增大',
  decrease: '减小',
  unchanged: '保持不变',
};

export const RISE_EN: Record<Direction, string> = {
  increase: 'rises',
  decrease: 'falls',
  unchanged: 'stays the same',
};

export const RISE_ZH: Record<Direction, string> = {
  increase: '升高',
  decrease: '降低',
  unchanged: '保持不变',
};

export interface AnalysisNet {
  nodeOf: Record<string, [string, string]>;
  pinCount: Record<string, number>;
  components: ComponentInstance[];
  sourceId?: string;
}

/**
 * Build a "reasoning network" in which ideal meters are invisible: an ammeter
 * is a wire (its nodes are merged) and a voltmeter is removed. This lets
 * structural rules work on circuits that already contain teaching meters.
 */
export function analyzeNetwork(doc: CircuitDocument): AnalysisNet {
  const topology = buildTopology(doc);
  const parent = new Map<string, string>();
  for (const node of topology.nodes) parent.set(node.id, node.id);
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const comp of doc.components) {
    const bypass = comp.kind === 'ammeter' ||
      (comp.kind === 'switch' && comp.params.closed !== false);
    if (!bypass) continue;
    const [a, b] = componentNodeIds(topology, comp);
    if (a && b) union(a, b);
  }

  const nodeOf: Record<string, [string, string]> = {};
  const pinCount: Record<string, number> = {};
  const components = doc.components.filter(
    (c) => c.kind !== 'ammeter' && c.kind !== 'voltmeter',
  );
  for (const comp of components) {
    const [a, b] = componentNodeIds(topology, comp);
    const ra = a ? find(a) : '';
    const rb = b ? find(b) : '';
    nodeOf[comp.id] = [ra, rb];
    if (ra) pinCount[ra] = (pinCount[ra] ?? 0) + 1;
    if (rb && rb !== ra) pinCount[rb] = (pinCount[rb] ?? 0) + 1;
  }
  const sourceId = doc.components.find((c) => isSourceKind(c.kind))?.id;
  return { nodeOf, pinCount, components, sourceId };
}

export function samePair(a: [string, string], b: [string, string]): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
}

export function seriesIn(net: AnalysisNet, a: ComponentInstance, b: ComponentInstance): boolean {
  const na = net.nodeOf[a.id];
  const nb = net.nodeOf[b.id];
  if (!na || !nb) return false;
  const shared = na.filter((n) => n === nb[0] || n === nb[1]);
  if (shared.length !== 1) return false;
  return (net.pinCount[shared[0]] ?? 0) === 2;
}

export function parallelIn(net: AnalysisNet, a: ComponentInstance, b: ComponentInstance): boolean {
  const na = net.nodeOf[a.id];
  const nb = net.nodeOf[b.id];
  if (!na || !nb) return false;
  return samePair(na, nb);
}

/** True when both terminals of `comp` connect to the same node pair as the source. */
export function acrossSource(net: AnalysisNet, comp: ComponentInstance, source: ComponentInstance): boolean {
  const nc = net.nodeOf[comp.id];
  const ns = net.nodeOf[source.id];
  if (!nc || !ns) return false;
  return samePair(nc, ns);
}
