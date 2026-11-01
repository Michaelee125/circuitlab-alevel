import {
  connectTerminals,
  createComponent,
  createDocument,
} from '@circuitlab/circuit-core';
import type {
  CircuitDocument,
  ComponentKind,
  ComponentParams,
} from '@circuitlab/circuit-core';

export interface ComponentSpec {
  kind: ComponentKind;
  params?: ComponentParams;
  label?: string;
  x?: number;
  y?: number;
  rotation?: 0 | 90 | 180 | 270;
}

export type Link = [number, string, number, string];

/** Build a document from component specs and index-based terminal links. */
export function buildDoc(
  specs: ComponentSpec[],
  links: Link[],
  name = 'Test circuit',
): CircuitDocument {
  let doc = createDocument(name);
  const ids: string[] = [];
  specs.forEach((spec, index) => {
    const comp = createComponent(spec.kind, spec.x ?? index * 180, spec.y ?? 0, {
      params: spec.params,
      label: spec.label,
      rotation: spec.rotation ?? 0,
    });
    ids.push(comp.id);
    doc = { ...doc, components: [...doc.components, comp] };
  });
  for (const [a, ta, b, tb] of links) {
    const result = connectTerminals(
      doc,
      { componentId: ids[a], terminalId: ta },
      { componentId: ids[b], terminalId: tb },
    );
    if (result.error) throw new Error(`link ${a}:${ta}→${b}:${tb}: ${result.error}`);
    doc = result.doc;
  }
  return doc;
}

export function compId(doc: CircuitDocument, index: number): string {
  return doc.components[index].id;
}

/** Cell terminals: neg / pos. Two-terminal parts: a / b. */
export const SERIES_LDR = (ldrOhms: number): { specs: ComponentSpec[]; links: Link[] } => ({
  specs: [
    { kind: 'cell', params: { emf: 12, internalResistance: 0 } },
    {
      kind: 'ldr',
      params: {
        // pick illuminance so the model produces the requested resistance
        illuminance: ldrLux(ldrOhms),
        referenceResistance: 100,
        gamma: 0.7,
      },
    },
    { kind: 'resistor', params: { resistance: 4 } },
  ],
  links: [
    [0, 'pos', 1, 'a'],
    [1, 'b', 2, 'a'],
    [2, 'b', 0, 'neg'],
  ],
});

export function ldrLux(resistance: number): number {
  const reference = 100;
  const gamma = 0.7;
  return 10 * Math.pow(resistance / reference, -1 / gamma);
}
