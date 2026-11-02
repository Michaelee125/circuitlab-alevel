import { buildTopology, getComponentDef, pinKey } from '@circuitlab/circuit-core';
import type { CircuitDocument, ComponentInstance, ComponentKind, Topology } from '@circuitlab/circuit-core';
import { solveLinear } from './linalg';
import {
  conductsDC,
  diodeConductance,
  diodeCurrent,
  lampConductance,
  lampCurrent,
  linearResistance,
} from './models';

export type SolveStatus =
  | 'ok'
  | 'empty'
  | 'no-source'
  | 'open-circuit'
  | 'short-circuit'
  | 'singular'
  | 'invalid';

export interface SolverMessage {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  componentIds?: string[];
}

export interface ComponentResult {
  componentId: string;
  kind: ComponentKind;
  label: string;
  /** Current in the reference direction (passive a→b, source −→+). */
  current: number;
  /** Voltage in the reference direction (Vₐ−V_b for passives, V₋−V₊ for sources). */
  voltage: number;
  /** Power absorbed by the component (negative for a source delivering energy). */
  power: number;
  currentMagnitude: number;
  voltageMagnitude: number;
  /** Effective resistance |V|/|I| when current flows (Ω). */
  resistance: number | null;
  valid: boolean;
  /** Terminal p.d. of a source (V₊−V₋). */
  terminalVoltage?: number;
  deliveredPower?: number;
  internalPower?: number;
  emf?: number;
  extra?: Record<string, number>;
}

export interface CircuitSolution {
  status: SolveStatus;
  ok: boolean;
  components: Record<string, ComponentResult>;
  nodeVoltages: Record<string, number>;
  groundNodeId?: string;
  warnings: SolverMessage[];
  errors: SolverMessage[];
  iterations: number;
  sourceIds: string[];
  totalCurrent: number | null;
  totalResistance: number | null;
  totalPowerDelivered: number;
  totalPowerDissipated: number;
  probeCurrent?: number;
  islandCount: number;
  topology: Topology;
}

export interface SolveOptions {
  /** Replace every EMF with 0 V (used to find the Thévenin resistance). */
  zeroSources?: boolean;
  /** Additional ideal voltage source, used only by the RC transient helper. */
  probe?: { nodeA: string; nodeB: string; voltage: number };
}

interface SourceState {
  component: ComponentInstance;
  branch: number;
  negNodeId: string;
  posNodeId: string;
  internalIndex: number | null;
  deliveredCurrent: number;
  terminalVoltage: number;
  emf: number;
  internalResistance: number;
}

interface Island {
  id: number;
  nodeIds: string[];
  components: ComponentInstance[];
  hasSource: boolean;
}

const emptySolution = (topology: Topology, status: SolveStatus, message?: SolverMessage): CircuitSolution => ({
  status,
  ok: false,
  components: {},
  nodeVoltages: {},
  warnings: [],
  errors: message ? [message] : [],
  iterations: 0,
  sourceIds: [],
  totalCurrent: null,
  totalResistance: null,
  totalPowerDelivered: 0,
  totalPowerDissipated: 0,
  islandCount: 0,
  topology,
});

interface TerminalNodes {
  a?: string;
  b?: string;
  w?: string;
}

function terminalNodes(topology: Topology, comp: ComponentInstance): TerminalNodes {
  const def = getComponentDef(comp.kind);
  const nodeOf = (terminalId: string) =>
    topology.nodeOfPin[pinKey(comp.id, terminalId)];
  if (comp.kind === 'potentiometer') {
    return { a: nodeOf('a'), b: nodeOf('b'), w: nodeOf('w') };
  }
  const [a, b] = def.terminals;
  return { a: nodeOf(a.id), b: nodeOf(b.id) };
}

function wiredNodes(nodes: TerminalNodes): string[] {
  return [nodes.a, nodes.b, nodes.w].filter((node): node is string => Boolean(node));
}

function sourceTerminals(comp: ComponentInstance): { neg: string; pos: string } {
  const def = getComponentDef(comp.kind);
  const neg = def.terminals.find((t) => t.id === 'neg') ?? def.terminals[0];
  const pos = def.terminals.find((t) => t.id === 'pos') ?? def.terminals[1];
  return { neg: neg.id, pos: pos.id };
}

