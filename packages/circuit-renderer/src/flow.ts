import type { Wire } from '@circuitlab/circuit-core';
import type { CircuitSolution } from '@circuitlab/physics-engine';

/**
 * Direction of conventional current along a wire.
 *
 * `current` is the magnitude in amperes and `direction` is +1 when the current
 * flows from `wire.from` to `wire.to`, -1 when it flows the other way.
 *
 * Terminal currents come from the solver and are positive when the current
 * enters the component at that terminal. Using the per-terminal value (rather
 * than a component-wide current) keeps the animation correct for sources,
 * multi-terminal parts such as the sliding rheostat, and meters.
 */
export function wireFlow(
  wire: Wire,
  solution: CircuitSolution,
): { current: number; direction: number } | null {
  const from = solution.components[wire.from.componentId];
  const to = solution.components[wire.to.componentId];
  const fromCurrent = from?.terminalCurrents?.[wire.from.terminalId];
  const toCurrent = to?.terminalCurrents?.[wire.to.terminalId];
  const fromMagnitude = fromCurrent === undefined ? Number.POSITIVE_INFINITY : Math.abs(fromCurrent);
  const toMagnitude = toCurrent === undefined ? Number.POSITIVE_INFINITY : Math.abs(toCurrent);
  if (!Number.isFinite(Math.min(fromMagnitude, toMagnitude))) return null;

  // Use the *smaller* terminal current. Where several wires meet at one
  // terminal (a parallel branch or a voltmeter tap), the shared terminal
  // carries the total, while the other end carries only this wire's current.
  // This also suppresses the animation on ideal-voltmeter connections.
  if (fromMagnitude <= toMagnitude) {
    if (fromMagnitude < 1e-9) return null;
    return {
      current: fromMagnitude,
      // Entering the component at the from terminal means the wire current runs
      // towards `from`, opposite the stored wire direction.
      direction: (fromCurrent ?? 0) > 0 ? -1 : 1,
    };
  }
  if (toMagnitude < 1e-9) return null;
  return {
    current: toMagnitude,
    // Entering at the to terminal means the wire current runs towards `to`.
    direction: (toCurrent ?? 0) > 0 ? 1 : -1,
  };
}
