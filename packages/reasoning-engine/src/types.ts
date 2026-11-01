import type { CircuitDocument } from '@circuitlab/circuit-core';
import type { CircuitSolution } from '@circuitlab/physics-engine';

export type Direction = 'increase' | 'decrease' | 'unchanged';

export interface QuantityChange {
  before: number;
  after: number;
  delta: number;
  direction: Direction;
  unit: string;
}

export type PhysicsLaw =
  | 'ohms-law'
  | 'series-resistance'
  | 'parallel-voltage'
  | 'kirchhoff-current'
  | 'kirchhoff-voltage'
  | 'potential-divider'
  | 'ldr-property'
  | 'thermistor-property'
  | 'internal-resistance';

export type StepKind = 'cause' | 'change' | 'consequence' | 'law' | 'conclusion';

export interface ReasoningStep {
  id: string;
  kind: StepKind;
  law: PhysicsLaw;
  en: string;
  zh: string;
  quantities?: Record<string, QuantityChange>;
  highlight?: string[];
}

export interface MarkingPoint {
  en: string;
  zh: string;
  /** Marks are only awarded when the corresponding statement is present. */
  required?: boolean;
}

export interface ExplainResult {
  supported: boolean;
  ruleId?: string;
  title: { en: string; zh: string };
  cause?: { en: string; zh: string };
  steps: ReasoningStep[];
  markingPoints: MarkingPoint[];
  answer: { en: string; zh: string };
  summary: { en: string; zh: string };
  changes: Record<string, QuantityChange>;
  highlights: string[];
  reason?: { en: string; zh: string };
  /** Always true for the built-in engine: these are software-authored practice points. */
  markingScheme: 'software-authored';
}

export interface ExplainInput {
  before: CircuitDocument;
  after: CircuitDocument;
  beforeSolution: CircuitSolution;
  afterSolution: CircuitSolution;
}

export interface ComparisonRow {
  componentId: string;
  label: string;
  kind: string;
  quantity: 'resistance' | 'current' | 'voltage' | 'power' | 'emf';
  unit: string;
  before: number;
  after: number;
  direction: Direction;
}
