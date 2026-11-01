/**
 * Shared circuit data model — used by every platform (web now, WeChat later).
 * This package is framework-free: no React, no DOM, no PixiJS.
 */

export const SCHEMA_VERSION = 1 as const;

export type ComponentKind =
  | 'cell'
  | 'battery'
  | 'resistor'
  | 'variable-resistor'
  | 'potentiometer'
  | 'lamp'
  | 'switch'
  | 'ammeter'
  | 'voltmeter'
  | 'ldr'
  | 'thermistor'
  | 'capacitor'
  | 'diode';

export type ComponentCategory =
  | 'source'
  | 'passive'
  | 'meter'
  | 'sensor'
  | 'semiconductor';

export type Rotation = 0 | 90 | 180 | 270;

/** Physical parameters of a component. Values are SI unless the field says otherwise. */
export interface ComponentParams {
  /** Resistance in ohms (resistor / variable resistor / potentiometer track). */
  resistance?: number;
  /** Wiper position of a potentiometer track, 0…1 (0 = terminal A, 1 = terminal B). */
  wiper?: number;
  /** Electromotive force in volts (cell / battery). */
  emf?: number;
  /** Internal resistance in ohms (cell / battery). */
  internalResistance?: number;
  /** Switch state. */
  closed?: boolean;
  /** Capacitance in farads. */
  capacitance?: number;
  /** LDR illuminance in lux. */
  illuminance?: number;
  /** LDR resistance at the reference illuminance, in ohms. */
  referenceResistance?: number;
  /** LDR sensitivity exponent. */
  gamma?: number;
  /** Thermistor temperature in degrees Celsius. */
  temperatureC?: number;
  /** Thermistor resistance at 25 °C, in ohms. */
  beta?: number;
  /** Diode saturation current in amperes. */
  saturationCurrent?: number;
  /** Diode ideality factor. */
  ideality?: number;
  /** Filament lamp cold resistance in ohms. */
  coldResistance?: number;
  /** Filament lamp resistance/temperature coefficient in 1/W. */
  thermalCoefficient?: number;
}

export interface ComponentInstance {
  id: string;
  kind: ComponentKind;
  /** World-space centre, in circuit units (1 unit = 1 px at zoom 1). */
  x: number;
  y: number;
  rotation: Rotation;
  params: ComponentParams;
  /** Optional user override for the auto-generated reference designator (e.g. "R1"). */
  label?: string;
}

export interface TerminalDef {
  id: string;
  /** Local coordinates relative to the component centre, y down. */
  x: number;
  y: number;
  label: string;
}

export interface ComponentDef {
  kind: ComponentKind;
  category: ComponentCategory;
  width: number;
  height: number;
  terminals: TerminalDef[];
  defaultParams: ComponentParams;
  labelPrefix: string;
  /** English display name (UI translations live in @circuitlab/i18n). */
  name: string;
  description: string;
  /** True when the component has a non-linear voltage/current relationship. */
  nonlinear?: boolean;
}

export interface WireEndpoint {
  componentId: string;
  terminalId: string;
}

export interface WireRoutePoint {
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  from: WireEndpoint;
  to: WireEndpoint;
  /** Optional manual orthogonal route. Ignored when its ends no longer match the terminals. */
  route?: WireRoutePoint[];
}

export interface CircuitMeta {
  experimentId?: string;
  notes?: string;
  author?: string;
}

export interface CircuitDocument {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  components: ComponentInstance[];
  wires: Wire[];
  meta?: CircuitMeta;
}

export interface Point {
  x: number;
  y: number;
}

export interface Pin {
  /** `${componentId}:${terminalId}` */
  key: string;
  componentId: string;
  terminalId: string;
  x: number;
  y: number;
}

export interface CircuitNode {
  id: string;
  pins: Pin[];
  x: number;
  y: number;
}

export interface Topology {
  pins: Pin[];
  pinByKey: Record<string, Pin>;
  /** pin key -> node id (undefined when the pin is not connected to anything). */
  nodeOfPin: Record<string, string | undefined>;
  nodes: CircuitNode[];
  nodeById: Record<string, CircuitNode>;
  doc: CircuitDocument;
}

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  /** English diagnostic used by tests and logs. */
  message: string;
  componentIds?: string[];
  wireIds?: string[];
}

export type Language = 'en' | 'zh' | 'bilingual';
export type ViewMode = 'schematic' | 'realistic';
export type ThemeMode = 'dark' | 'light';
export type QualityLevel = 'high' | 'medium' | 'low';
export type AppMode = 'explore' | 'guided';
