import { defaultParamsFor, isKnownKind } from './defs';
import { SCHEMA_VERSION } from './types';
import type {
  CircuitDocument,
  ComponentInstance,
  ComponentParams,
  Rotation,
  Wire,
} from './types';
import { createId } from './ids';

export interface ParseResult {
  ok: boolean;
  doc?: CircuitDocument;
  errors: string[];
}

const VALID_ROTATIONS: Rotation[] = [0, 90, 180, 270];

function num(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeParams(kind: ComponentInstance['kind'], raw: unknown): ComponentParams {
  const defaults = defaultParamsFor(kind);
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const merged: ComponentParams = { ...defaults };

  if ('resistance' in defaults) merged.resistance = num(input.resistance, defaults.resistance ?? 10, 0.01, 1e9);
  if ('emf' in defaults) merged.emf = num(input.emf, defaults.emf ?? 6, 0, 1e6);
  if ('internalResistance' in defaults)
    merged.internalResistance = num(input.internalResistance, defaults.internalResistance ?? 0, 0, 1e9);
  if ('closed' in defaults) merged.closed = typeof input.closed === 'boolean' ? input.closed : Boolean(defaults.closed);
  if ('capacitance' in defaults)
    merged.capacitance = num(input.capacitance, defaults.capacitance ?? 470e-6, 1e-12, 10);
  if ('illuminance' in defaults) merged.illuminance = num(input.illuminance, defaults.illuminance ?? 300, 0, 1e6);
  if ('referenceResistance' in defaults)
    merged.referenceResistance = num(input.referenceResistance, defaults.referenceResistance ?? 100, 0.01, 1e9);
  if ('gamma' in defaults) merged.gamma = num(input.gamma, defaults.gamma ?? 0.7, 0.05, 3);
  if ('temperatureC' in defaults) merged.temperatureC = num(input.temperatureC, defaults.temperatureC ?? 25, -50, 300);
  if ('beta' in defaults) merged.beta = num(input.beta, defaults.beta ?? 3500, 100, 20000);
  if ('saturationCurrent' in defaults)
    merged.saturationCurrent = num(input.saturationCurrent, defaults.saturationCurrent ?? 1e-9, 1e-15, 1e-3);
  if ('ideality' in defaults) merged.ideality = num(input.ideality, defaults.ideality ?? 1.8, 0.5, 8);
  if ('coldResistance' in defaults)
    merged.coldResistance = num(input.coldResistance, defaults.coldResistance ?? 2, 0.05, 1e6);
  if ('thermalCoefficient' in defaults)
    merged.thermalCoefficient = num(input.thermalCoefficient, defaults.thermalCoefficient ?? 1.6, 0, 100);

  return merged;
}

function sanitizeComponent(raw: unknown, errors: string[]): ComponentInstance | null {
  if (!raw || typeof raw !== 'object') {
    errors.push('Skipped a component that is not an object.');
    return null;
  }
  const input = raw as Record<string, unknown>;
  const kind = input.kind;
  if (typeof kind !== 'string' || !isKnownKind(kind)) {
    errors.push(`Skipped a component with unknown kind "${String(kind)}".`);
    return null;
  }
  const id = typeof input.id === 'string' && input.id.length > 0 ? input.id : createId(kind);
  const rotation = VALID_ROTATIONS.includes(input.rotation as Rotation)
    ? (input.rotation as Rotation)
    : 0;
  return {
    id,
    kind,
    x: num(input.x, 0, -1e5, 1e5),
    y: num(input.y, 0, -1e5, 1e5),
    rotation,
    params: sanitizeParams(kind, input.params),
    label: typeof input.label === 'string' ? input.label.slice(0, 24) : undefined,
  };
}

function sanitizeWire(raw: unknown, componentIds: Set<string>, errors: string[]): Wire | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const from = input.from as Record<string, unknown> | undefined;
  const to = input.to as Record<string, unknown> | undefined;
  if (!from || !to) {
    errors.push('Skipped a wire without two endpoints.');
    return null;
  }
  const fromComponent = String(from.componentId ?? '');
  const toComponent = String(to.componentId ?? '');
  const fromTerminal = String(from.terminalId ?? '');
  const toTerminal = String(to.terminalId ?? '');
  if (!componentIds.has(fromComponent) || !componentIds.has(toComponent)) {
    errors.push('Skipped a wire that references a missing component.');
    return null;
  }
  let route: Wire['route'];
  if (Array.isArray(input.route)) {
    const points = input.route
      .filter((point) => point && typeof point === 'object')
      .map((point) => {
        const p = point as Record<string, unknown>;
        return { x: Number(p.x), y: Number(p.y) };
      })
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length >= 2) route = points;
  }
  return {
    id: typeof input.id === 'string' && input.id.length > 0 ? input.id : createId('w'),
    from: { componentId: fromComponent, terminalId: fromTerminal },
    to: { componentId: toComponent, terminalId: toTerminal },
    ...(route ? { route } : {}),
  };
}

/** Coerce arbitrary parsed JSON into a valid document, reporting what was dropped. */
export function deserializeCircuit(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['The file does not contain a circuit object.'] };
  }
  const input = raw as Record<string, unknown>;
  const version = Number(input.schemaVersion ?? SCHEMA_VERSION);
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`Unsupported schema version ${version}. This app supports up to ${SCHEMA_VERSION}.`],
    };
  }
  const componentsRaw = Array.isArray(input.components) ? input.components : [];
  const components: ComponentInstance[] = [];
  for (const c of componentsRaw) {
    const comp = sanitizeComponent(c, errors);
    if (comp) components.push(comp);
  }
  const ids = new Set(components.map((c) => c.id));
  const wiresRaw = Array.isArray(input.wires) ? input.wires : [];
  const wires: Wire[] = [];
  for (const w of wiresRaw) {
    const wire = sanitizeWire(w, ids, errors);
    if (wire) wires.push(wire);
  }
  const now = new Date().toISOString();
  const doc: CircuitDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : createId('circuit'),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 120) : 'Imported circuit',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
    components,
    wires,
    meta: (input.meta && typeof input.meta === 'object' ? input.meta : {}) as CircuitDocument['meta'],
  };
  if (components.length === 0 && componentsRaw.length > 0) {
    return { ok: false, errors: [...errors, 'No usable components were found in the file.'] };
  }
  return { ok: true, doc, errors };
}

export function serializeCircuit(doc: CircuitDocument, pretty = true): string {
  return JSON.stringify(doc, null, pretty ? 2 : 0);
}

export function parseCircuitJSON(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  return deserializeCircuit(raw);
}

