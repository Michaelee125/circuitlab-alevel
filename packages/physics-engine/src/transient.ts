import { buildTopology, getComponentDef, pinKey } from '@circuitlab/circuit-core';
import type { CircuitDocument } from '@circuitlab/circuit-core';
import { solveCircuit } from './solve';

export interface TransientOptions {
  /** Capacitor voltage at t = 0 (V). */
  initialVoltage?: number;
  /** Simulation window in seconds. Defaults to 5 time constants. */
  duration?: number;
  steps?: number;
}

export interface TransientPoint {
  t: number;
  voltage: number;
  current: number;
  charge: number;
}

export interface TransientSolution {
  ok: boolean;
  points: TransientPoint[];
  timeConstant: number;
  finalVoltage: number;
  initialVoltage: number;
  equivalentResistance: number;
  capacitance: number;
  mode: 'charging' | 'discharging' | 'static';
  capacitorId?: string;
  warnings: string[];
}

const fail = (warnings: string[]): TransientSolution => ({
  ok: false,
  points: [],
  timeConstant: 0,
  finalVoltage: 0,
  initialVoltage: 0,
  equivalentResistance: 0,
  capacitance: 0,
  mode: 'static',
  warnings,
});

/**
 * Analytic RC transient for a circuit with exactly one capacitor.
 *
 * The rest of the circuit is reduced to its Thévenin equivalent at the
 * capacitor terminals (open-circuit voltage from a DC solve, resistance from a
 * 1 V probe with all EMFs set to zero), which gives:
 *
 *   Vc(t) = V∞ + (V₀ − V∞)·e^(−t/τ),  τ = R_th·C
 *   i(t)  = (V∞ − Vc(t)) / R_th
 *
 * The capacitor itself is removed from the DC network because it is an open
 * circuit at steady state.
 */
export function solveRCTransient(doc: CircuitDocument, options: TransientOptions = {}): TransientSolution {
  const capacitors = doc.components.filter((c) => c.kind === 'capacitor');
  if (capacitors.length === 0) return fail(['Add a capacitor to the circuit to run an RC transient.']);
  if (capacitors.length > 1) {
    return fail([
      'The RC transient model supports exactly one capacitor. Remove the extra capacitors or analyse them separately.',
    ]);
  }
  const capacitor = capacitors[0];
  const capacitance = Math.max(1e-12, capacitor.params.capacitance ?? 470e-6);

  const topology = buildTopology(doc);
  const def = getComponentDef('capacitor');
  const [terminalA, terminalB] = def.terminals;
  const nodeA = topology.nodeOfPin[pinKey(capacitor.id, terminalA.id)];
  const nodeB = topology.nodeOfPin[pinKey(capacitor.id, terminalB.id)];
  if (!nodeA || !nodeB) return fail(['Connect both capacitor terminals before running the transient.']);

  const steady = solveCircuit(doc);
  const vA = steady.nodeVoltages[nodeA];
  const vB = steady.nodeVoltages[nodeB];
  if (vA === undefined || vB === undefined) {
    return fail(['The capacitor is not part of a complete circuit.']);
  }
  const finalVoltage = vA - vB;

  const probe = solveCircuit(doc, {
    zeroSources: true,
    probe: { nodeA, nodeB, voltage: 1 },
  });
  if (probe.probeCurrent === undefined || !Number.isFinite(probe.probeCurrent)) {
    return fail(['Could not determine the equivalent resistance seen by the capacitor.']);
  }
  const equivalentResistance = Math.abs(1 / probe.probeCurrent);
  if (!Number.isFinite(equivalentResistance) || equivalentResistance < 1e-4) {
    return fail([
      'The capacitor is connected directly across an ideal voltage source, so the current would be unbounded. Add a resistor in series.',
    ]);
  }

  const timeConstant = equivalentResistance * capacitance;
  const initialVoltage = Math.min(
    Math.max(options.initialVoltage ?? 0, -1e6),
    1e6,
  );
  const duration = Math.max(1e-6, options.duration ?? timeConstant * 5);
  const steps = Math.max(10, Math.min(2000, options.steps ?? 200));
  const warnings: string[] = [];

  if (timeConstant > duration * 1e3) {
    warnings.push('The time constant is very long compared with the window; the capacitor barely charges.');
  }

  const points: TransientPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (duration * i) / steps;
    const decay = Math.exp(-t / timeConstant);
    const voltage = finalVoltage + (initialVoltage - finalVoltage) * decay;
    const current = (finalVoltage - voltage) / equivalentResistance;
    points.push({ t, voltage, current, charge: capacitance * voltage });
  }

  const delta = finalVoltage - initialVoltage;
  const mode: TransientSolution['mode'] =
    Math.abs(delta) < 1e-9 ? 'static' : delta > 0 ? 'charging' : 'discharging';

  return {
    ok: true,
    points,
    timeConstant,
    finalVoltage,
    initialVoltage,
    equivalentResistance,
    capacitance,
    mode,
    capacitorId: capacitor.id,
    warnings,
  };
}

/** Time at which the capacitor reaches a given fraction of its final change. */
export function timeToFraction(timeConstant: number, fraction: number): number {
  if (fraction <= 0) return 0;
  if (fraction >= 1) return Number.POSITIVE_INFINITY;
  return -timeConstant * Math.log(1 - fraction);
}
