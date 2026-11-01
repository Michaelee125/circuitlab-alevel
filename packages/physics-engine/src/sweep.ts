import type { CircuitDocument } from '@circuitlab/circuit-core';
import { solveCircuit, type ComponentResult } from './solve';

export interface CharacteristicPoint {
  /** Voltage across the measured component (V). */
  voltage: number;
  /** Current through the measured component (A). */
  current: number;
  /** Driving EMF used for this sample (V). */
  emf: number;
}

export interface SweepResult {
  ok: boolean;
  points: CharacteristicPoint[];
  warnings: string[];
}

export interface SweepOptions {
  from?: number;
  to?: number;
  steps?: number;
  /** Component whose characteristic is measured; defaults to the first non-source. */
  componentId?: string;
}

/**
 * Measure an I–V characteristic by sweeping the EMF of the first source and
 * solving the real circuit at every point. Nothing here is interpolated or
 * hard-coded: the plotted points are solver output.
 */
export function sweepCharacteristic(doc: CircuitDocument, options: SweepOptions = {}): SweepResult {
  const source = doc.components.find((c) => c.kind === 'cell' || c.kind === 'battery');
  if (!source) return { ok: false, points: [], warnings: ['Add a source before sweeping a characteristic.'] };
  const target =
    doc.components.find((c) => c.id === options.componentId) ??
    doc.components.find((c) => c.kind !== 'cell' && c.kind !== 'battery' && c.kind !== 'ammeter' && c.kind !== 'voltmeter');
  if (!target) return { ok: false, points: [], warnings: ['No component to measure.'] };

  const from = options.from ?? 0;
  const to = options.to ?? 6;
  const steps = Math.max(2, Math.min(400, options.steps ?? 40));
  const warnings: string[] = [];
  const points: CharacteristicPoint[] = [];
  let hadError = false;

  for (let i = 0; i <= steps; i += 1) {
    const emf = from + ((to - from) * i) / steps;
    const probeDoc: CircuitDocument = {
      ...doc,
      components: doc.components.map((c) =>
        c.id === source.id ? { ...c, params: { ...c.params, emf } } : c,
      ),
    };
    const solution = solveCircuit(probeDoc);
    const reading: ComponentResult | undefined = solution.components[target.id];
    if (!solution.ok) hadError = true;
    if (!solution.ok || !reading || !reading.valid) {
      if (solution.errors[0]) warnings.push(solution.errors[0].message);
      continue;
    }
    points.push({ voltage: reading.voltage, current: reading.current, emf });
  }

  return { ok: points.length > 0 && !hadError, points, warnings: [...new Set(warnings)] };
}
