import { getComponentDef, isKnownKind } from './defs';
import { componentTerminals } from './geometry';
import { buildTopology, pinKey } from './topology';
import { overlappingComponentPairs } from './model';
import type { CircuitDocument, ValidationIssue } from './types';

/**
 * Structural validation of a circuit document. Electrical behaviour
 * (singular systems, shorts) is handled by the solver diagnostics.
 */
export function validateCircuit(doc: CircuitDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const seen = new Set<string>();
  for (const comp of doc.components) {
    if (seen.has(comp.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-component',
        message: `Duplicate component id "${comp.id}".`,
        componentIds: [comp.id],
      });
    }
    seen.add(comp.id);
    if (!isKnownKind(comp.kind)) {
      issues.push({
        severity: 'error',
        code: 'unknown-component',
        message: `Unknown component kind "${comp.kind as string}".`,
        componentIds: [comp.id],
      });
    }
    if (!Number.isFinite(comp.x) || !Number.isFinite(comp.y)) {
      issues.push({
        severity: 'error',
        code: 'invalid-position',
        message: `Component "${comp.id}" has an invalid position.`,
        componentIds: [comp.id],
      });
    }
  }

  const componentById = new Map(doc.components.map((c) => [c.id, c]));
  for (const wire of doc.wires) {
    for (const end of [wire.from, wire.to]) {
      const comp = componentById.get(end.componentId);
      if (!comp) {
        issues.push({
          severity: 'error',
          code: 'dangling-wire',
          message: `Wire "${wire.id}" references a missing component.`,
          wireIds: [wire.id],
        });
        continue;
      }
      if (!isKnownKind(comp.kind)) continue;
      const def = getComponentDef(comp.kind);
      if (!def.terminals.some((t) => t.id === end.terminalId)) {
        issues.push({
          severity: 'error',
          code: 'unknown-terminal',
          message: `Wire "${wire.id}" references terminal "${end.terminalId}" which "${comp.kind}" does not have.`,
          wireIds: [wire.id],
          componentIds: [comp.id],
        });
      }
    }
    if (wire.from.componentId === wire.to.componentId && wire.from.terminalId === wire.to.terminalId) {
      issues.push({
        severity: 'error',
        code: 'self-wire',
        message: `Wire "${wire.id}" connects a terminal to itself.`,
        wireIds: [wire.id],
      });
    }
  }

  // components with no wire at all
  for (const comp of doc.components) {
    if (!isKnownKind(comp.kind)) continue;
    const pins = componentTerminals(comp).map((t) => pinKey(comp.id, t.id));
    const attached = pins.some((p) =>
      doc.wires.some(
        (w) =>
          pinKey(w.from.componentId, w.from.terminalId) === p ||
          pinKey(w.to.componentId, w.to.terminalId) === p,
      ),
    );
    if (!attached && doc.components.length > 1) {
      issues.push({
        severity: 'warning',
        code: 'unconnected-component',
        message: `${getComponentDef(comp.kind).name} "${comp.label ?? comp.id}" is not connected to the circuit.`,
        componentIds: [comp.id],
      });
    }
  }

  const sources = doc.components.filter((c) => c.kind === 'cell' || c.kind === 'battery');
  if (sources.length === 0 && doc.components.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'no-source',
      message: 'The circuit has no cell or battery, so no current can flow.',
    });
  }

  // A source shorted by wires alone is a definite error.
  const topology = buildTopology(doc);
  const pinKeyToNode = topology.nodeOfPin;
  for (const source of sources) {
    const pos = pinKeyToNode[pinKey(source.id, 'pos')];
    const neg = pinKeyToNode[pinKey(source.id, 'neg')];
    if (pos && neg && pos === neg) {
      issues.push({
        severity: 'error',
        code: 'shorted-source',
        message: `${getComponentDef(source.kind).name} "${source.label ?? source.id}" is short-circuited by wires.`,
        componentIds: [source.id],
      });
    }
  }

  for (const [a, b] of overlappingComponentPairs(doc)) {
    issues.push({
      severity: 'warning',
      code: 'overlapping-components',
      message: `Components "${componentById.get(a)?.label ?? a}" and "${componentById.get(b)?.label ?? b}" overlap on the canvas.`,
      componentIds: [a, b],
    });
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
