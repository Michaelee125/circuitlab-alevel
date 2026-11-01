import type {
  ComponentDef,
  ComponentKind,
  ComponentParams,
  TerminalDef,
} from './types';

/**
 * Terminal geometry is defined for the unrotated component. The positive
 * terminal of a source is on the right at rotation 0.
 */
const horizontal = (id: string, label: string): TerminalDef[] => [
  { id, x: -52, y: 0, label },
];

const twoTerminal = (half = 52): TerminalDef[] => [
  { id: 'a', x: -half, y: 0, label: 'A' },
  { id: 'b', x: half, y: 0, label: 'B' },
];

const sourceTerminals = (): TerminalDef[] => [
  { id: 'neg', x: -52, y: 0, label: '−' },
  { id: 'pos', x: 52, y: 0, label: '+' },
];

export const COMPONENT_DEFS: Record<ComponentKind, ComponentDef> = {
  cell: {
    kind: 'cell',
    category: 'source',
    width: 104,
    height: 60,
    terminals: sourceTerminals(),
    defaultParams: { emf: 6, internalResistance: 0 },
    labelPrefix: 'E',
    name: 'Cell',
    description: 'Ideal chemical source with an adjustable internal resistance.',
  },
  battery: {
    kind: 'battery',
    category: 'source',
    width: 104,
    height: 60,
    terminals: sourceTerminals(),
    defaultParams: { emf: 12, internalResistance: 0 },
    labelPrefix: 'B',
    name: 'Battery',
    description: 'Multi-cell source. EMF and internal resistance are adjustable.',
  },
  resistor: {
    kind: 'resistor',
    category: 'passive',
    width: 104,
    height: 44,
    terminals: twoTerminal(),
    defaultParams: { resistance: 10 },
    labelPrefix: 'R',
    name: 'Resistor',
    description: 'Fixed resistor. Current and voltage obey Ohm’s law.',
  },
  'variable-resistor': {
    kind: 'variable-resistor',
    category: 'passive',
    width: 104,
    height: 52,
    terminals: twoTerminal(),
    defaultParams: { resistance: 20 },
    labelPrefix: 'RV',
    name: 'Variable resistor',
    description: 'Rheostat used to control current or act as a potential divider.',
  },
  lamp: {
    kind: 'lamp',
    category: 'passive',
    width: 104,
    height: 60,
    terminals: twoTerminal(),
    defaultParams: { coldResistance: 2, thermalCoefficient: 1.6 },
    labelPrefix: 'L',
    name: 'Filament lamp',
    description: 'Non-ohmic lamp: resistance rises as the filament heats up.',
    nonlinear: true,
  },
  switch: {
    kind: 'switch',
    category: 'passive',
    width: 104,
    height: 44,
    terminals: twoTerminal(),
    defaultParams: { closed: true },
    labelPrefix: 'S',
    name: 'Switch',
    description: 'Opens or closes a branch of the circuit.',
  },
  ammeter: {
    kind: 'ammeter',
    category: 'meter',
    width: 88,
    height: 60,
    terminals: twoTerminal(44),
    defaultParams: {},
    labelPrefix: 'A',
    name: 'Ammeter',
    description: 'Ideal ammeter: negligible resistance, connected in series.',
  },
  voltmeter: {
    kind: 'voltmeter',
    category: 'meter',
    width: 88,
    height: 60,
    terminals: twoTerminal(44),
    defaultParams: {},
    labelPrefix: 'V',
    name: 'Voltmeter',
    description: 'Ideal voltmeter: effectively infinite resistance, connected in parallel.',
  },
  ldr: {
    kind: 'ldr',
    category: 'sensor',
    width: 104,
    height: 60,
    terminals: twoTerminal(),
    defaultParams: { illuminance: 300, referenceResistance: 100, gamma: 0.7 },
    labelPrefix: 'LDR',
    name: 'LDR',
    description: 'Light-dependent resistor: resistance falls as light intensity rises.',
  },
  thermistor: {
    kind: 'thermistor',
    category: 'sensor',
    width: 104,
    height: 60,
    terminals: twoTerminal(),
    defaultParams: { temperatureC: 25, referenceResistance: 1000, beta: 3500 },
    labelPrefix: 'TH',
    name: 'NTC thermistor',
    description: 'Negative temperature coefficient thermistor: resistance falls as it warms.',
  },
  capacitor: {
    kind: 'capacitor',
    category: 'passive',
    width: 88,
    height: 60,
    terminals: twoTerminal(44),
    defaultParams: { capacitance: 470e-6 },
    labelPrefix: 'C',
    name: 'Capacitor',
    description: 'Stores charge. Blocks steady direct current.',
  },
  diode: {
    kind: 'diode',
    category: 'semiconductor',
    width: 104,
    height: 52,
    terminals: twoTerminal(),
    defaultParams: { saturationCurrent: 1e-9, ideality: 1.8 },
    labelPrefix: 'D',
    name: 'Diode',
    description: 'Semiconductor diode: conducts in forward bias only.',
    nonlinear: true,
  },
};

export const COMPONENT_KINDS = Object.keys(COMPONENT_DEFS) as ComponentKind[];

/** Categories rendered in the component library, in display order. */
export const COMPONENT_CATEGORIES = [
  'source',
  'passive',
  'meter',
  'sensor',
  'semiconductor',
] as const;

export function getComponentDef(kind: ComponentKind): ComponentDef {
  const def = COMPONENT_DEFS[kind];
  if (!def) throw new Error(`Unknown component kind: ${kind as string}`);
  return def;
}

export function isKnownKind(kind: string): kind is ComponentKind {
  return Object.prototype.hasOwnProperty.call(COMPONENT_DEFS, kind);
}

export function defaultParamsFor(kind: ComponentKind): ComponentParams {
  return { ...getComponentDef(kind).defaultParams };
}

/** True when the component has exactly the two terminals a/b. */
export function isTwoTerminal(kind: ComponentKind): boolean {
  return getComponentDef(kind).terminals.length === 2;
}