function isSource(kind: ComponentKind): boolean {
  return kind === 'cell' || kind === 'battery';
}

/** Solve the whole circuit with Modified Nodal Analysis. */
export function solveCircuit(doc: CircuitDocument, options: SolveOptions = {}): CircuitSolution {
  const topology = buildTopology(doc);
  if (doc.components.length === 0) {
    return { ...emptySolution(topology, 'empty'), ok: false };
  }

  const componentById = new Map(doc.components.map((c) => [c.id, c]));
  const sourceIds = doc.components.filter((c) => isSource(c.kind)).map((c) => c.id);

  // ---- conductive graph -------------------------------------------------
  const adjacency = new Map<string, Set<string>>();
  for (const node of topology.nodes) adjacency.set(node.id, new Set());
  const connect = (a?: string, b?: string) => {
    if (!a || !b || a === b) return;
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  };

  const compNodes = new Map<string, TerminalNodes>();
  for (const comp of doc.components) {
    const nodes = terminalNodes(topology, comp);
    compNodes.set(comp.id, nodes);
    if (comp.kind === 'potentiometer') {
      const wired = wiredNodes(nodes);
      for (let i = 0; i < wired.length; i += 1) {
        for (let j = i + 1; j < wired.length; j += 1) connect(wired[i], wired[j]);
      }
    } else if (conductsDC(comp)) {
      connect(nodes.a, nodes.b);
    }
  }
  if (options.probe) connect(options.probe.nodeA, options.probe.nodeB);

  // ---- islands ----------------------------------------------------------
  const islandOfNode = new Map<string, number>();
  const islands: Island[] = [];
  for (const node of topology.nodes) {
    if (islandOfNode.has(node.id)) continue;
    const id = islands.length;
    const queue = [node.id];
    const nodeIds: string[] = [];
    islandOfNode.set(node.id, id);
    while (queue.length) {
      const current = queue.shift() as string;
      nodeIds.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!islandOfNode.has(next)) {
          islandOfNode.set(next, id);
          queue.push(next);
        }
      }
    }
    islands.push({ id, nodeIds, components: [], hasSource: false });
  }

  for (const comp of doc.components) {
    const wired = wiredNodes(compNodes.get(comp.id) ?? {});
    if (wired.length < 2) continue;
    const islandId = islandOfNode.get(wired[0]);
    if (islandId === undefined) continue;
    if (wired.some((node) => islandOfNode.get(node) !== islandId)) continue;
    islands[islandId].components.push(comp);
    if (isSource(comp.kind)) islands[islandId].hasSource = true;
  }

  const warnings: SolverMessage[] = [];
  const errors: SolverMessage[] = [];
  const readings = new Map<string, ComponentResult>();
  const nodeVoltages: Record<string, number> = {};
  for (const node of topology.nodes) nodeVoltages[node.id] = 0;

  let mainIslandId = islands.findIndex((i) => i.hasSource);
  const firstSource = doc.components.find((c) => isSource(c.kind));
  if (firstSource) {
    const { neg } = sourceTerminals(firstSource);
    const negNode = topology.nodeOfPin[pinKey(firstSource.id, neg)];
    const idx = negNode ? islandOfNode.get(negNode) : undefined;
    if (idx !== undefined) mainIslandId = idx;
  }
  if (mainIslandId < 0 && islands.length > 0) {
    mainIslandId = islands.reduce(
      (best, island, i) => (island.nodeIds.length > islands[best].nodeIds.length ? i : best),
      0,
    );
  }

  let totalIterations = 0;
  let anySingular = false;
  let probeCurrent: number | undefined;
  let groundNodeId: string | undefined;

  // ---- per-island solve -------------------------------------------------
  for (const island of islands) {
    if (island.nodeIds.length === 0) continue;
    const islandComponents = island.components;
    const isMain = island.id === mainIslandId;

    // Ground reference: negative terminal of the first source in this island.
    let ground: string | undefined;
    for (const comp of islandComponents) {
      if (!isSource(comp.kind)) continue;
      const { neg } = sourceTerminals(comp);
      const nodeId = topology.nodeOfPin[pinKey(comp.id, neg)];
      if (nodeId && islandOfNode.get(nodeId) === island.id) {
        ground = nodeId;
        break;
      }
    }
    ground = ground ?? island.nodeIds[0];
    if (isMain) groundNodeId = ground;

    const unknownNodes = island.nodeIds.filter((n) => n !== ground);
    const indexOfNode = new Map<string, number>();
    unknownNodes.forEach((nodeId, i) => indexOfNode.set(nodeId, i));
    const idxOf = (nodeId?: string): number => {
      if (!nodeId || nodeId === ground) return -1;
      return indexOfNode.get(nodeId) ?? -1;
    };

    const probeInIsland = Boolean(
      options.probe && islandOfNode.get(options.probe.nodeA) === island.id,
    );
    if (!island.hasSource && !probeInIsland) {
      for (const nodeId of island.nodeIds) if (isMain) nodeVoltages[nodeId] = 0;
      for (const comp of islandComponents) {
        if (isSource(comp.kind)) {
          readings.set(comp.id, {
            ...zeroReading(comp),
            emf: 0,
            terminalVoltage: 0,
            deliveredPower: 0,
            internalPower: 0,
          });
        } else {
          readings.set(comp.id, zeroReading(comp));
        }
      }
      continue;
    }

    // ---- allocate extra nodes + voltage-source branches -----------------
    const extraNodes: string[] = [];
    const sources: SourceState[] = [];
    for (const comp of islandComponents) {
      if (!isSource(comp.kind)) continue;
      const { neg, pos } = sourceTerminals(comp);
      const negNodeId = topology.nodeOfPin[pinKey(comp.id, neg)];
      const posNodeId = topology.nodeOfPin[pinKey(comp.id, pos)];
      if (!negNodeId || !posNodeId) continue;
      if (islandOfNode.get(negNodeId) !== island.id || islandOfNode.get(posNodeId) !== island.id) continue;
      const internalResistance = Math.max(0, comp.params.internalResistance ?? 0);
      const extraIndex = internalResistance > 0 ? unknownNodes.length + extraNodes.length : null;
      if (extraIndex !== null) extraNodes.push(`${comp.id}::internal`);
      sources.push({
        component: comp,
        branch: -1,
        negNodeId,
        posNodeId,
        internalIndex: extraIndex,
        deliveredCurrent: 0,
        terminalVoltage: 0,
        emf: options.zeroSources ? 0 : Math.max(0, comp.params.emf ?? 0),
        internalResistance,
      });
    }
    const baseCount = unknownNodes.length + extraNodes.length;
    sources.forEach((source, i) => {
      source.branch = baseCount + i;
    });
    const probeBranch = options.probe
      ? baseCount + sources.length
      : -1;
    const size = baseCount + sources.length + (options.probe ? 1 : 0);

    // ---- nonlinear operating point --------------------------------------
    const nonlinear = islandComponents.filter((c) => c.kind === 'lamp' || c.kind === 'diode');
    const guesses = new Map<string, number>();
    for (const comp of nonlinear) guesses.set(comp.id, 0);

    const assemble = (): { A: number[][]; b: number[] } => {
      const A: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
      const b = new Array(size).fill(0);

      const addG = (i: number, j: number, g: number) => {
        if (i >= 0) A[i][i] += g;
        if (j >= 0) A[j][j] += g;
        if (i >= 0 && j >= 0) {
          A[i][j] -= g;
          A[j][i] -= g;
        }
      };
      const addI = (i: number, j: number, current: number) => {
        if (i >= 0) b[i] -= current;
        if (j >= 0) b[j] += current;
      };
      const addSource = (posIdx: number, negIdx: number, volts: number, branch: number) => {
        if (posIdx >= 0) A[posIdx][branch] += 1;
        if (negIdx >= 0) A[negIdx][branch] -= 1;
        if (posIdx >= 0) A[branch][posIdx] += 1;
        if (negIdx >= 0) A[branch][negIdx] -= 1;
        b[branch] += volts;
      };

      for (const comp of islandComponents) {
        const { a: nodeA, b: nodeB, w: nodeW } = compNodes.get(comp.id) ?? {};
        const wired = [nodeA, nodeB, nodeW].filter((node): node is string => Boolean(node));
        if (wired.length < 2) continue;
        const ia = idxOf(nodeA);
        const ib = idxOf(nodeB);
        const iw = idxOf(nodeW);

        switch (comp.kind) {
          case 'cell':
          case 'battery': {
            // handled below with branch equations
            break;
          }
          case 'lamp': {
            const v = guesses.get(comp.id) ?? 0;
            const r0 = comp.params.coldResistance ?? 2;
            const k = comp.params.thermalCoefficient ?? 0.5;
            const g = lampConductance(r0, k, v);
            const i0 = lampCurrent(r0, k, v) - g * v;
            addG(ia, ib, g);
            addI(ia, ib, i0);
            break;
          }
          case 'diode': {
            const v = guesses.get(comp.id) ?? 0;
            const isat = comp.params.saturationCurrent ?? 1e-9;
            const n = comp.params.ideality ?? 1.8;
            const g = Math.min(1e3, diodeConductance(v, isat, n));
            const i0 = diodeCurrent(v, isat, n) - g * v;
            addG(ia, ib, g);
            addI(ia, ib, i0);
            break;
          }
          case 'potentiometer': {
            const total = Math.max(0.01, comp.params.resistance ?? 100);
            const fraction = Math.min(1, Math.max(0, comp.params.wiper ?? 0.5));
            // `wiper` is measured from terminal B: 0 = at B, 1 = at A.
            const rAW = Math.max(1e-3, (1 - fraction) * total);
            const rWB = Math.max(1e-3, fraction * total);
            if (nodeW) {
              if (nodeA) addG(ia, iw, 1 / rAW);
              if (nodeB) addG(iw, ib, 1 / rWB);
            } else if (nodeA && nodeB) {
              // No wiper connection: the full track behaves as a two-terminal resistor.
              addG(ia, ib, 1 / total);
            }
            break;
          }
          case 'capacitor': {
            // open circuit under steady direct current
            break;
          }
          case 'switch': {
            if (comp.params.closed === false) break;
            addG(ia, ib, 1 / 1e-6);
            break;
          }
          default: {
            const resistance = linearResistance(comp);
            if (resistance === null || resistance <= 0) break;
            addG(ia, ib, 1 / resistance);
          }
        }
      }

      for (const source of sources) {
        const posIdx = source.internalIndex !== null ? source.internalIndex : idxOf(source.posNodeId);
        const negIdx = idxOf(source.negNodeId);
        addSource(posIdx, negIdx, source.emf, source.branch);
        if (source.internalIndex !== null) {
          // internal resistance between the ideal EMF node and the positive terminal
          const g = 1 / Math.max(1e-9, source.internalResistance);
          addG(source.internalIndex, idxOf(source.posNodeId), g);
        }
      }

      if (options.probe && probeBranch >= 0) {
        const probeIslandA = islandOfNode.get(options.probe.nodeA);
        if (probeIslandA === island.id) {
          addSource(idxOf(options.probe.nodeA), idxOf(options.probe.nodeB), options.probe.voltage, probeBranch);
        }
      }

      return { A, b };
    };

    const nodeVoltageFrom = (x: number[]): Map<string, number> => {
      const map = new Map<string, number>();
      map.set(ground as string, 0);
      unknownNodes.forEach((nodeId, i) => map.set(nodeId, x[i] ?? 0));
      extraNodes.forEach((name, i) => map.set(name, x[unknownNodes.length + i] ?? 0));
      return map;
    };

    let x: number[] = [];
    let singular = false;
    let iterations = 0;
    let convergent = nonlinear.length === 0;

    if (nonlinear.length === 0) {
      const { A, b } = assemble();
      const solved = solveLinear(A, b);
      x = solved.x;
      singular = solved.singular;
      iterations = 1;
    } else {
      for (let iter = 0; iter < 80; iter += 1) {
        iterations = iter + 1;
        const { A, b } = assemble();
        const solved = solveLinear(A, b);
        if (solved.singular) {
          singular = true;
          x = solved.x;
          break;
        }
        x = solved.x;
        const volts = nodeVoltageFrom(x);
        let maxDelta = 0;
        for (const comp of nonlinear) {
          const { a, b: bNode } = compNodes.get(comp.id) ?? {};
          const va = a ? volts.get(a) ?? 0 : 0;
          const vb = bNode ? volts.get(bNode) ?? 0 : 0;
          const target = va - vb;
          const previous = guesses.get(comp.id) ?? 0;
          let next = target;
          if (comp.kind === 'diode') {
            // damped Newton step keeps the exponential well behaved
            const delta = Math.max(-0.12, Math.min(0.12, target - previous));
            next = previous + delta;
          }
          maxDelta = Math.max(maxDelta, Math.abs(next - previous));
          guesses.set(comp.id, next);
        }
        if (maxDelta < 1e-10) {
          convergent = true;
          break;
        }
      }
      if (!convergent) {
        warnings.push({
          code: 'nonlinear-not-converged',
          message: 'The non-linear components did not fully converge; results are approximate.',
          severity: 'warning',
          componentIds: nonlinear.map((c) => c.id),
        });
      }
    }

    totalIterations += iterations;
    if (singular) {
      anySingular = true;
      continue;
    }

    const volts = nodeVoltageFrom(x);
    if (isMain) {
      for (const nodeId of island.nodeIds) nodeVoltages[nodeId] = ground === nodeId ? 0 : volts.get(nodeId) ?? 0;
    }
    if (options.probe && probeBranch >= 0) {
      const probeIsland = options.probe ? islandOfNode.get(options.probe.nodeA) : undefined;
      if (probeIsland === island.id) probeCurrent = x[probeBranch];
    }

    // ---- source readings -------------------------------------------------
    for (const source of sources) {
      const comp = source.component;
      const branchCurrent = x[source.branch] ?? 0; // + node → − node through the source
      const deliveredCurrent = -branchCurrent;
      const vPos = volts.get(source.posNodeId) ?? 0;
      const vNeg = volts.get(source.negNodeId) ?? 0;
      const terminalVoltage = vPos - vNeg;
      source.deliveredCurrent = deliveredCurrent;
      source.terminalVoltage = terminalVoltage;

      const absorbed = -terminalVoltage * deliveredCurrent;
      const internalPower = deliveredCurrent * deliveredCurrent * source.internalResistance;
      readings.set(comp.id, {
        componentId: comp.id,
        kind: comp.kind,
        label: comp.label ?? getComponentDef(comp.kind).name,
        current: deliveredCurrent,
        voltage: -terminalVoltage,
        power: absorbed,
        currentMagnitude: Math.abs(deliveredCurrent),
        voltageMagnitude: Math.abs(terminalVoltage),
        resistance: null,
        valid: true,
        terminalVoltage,
        deliveredPower: terminalVoltage * deliveredCurrent,
        internalPower,
        emf: source.emf,
      });
    }

    // ---- passive readings ------------------------------------------------
    for (const comp of islandComponents) {
      if (isSource(comp.kind)) continue;
      const { a: nodeA, b: nodeB, w: nodeW } = compNodes.get(comp.id) ?? {};
      const wired = [nodeA, nodeB, nodeW].filter((node): node is string => Boolean(node));
      if (wired.length < 2) continue;
      const ia = idxOf(nodeA);
      const ib = idxOf(nodeB);
      if (ia === -1 && ib === -1 && idxOf(nodeW) === -1) {
        readings.set(comp.id, zeroReading(comp));
        continue;
      }
      if (comp.kind === 'potentiometer') {
        const total = Math.max(0.01, comp.params.resistance ?? 100);
        const fraction = Math.min(1, Math.max(0, comp.params.wiper ?? 0.5));
        const rAW = Math.max(1e-3, (1 - fraction) * total);
        const rWB = Math.max(1e-3, fraction * total);
        const va = nodeA ? volts.get(nodeA) ?? 0 : undefined;
        const vb = nodeB ? volts.get(nodeB) ?? 0 : undefined;
        const vw = nodeW ? volts.get(nodeW) ?? 0 : undefined;
        let current = 0;
        let voltage = 0;
        if (va !== undefined && vw !== undefined) {
          current = (va - vw) / rAW;
          voltage = vb !== undefined ? va - vb : va - vw;
        } else if (vb !== undefined && vw !== undefined) {
          current = (vw - vb) / rWB;
          voltage = vw - vb;
        } else if (va !== undefined && vb !== undefined) {
          current = (va - vb) / total;
          voltage = va - vb;
        }
        const wiperVoltage =
          vw !== undefined && vb !== undefined
            ? vw - vb
            : vw !== undefined && va !== undefined
              ? vw - va
              : 0;
        const wiperCurrent =
          va !== undefined && vw !== undefined && vb !== undefined
            ? (va - vw) / rAW - (vw - vb) / rWB
            : 0;
        const power =
          va !== undefined && vw !== undefined && vb !== undefined
            ? (va - vw) ** 2 / rAW + (vw - vb) ** 2 / rWB
            : current ** 2 * (va !== undefined && vw !== undefined ? rAW : rWB);
        readings.set(comp.id, {
          componentId: comp.id,
          kind: comp.kind,
          label: comp.label ?? getComponentDef(comp.kind).name,
          current,
          voltage,
          power,
          currentMagnitude: Math.abs(current),
          voltageMagnitude: Math.abs(voltage),
          resistance: total,
          valid: true,
          extra: {
            wiperFraction: fraction,
            wiperVoltage,
            wiperCurrent,
            resistanceAW: rAW,
            resistanceWB: rWB,
            totalResistance: total,
          },
        });
        continue;
      }
      if (!nodeA || !nodeB) continue;
      const va = volts.get(nodeA) ?? 0;
      const vb = volts.get(nodeB) ?? 0;
      const voltage = va - vb;
      let current = 0;
      let resistance: number | null = null;

      switch (comp.kind) {
        case 'lamp': {
          current = lampCurrent(comp.params.coldResistance ?? 2, comp.params.thermalCoefficient ?? 0.5, voltage);
          resistance = Math.abs(current) > 1e-12 ? Math.abs(voltage / current) : comp.params.coldResistance ?? 2;
          break;
        }
        case 'diode': {
          current = diodeCurrent(voltage, comp.params.saturationCurrent ?? 1e-9, comp.params.ideality ?? 1.8);
          resistance = Math.abs(current) > 1e-12 ? Math.abs(voltage / current) : null;
          break;
        }
        case 'capacitor': {
          current = 0;
          resistance = null;
          break;
        }
        case 'switch': {
          if (comp.params.closed === false) {
            current = 0;
            resistance = null;
          } else {
            current = voltage / 1e-6;
            resistance = 1e-6;
          }
          break;
        }
        case 'voltmeter': {
          resistance = 1e9;
          current = voltage / resistance;
          break;
        }
        default: {
          resistance = linearResistance(comp);
          current = resistance && resistance > 0 ? voltage / resistance : 0;
        }
      }

      readings.set(comp.id, {
        componentId: comp.id,
        kind: comp.kind,
        label: comp.label ?? getComponentDef(comp.kind).name,
        current,
        voltage,
        power: voltage * current,
        currentMagnitude: Math.abs(current),
        voltageMagnitude: Math.abs(voltage),
        resistance,
        valid: true,
      });
    }
  }

  // ---- components that could not be placed in an island ------------------
  for (const comp of doc.components) {
    if (readings.has(comp.id)) continue;
    const nodes = compNodes.get(comp.id) ?? {};
    const wired = wiredNodes(nodes);
    if (wired.length >= 2) {
      // The component bridges two separately-referenced networks (for example an
      // open switch). No current flows; the p.d. follows the conventional
      // floating-island reference used for display.
      const voltage = (nodeVoltages[wired[0]] ?? 0) - (nodeVoltages[wired[1]] ?? 0);
      readings.set(comp.id, {
        ...zeroReading(comp),
        voltage,
        voltageMagnitude: Math.abs(voltage),
        power: 0,
        valid: true,
      });
    } else {
      readings.set(comp.id, { ...zeroReading(comp), valid: false });
    }
    if (wired.length < 2) {
      warnings.push({
        code: 'unconnected-terminal',
        message: `${comp.label ?? getComponentDef(comp.kind).name} has fewer than two connected terminals, so no current can flow through it.`,
        severity: 'warning',
        componentIds: [comp.id],
      });
    } else if (wired.some((node) => islandOfNode.get(node) !== islandOfNode.get(wired[0]))) {
      warnings.push({
        code: 'terminal-not-common',
        message: `${comp.label ?? getComponentDef(comp.kind).name} is the only link between two separate parts of the circuit, so no steady current can flow through it.`,
        severity: 'warning',
        componentIds: [comp.id],
      });
    }
  }

  // ---- status -----------------------------------------------------------
  const sourceReadings = doc.components
    .filter((c) => isSource(c.kind))
    .map((c) => readings.get(c.id))
    .filter((r): r is ComponentResult => Boolean(r));

  let status: SolveStatus = 'ok';
  if (anySingular) {
    status = 'singular';
    errors.push({
      code: 'singular-system',
      message:
        'This network has no unique solution. Two ideal sources are connected in parallel with different EMFs, or an ideal source is short-circuited.',
      severity: 'error',
    });
  } else if (sourceReadings.some((r) => r.currentMagnitude > 200)) {
    status = 'short-circuit';
    errors.push({
      code: 'short-circuit',
      message:
        'Short circuit detected: an extremely large current flows through an ideal source. Add resistance before closing this path.',
      severity: 'error',
      componentIds: sourceReadings.filter((r) => r.currentMagnitude > 200).map((r) => r.componentId),
    });
  } else if (sourceReadings.length === 0) {
    status = 'no-source';
  } else if (sourceReadings.every((r) => r.currentMagnitude < 1e-9)) {
    status = 'open-circuit';
    warnings.push({
      code: 'open-circuit',
      message: 'No current flows: the circuit is open, so every current is zero.',
      severity: 'warning',
    });
  }

  let totalCurrent: number | null = null;
  let totalResistance: number | null = null;
  let totalPowerDelivered = 0;
  let totalPowerDissipated = 0;

  if (sourceReadings.length === 1) {
    const reading = sourceReadings[0];
    totalCurrent = reading.current;
    if (reading.currentMagnitude > 1e-12 && reading.terminalVoltage !== undefined) {
      totalResistance = Math.abs(reading.terminalVoltage / reading.current);
    } else if (reading.currentMagnitude <= 1e-12) {
      totalResistance = Number.POSITIVE_INFINITY;
    }
  }
  for (const reading of readings.values()) {
    if (reading.kind === 'cell' || reading.kind === 'battery') {
      totalPowerDelivered += reading.deliveredPower ?? 0;
    } else {
      totalPowerDissipated += Math.max(0, reading.power);
    }
  }

  if (islands.filter((i) => i.components.length > 0).length > 1) {
    warnings.push({
      code: 'multiple-islands',
      message:
        'This circuit contains more than one separate network. Each network is solved independently; the circuit will not work until they are connected.',
      severity: 'warning',
    });
  }

  const ok = status !== 'singular' && status !== 'short-circuit';

  return {
    status,
    ok,
    components: Object.fromEntries(readings),
    nodeVoltages,
    groundNodeId,
    warnings,
    errors,
    iterations: totalIterations,
    sourceIds,
    totalCurrent,
    totalResistance,
    totalPowerDelivered,
    totalPowerDissipated,
    probeCurrent,
    islandCount: islands.length,
    topology,
  };
}

function zeroReading(comp: ComponentInstance): ComponentResult {
  return {
    componentId: comp.id,
    kind: comp.kind,
    label: comp.label ?? getComponentDef(comp.kind).name,
    current: 0,
    voltage: 0,
    power: 0,
    currentMagnitude: 0,
    voltageMagnitude: 0,
    resistance: linearResistance(comp),
    valid: true,
  };
}
