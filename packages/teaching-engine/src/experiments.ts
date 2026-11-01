import {
  connectTerminals,
  createComponent,
  createDocument,
} from '@circuitlab/circuit-core';
import type {
  CircuitDocument,
  ComponentKind,
  ComponentParams,
  Rotation,
} from '@circuitlab/circuit-core';
import { ldrIlluminanceForResistance, sweepCharacteristic, solveCircuit } from '@circuitlab/physics-engine';

export type ChartKind = 'none' | 'vi' | 'iv' | 'vt' | 'it';

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface ExperimentAction {
  id: string;
  label: LocalizedText;
  apply: (doc: CircuitDocument) => CircuitDocument;
}

export interface TransientSpec {
  mode: 'charge' | 'discharge';
  initialVoltage: number;
  duration: number;
}

export interface DatasetPoint {
  x: number;
  y: number;
}

export interface Experiment {
  id: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  level: 'IGCSE' | 'A-Level';
  topics: string[];
  chart: ChartKind;
  sweep?: { from: number; to: number; steps: number };
  transient?: TransientSpec;
  instructions: { en: string[]; zh: string[] };
  actions: ExperimentAction[];
  build: () => CircuitDocument;
  dataset?: (doc: CircuitDocument) => DatasetPoint[];
  axisLabels?: { x: LocalizedText; y: LocalizedText };
  completed: boolean;
}

interface CompSpec {
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  rotation?: Rotation;
  params?: ComponentParams;
}

type Link = [string, string, string, string];

function buildExperimentDoc(name: string, comps: CompSpec[], links: Link[]): CircuitDocument {
  let doc = createDocument(name);
  const ids = new Map<string, string>();
  for (const spec of comps) {
    const comp = createComponent(spec.kind, spec.x, spec.y, {
      label: spec.label,
      rotation: spec.rotation ?? 0,
      params: spec.params,
    });
    ids.set(spec.label, comp.id);
    doc = { ...doc, components: [...doc.components, comp] };
  }
  for (const [labelA, terminalA, labelB, terminalB] of links) {
    const a = ids.get(labelA);
    const b = ids.get(labelB);
    if (!a || !b) throw new Error(`Unknown experiment component ${labelA} or ${labelB}`);
    const result = connectTerminals(
      doc,
      { componentId: a, terminalId: terminalA },
      { componentId: b, terminalId: terminalB },
    );
    if (result.error) throw new Error(result.error);
    doc = result.doc;
  }
  return doc;
}

const LDR_BASE = { referenceResistance: 100, gamma: 0.7 };

function setLdrLight(doc: CircuitDocument, ohms: number): CircuitDocument {
  return {
    ...doc,
    components: doc.components.map((c) =>
      c.kind === 'ldr'
        ? {
            ...c,
            params: {
              ...c.params,
              illuminance: ldrIlluminanceForResistance(ohms, {
                referenceResistance: c.params.referenceResistance ?? 100,
                gamma: c.params.gamma ?? 0.7,
              }),
            },
          }
        : c,
    ),
  };
}

function setParam(doc: CircuitDocument, label: string, params: ComponentParams): CircuitDocument {
  return {
    ...doc,
    updatedAt: new Date().toISOString(),
    components: doc.components.map((c) =>
      c.label === label ? { ...c, params: { ...c.params, ...params } } : c,
    ),
  };
}

// ---------------------------------------------------------------------------
// Internal-resistance dataset: sweep the rheostat with the real solver
// ---------------------------------------------------------------------------

export function internalResistanceDataset(doc: CircuitDocument): DatasetPoint[] {
  const rheostat = doc.components.find((c) => c.kind === 'variable-resistor');
  const source = doc.components.find((c) => c.kind === 'cell' || c.kind === 'battery');
  if (!rheostat || !source) return [];
  const points: DatasetPoint[] = [];
  for (let step = 0; step <= 10; step += 1) {
    const resistance = 0.5 + step * 0.35;
    const variant: CircuitDocument = {
      ...doc,
      components: doc.components.map((c) =>
        c.id === rheostat.id ? { ...c, params: { ...c.params, resistance } } : c,
      ),
    };
    const solution = solveCircuit(variant);
    if (!solution.ok) continue;
    const current = Math.abs(solution.components[source.id]?.currentMagnitude ?? 0);
    const terminal = Math.abs(solution.components[source.id]?.terminalVoltage ?? 0);
    if (current > 1e-6) points.push({ x: current, y: terminal });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

const seriesCircuit = (): CircuitDocument =>
  buildExperimentDoc(
    'Series circuit',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 6 } },
      { kind: 'resistor', label: 'R1', x: 380, y: 260, params: { resistance: 10 } },
      { kind: 'resistor', label: 'R2', x: 620, y: 260, params: { resistance: 20 } },
      { kind: 'ammeter', label: 'A1', x: 860, y: 260 },
      { kind: 'voltmeter', label: 'V1', x: 620, y: 420 },
    ],
    [
      ['E1', 'pos', 'R1', 'a'],
      ['R1', 'b', 'R2', 'a'],
      ['R2', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['R2', 'a', 'V1', 'a'],
      ['R2', 'b', 'V1', 'b'],
    ],
  );

const parallelCircuit = (): CircuitDocument =>
  buildExperimentDoc(
    'Parallel circuit',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 300, params: { emf: 6 } },
      { kind: 'resistor', label: 'R1', x: 520, y: 180, params: { resistance: 10 } },
      { kind: 'resistor', label: 'R2', x: 520, y: 420, params: { resistance: 20 } },
      { kind: 'ammeter', label: 'A1', x: 320, y: 300 },
      { kind: 'voltmeter', label: 'V1', x: 760, y: 180 },
    ],
    [
      ['E1', 'pos', 'A1', 'a'],
      ['A1', 'b', 'R1', 'a'],
      ['A1', 'b', 'R2', 'a'],
      ['R1', 'b', 'E1', 'neg'],
      ['R2', 'b', 'E1', 'neg'],
      ['R1', 'a', 'V1', 'a'],
      ['R1', 'b', 'V1', 'b'],
    ],
  );

const ohmsLaw = (): CircuitDocument =>
  buildExperimentDoc(
    "Ohm's law",
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 6 } },
      { kind: 'resistor', label: 'R1', x: 400, y: 260, params: { resistance: 12 } },
      { kind: 'ammeter', label: 'A1', x: 640, y: 260 },
      { kind: 'voltmeter', label: 'V1', x: 400, y: 420 },
    ],
    [
      ['E1', 'pos', 'R1', 'a'],
      ['R1', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['R1', 'a', 'V1', 'a'],
      ['R1', 'b', 'V1', 'b'],
    ],
  );

const potentialDivider = (): CircuitDocument =>
  buildExperimentDoc(
    'Potential divider',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 12 } },
      { kind: 'resistor', label: 'R1', x: 400, y: 260, params: { resistance: 4 } },
      { kind: 'resistor', label: 'R2', x: 640, y: 260, params: { resistance: 8 } },
      { kind: 'voltmeter', label: 'V2', x: 640, y: 420 },
    ],
    [
      ['E1', 'pos', 'R1', 'a'],
      ['R1', 'b', 'R2', 'a'],
      ['R2', 'b', 'E1', 'neg'],
      ['R2', 'a', 'V2', 'a'],
      ['R2', 'b', 'V2', 'b'],
    ],
  );

const ldrCircuit = (): CircuitDocument =>
  buildExperimentDoc(
    'LDR circuit',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 12 } },
      {
        kind: 'ldr',
        label: 'LDR1',
        x: 400,
        y: 260,
        params: { ...LDR_BASE, illuminance: ldrIlluminanceForResistance(8, LDR_BASE) },
      },
      { kind: 'resistor', label: 'R1', x: 640, y: 260, params: { resistance: 4 } },
      { kind: 'ammeter', label: 'A1', x: 860, y: 260 },
      { kind: 'voltmeter', label: 'V1', x: 640, y: 420 },
    ],
    [
      ['E1', 'pos', 'LDR1', 'a'],
      ['LDR1', 'b', 'R1', 'a'],
      ['R1', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['R1', 'a', 'V1', 'a'],
      ['R1', 'b', 'V1', 'b'],
    ],
  );

const thermistorCircuit = (): CircuitDocument =>
  buildExperimentDoc(
    'Thermistor circuit',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 12 } },
      {
        kind: 'thermistor',
        label: 'TH1',
        x: 400,
        y: 260,
        params: { temperatureC: 25, referenceResistance: 1000, beta: 3500 },
      },
      { kind: 'resistor', label: 'R1', x: 640, y: 260, params: { resistance: 1000 } },
      { kind: 'ammeter', label: 'A1', x: 860, y: 260 },
      { kind: 'voltmeter', label: 'V1', x: 640, y: 420 },
    ],
    [
      ['E1', 'pos', 'TH1', 'a'],
      ['TH1', 'b', 'R1', 'a'],
      ['R1', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['R1', 'a', 'V1', 'a'],
      ['R1', 'b', 'V1', 'b'],
    ],
  );

const internalResistance = (): CircuitDocument =>
  buildExperimentDoc(
    'Internal resistance',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 6, internalResistance: 0.5 } },
      { kind: 'variable-resistor', label: 'RV1', x: 420, y: 260, params: { resistance: 2.5 } },
      { kind: 'ammeter', label: 'A1', x: 660, y: 260 },
      { kind: 'voltmeter', label: 'V1', x: 140, y: 420 },
    ],
    [
      ['E1', 'pos', 'RV1', 'a'],
      ['RV1', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['E1', 'pos', 'V1', 'b'],
      ['E1', 'neg', 'V1', 'a'],
    ],
  );

const ivCharacteristics = (): CircuitDocument =>
  buildExperimentDoc(
    'I–V characteristics',
    [
      { kind: 'cell', label: 'E1', x: 140, y: 260, params: { emf: 6 } },
      { kind: 'lamp', label: 'L1', x: 420, y: 260, params: { coldResistance: 2, thermalCoefficient: 0.5 } },
      { kind: 'ammeter', label: 'A1', x: 660, y: 260 },
      { kind: 'voltmeter', label: 'V1', x: 420, y: 420 },
    ],
    [
      ['E1', 'pos', 'L1', 'a'],
      ['L1', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['L1', 'a', 'V1', 'a'],
      ['L1', 'b', 'V1', 'b'],
    ],
  );

const ldrParallelCircuit = (): CircuitDocument =>
  buildExperimentDoc(
    'LDR parallel circuit',
    [
      { kind: 'cell', label: 'E1', x: 120, y: 300, params: { emf: 12 } },
      {
        kind: 'ldr',
        label: 'LDR1',
        x: 420,
        y: 180,
        params: { ...LDR_BASE, illuminance: ldrIlluminanceForResistance(8, LDR_BASE) },
      },
      { kind: 'ammeter', label: 'A1', x: 700, y: 180 },
      { kind: 'resistor', label: 'R1', x: 420, y: 420, params: { resistance: 4 } },
      { kind: 'voltmeter', label: 'V1', x: 700, y: 420 },
    ],
    [
      ['E1', 'pos', 'LDR1', 'a'],
      ['LDR1', 'b', 'A1', 'a'],
      ['A1', 'b', 'E1', 'neg'],
      ['E1', 'pos', 'R1', 'a'],
      ['R1', 'b', 'E1', 'neg'],
      ['R1', 'a', 'V1', 'a'],
      ['R1', 'b', 'V1', 'b'],
    ],
  );

const capacitorCharging = (): CircuitDocument =>
  buildExperimentDoc(
    'Capacitor charging',
    [
      { kind: 'cell', label: 'E1', x: 120, y: 240, params: { emf: 6 } },
      { kind: 'switch', label: 'S1', x: 340, y: 240, params: { closed: true } },
      { kind: 'resistor', label: 'R1', x: 560, y: 240, params: { resistance: 10000 } },
      { kind: 'capacitor', label: 'C1', x: 780, y: 240, params: { capacitance: 470e-6 } },
    ],
    [
      ['E1', 'pos', 'S1', 'a'],
      ['S1', 'b', 'R1', 'a'],
      ['R1', 'b', 'C1', 'a'],
      ['C1', 'b', 'E1', 'neg'],
    ],
  );

const capacitorDischarging = (): CircuitDocument =>
  buildExperimentDoc(
    'Capacitor discharging',
    [
      { kind: 'switch', label: 'S1', x: 220, y: 240, params: { closed: true } },
      { kind: 'resistor', label: 'R1', x: 460, y: 240, params: { resistance: 10000 } },
      { kind: 'capacitor', label: 'C1', x: 700, y: 240, params: { capacitance: 470e-6 } },
    ],
    [
      ['S1', 'a', 'R1', 'a'],
      ['R1', 'b', 'C1', 'a'],
      ['C1', 'b', 'S1', 'b'],
    ],
  );

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'series-circuit',
    title: { en: 'Series circuit', zh: '串联电路' },
    subtitle: { en: 'Current is the same; potential differences add.', zh: '电流处处相同，电压相加。' },
    level: 'IGCSE',
    topics: ['series', 'current', 'voltage'],
    chart: 'none',
    instructions: {
      en: [
        'The ammeter reads the same current at every point in a series circuit.',
        'The voltmeter reads the p.d. across R2 only.',
        'Change R1 or R2 and check that the current is the same through both resistors.',
      ],
      zh: [
        '串联电路中，电流处处相同。',
        '电压表测量 R2 两端的电压。',
        '改变 R1 或 R2 的阻值，检查两个电阻中的电流是否始终相同。',
      ],
    },
    actions: [
      {
        id: 'r2-up',
        label: { en: 'Increase R2 to 40 Ω', zh: '把 R2 增大到 40 Ω' },
        apply: (doc) => setParam(doc, 'R2', { resistance: 40 }),
      },
      {
        id: 'r2-down',
        label: { en: 'Reduce R2 to 10 Ω', zh: '把 R2 减小到 10 Ω' },
        apply: (doc) => setParam(doc, 'R2', { resistance: 10 }),
      },
    ],
    build: seriesCircuit,
    completed: true,
  },
  {
    id: 'parallel-circuit',
    title: { en: 'Parallel circuit', zh: '并联电路' },
    subtitle: { en: 'Each branch has the full supply p.d.; currents add.', zh: '各支路电压相同，电流相加。' },
    level: 'IGCSE',
    topics: ['parallel', 'kirchhoff'],
    chart: 'none',
    instructions: {
      en: [
        'Both branches are connected directly across the 6 V supply.',
        'The ammeter in the main branch reads the sum of the branch currents.',
        'Change R1 and observe that the p.d. across R2 does not change.',
      ],
      zh: [
        '两条支路都直接并联在 6 V 电源两端。',
        '干路电流表读数为各支路电流之和。',
        '改变 R1，观察 R2 两端电压保持不变。',
      ],
    },
    actions: [
      {
        id: 'r1-down',
        label: { en: 'Reduce R1 to 5 Ω', zh: '把 R1 减小到 5 Ω' },
        apply: (doc) => setParam(doc, 'R1', { resistance: 5 }),
      },
      {
        id: 'r2-down',
        label: { en: 'Reduce R2 to 10 Ω', zh: '把 R2 减小到 10 Ω' },
        apply: (doc) => setParam(doc, 'R2', { resistance: 10 }),
      },
    ],
    build: parallelCircuit,
    completed: true,
  },
  {
    id: 'ohms-law',
    title: { en: "Ohm's law", zh: '欧姆定律' },
    subtitle: { en: 'I is proportional to V for a fixed resistor.', zh: '定值电阻中电流与电压成正比。' },
    level: 'IGCSE',
    topics: ['ohms-law', 'resistance'],
    chart: 'iv',
    sweep: { from: 0, to: 6, steps: 30 },
    instructions: {
      en: [
        'Record the current for several supply voltages.',
        'Open the graph panel to see the I–V characteristic produced by the solver.',
        'The line is straight through the origin: R = V / I is constant.',
      ],
      zh: [
        '记录不同电源电压下的电流。',
        '打开图表面板，查看求解器生成的 I–V 图像。',
        '图像是一条过原点的直线：R = U / I 保持恒定。',
      ],
    },
    actions: [
      {
        id: 'emf-3',
        label: { en: 'Set supply to 3 V', zh: '把电源设为 3 V' },
        apply: (doc) => setParam(doc, 'E1', { emf: 3 }),
      },
      {
        id: 'emf-12',
        label: { en: 'Set supply to 12 V', zh: '把电源设为 12 V' },
        apply: (doc) => setParam(doc, 'E1', { emf: 12 }),
      },
    ],
    build: ohmsLaw,
    completed: true,
  },
  {
    id: 'potential-divider',
    title: { en: 'Potential divider', zh: '分压电路' },
    subtitle: { en: 'The p.d. is shared in the ratio of the resistances.', zh: '电压按电阻比例分配。' },
    level: 'A-Level',
    topics: ['potential-divider', 'series'],
    chart: 'none',
    instructions: {
      en: [
        'V2 = EMF × R2 / (R1 + R2).',
        'Increase R1 and watch the p.d. across R2 fall.',
        'The two p.d.s always add up to the supply EMF.',
      ],
      zh: [
        'U2 = E × R2 / (R1 + R2)。',
        '增大 R1，观察 R2 两端电压减小。',
        '两个电阻的电压之和始终等于电源电动势。',
      ],
    },
    actions: [
      {
        id: 'r1-up',
        label: { en: 'Increase R1 to 8 Ω', zh: '把 R1 增大到 8 Ω' },
        apply: (doc) => setParam(doc, 'R1', { resistance: 8 }),
      },
      {
        id: 'r1-down',
        label: { en: 'Reduce R1 to 2 Ω', zh: '把 R1 减小到 2 Ω' },
        apply: (doc) => setParam(doc, 'R1', { resistance: 2 }),
      },
    ],
    build: potentialDivider,
    completed: true,
  },
  {
    id: 'ldr-circuit',
    title: { en: 'LDR circuit', zh: 'LDR 光敏电阻电路' },
    subtitle: { en: 'Light changes the LDR resistance, so the p.d. across R1 changes.', zh: '光照改变 LDR 电阻，从而改变 R1 两端电压。' },
    level: 'A-Level',
    topics: ['ldr', 'potential-divider', 'sensor'],
    chart: 'none',
    instructions: {
      en: [
        'In brighter light the LDR resistance falls from 8 Ω towards 2 Ω.',
        'Explain mode builds the full causal chain for the change.',
        'Check that the p.d. across R1 rises while the LDR p.d. falls.',
      ],
      zh: [
        '光照增强时，LDR 的电阻由 8 Ω 减小到约 2 Ω。',
        '讲解模式会给出完整的因果链。',
        '检查 R1 两端电压是否增大，而 LDR 两端电压是否减小。',
      ],
    },
    actions: [
      {
        id: 'light-up',
        label: { en: 'Increase light (8 Ω → 2 Ω)', zh: '增强光照（8 Ω → 2 Ω）' },
        apply: (doc) => setLdrLight(doc, 2),
      },
      {
        id: 'light-down',
        label: { en: 'Reduce light (2 Ω → 8 Ω)', zh: '减弱光照（2 Ω → 8 Ω）' },
        apply: (doc) => setLdrLight(doc, 8),
      },
    ],
    build: ldrCircuit,
    completed: true,
  },
  {
    id: 'ldr-parallel',
    title: { en: 'LDR in parallel', zh: 'LDR 并联电路' },
    subtitle: { en: 'A parallel branch keeps the same p.d. when light changes.', zh: '并联支路在光照变化时电压保持不变。' },
    level: 'A-Level',
    topics: ['ldr', 'parallel', 'kirchhoff'],
    chart: 'none',
    instructions: {
      en: [
        'The LDR and the 4 Ω resistor are both connected directly across the 12 V supply.',
        'In brighter light the LDR resistance falls from 8 Ω to 2 Ω, so its branch current rises.',
        'The p.d. across the fixed resistor stays at 12 V, so its current does not change.',
        'Compare this with the series LDR circuit: the reasoning is different.',
      ],
      zh: [
        'LDR 与 4 Ω 电阻都直接并联在 12 V 电源两端。',
        '光照增强时 LDR 电阻由 8 Ω 减小到 2 Ω，因此其支路电流增大。',
        '定值电阻两端电压保持 12 V，因此其电流不变。',
        '与串联 LDR 电路对比：这里的推理完全不同。',
      ],
    },
    actions: [
      {
        id: 'light-up',
        label: { en: 'Increase light (8 Ω → 2 Ω)', zh: '增强光照（8 Ω → 2 Ω）' },
        apply: (doc) => setLdrLight(doc, 2),
      },
      {
        id: 'light-down',
        label: { en: 'Reduce light (2 Ω → 8 Ω)', zh: '减弱光照（2 Ω → 8 Ω）' },
        apply: (doc) => setLdrLight(doc, 8),
      },
    ],
    build: ldrParallelCircuit,
    completed: true,
  },
  {
    id: 'thermistor-circuit',
    title: { en: 'Thermistor circuit', zh: '热敏电阻电路' },
    subtitle: { en: 'An NTC thermistor loses resistance as it warms.', zh: 'NTC 热敏电阻温度升高时电阻减小。' },
    level: 'A-Level',
    topics: ['thermistor', 'sensor', 'potential-divider'],
    chart: 'none',
    instructions: {
      en: [
        'At 25 °C the thermistor resistance is 1 kΩ.',
        'Warm it to 80 °C and watch its resistance fall.',
        'The p.d. across the fixed 1 kΩ resistor rises.',
      ],
      zh: [
        '25 °C 时热敏电阻阻值为 1 kΩ。',
        '升温到 80 °C，观察其电阻减小。',
        '定值电阻（1 kΩ）两端电压增大。',
      ],
    },
    actions: [
      {
        id: 'heat',
        label: { en: 'Warm to 80 °C', zh: '升温到 80 °C' },
        apply: (doc) => setParam(doc, 'TH1', { temperatureC: 80 }),
      },
      {
        id: 'cool',
        label: { en: 'Cool to 25 °C', zh: '降温到 25 °C' },
        apply: (doc) => setParam(doc, 'TH1', { temperatureC: 25 }),
      },
    ],
    build: thermistorCircuit,
    completed: true,
  },
  {
    id: 'internal-resistance',
    title: { en: 'Internal resistance', zh: '内阻实验' },
    subtitle: { en: 'The terminal p.d. falls as the current rises: V = E − Ir.', zh: '电流增大时端电压下降：U = E − Ir。' },
    level: 'A-Level',
    topics: ['internal-resistance', 'emf'],
    chart: 'vi',
    axisLabels: { x: { en: 'Current I (A)', zh: '电流 I (A)' }, y: { en: 'Terminal p.d. V (V)', zh: '端电压 U (V)' } },
    instructions: {
      en: [
        'The cell has EMF 6.0 V and internal resistance 0.50 Ω.',
        'The graph shows terminal p.d. against current for different rheostat settings.',
        'The gradient is −r and the intercept is the EMF.',
      ],
      zh: [
        '电源电动势为 6.0 V，内阻为 0.50 Ω。',
        '图像显示不同变阻器阻值下的端电压与电流关系。',
        '斜率为 −r，纵截距为电动势。',
      ],
    },
    actions: [
      {
        id: 'rv-0.5',
        label: { en: 'Set Rheostat to 0.5 Ω', zh: '把变阻器设为 0.5 Ω' },
        apply: (doc) => setParam(doc, 'RV1', { resistance: 0.5 }),
      },
      {
        id: 'rv-4.5',
        label: { en: 'Set Rheostat to 4.5 Ω', zh: '把变阻器设为 4.5 Ω' },
        apply: (doc) => setParam(doc, 'RV1', { resistance: 4.5 }),
      },
    ],
    build: internalResistance,
    dataset: internalResistanceDataset,
    completed: true,
  },
  {
    id: 'iv-characteristics',
    title: { en: 'I–V characteristics', zh: '伏安特性曲线' },
    subtitle: { en: 'A filament lamp is non-ohmic; a resistor is ohmic.', zh: '灯丝灯泡是非欧姆元件，定值电阻是欧姆元件。' },
    level: 'A-Level',
    topics: ['iv-characteristic', 'non-ohmic', 'lamp'],
    chart: 'iv',
    sweep: { from: -6, to: 6, steps: 60 },
    axisLabels: { x: { en: 'Potential difference V (V)', zh: '电压 U (V)' }, y: { en: 'Current I (A)', zh: '电流 I (A)' } },
    instructions: {
      en: [
        'The graph is generated by solving the real non-linear lamp model at every voltage.',
        'The curve bends over because the filament resistance rises as it heats.',
        'Swap the lamp for a resistor to compare an ohmic characteristic.',
      ],
      zh: [
        '图像由每个电压下真实求解非线性灯泡模型得到。',
        '曲线向下弯曲，因为灯丝温度升高时电阻增大。',
        '把灯泡换成定值电阻，对比欧姆元件的特性曲线。',
      ],
    },
    actions: [],
    build: ivCharacteristics,
    completed: true,
  },
  {
    id: 'capacitor-charging',
    title: { en: 'Capacitor charging', zh: '电容充电' },
    subtitle: { en: 'Vc rises exponentially with time constant τ = RC.', zh: '电容电压按指数规律上升，时间常数 τ = RC。' },
    level: 'A-Level',
    topics: ['capacitor', 'rc', 'transient'],
    chart: 'vt',
    transient: { mode: 'charge', initialVoltage: 0, duration: 30 },
    axisLabels: { x: { en: 'Time t (s)', zh: '时间 t (s)' }, y: { en: 'Capacitor p.d. Vc (V)', zh: '电容电压 Uc (V)' } },
    instructions: {
      en: [
        'R = 10 kΩ and C = 470 µF, so the time constant is 4.7 s.',
        'The capacitor is uncharged at t = 0 and reaches 63% of the supply voltage after one time constant.',
        'Open the graph panel to see Vc–t and the current–time curve.',
      ],
      zh: [
        'R = 10 kΩ，C = 470 µF，因此时间常数为 4.7 s。',
        't = 0 时电容不带电；经过一个时间常数后电压达到电源电压的 63%。',
        '打开图表面板查看 Uc–t 与电流–时间图像。',
      ],
    },
    actions: [],
    build: capacitorCharging,
    completed: true,
  },
  {
    id: 'capacitor-discharging',
    title: { en: 'Capacitor discharging', zh: '电容放电' },
    subtitle: { en: 'Vc decays exponentially through the resistor.', zh: '电容通过电阻指数放电。' },
    level: 'A-Level',
    topics: ['capacitor', 'rc', 'transient'],
    chart: 'vt',
    transient: { mode: 'discharge', initialVoltage: 6, duration: 30 },
    axisLabels: { x: { en: 'Time t (s)', zh: '时间 t (s)' }, y: { en: 'Capacitor p.d. Vc (V)', zh: '电容电压 Uc (V)' } },
    instructions: {
      en: [
        'The capacitor starts at 6.0 V and discharges through 10 kΩ.',
        'The time constant is 4.7 s; after each time constant the voltage falls to 37% of its value.',
        'The current is largest at t = 0 and falls with the voltage.',
      ],
      zh: [
        '电容从 6.0 V 开始，通过 10 kΩ 电阻放电。',
        '时间常数为 4.7 s；每经过一个时间常数，电压降为原来的 37%。',
        't = 0 时电流最大，随后随电压一起减小。',
      ],
    },
    actions: [],
    build: capacitorDischarging,
    completed: true,
  },
];

export function getExperiment(id: string): Experiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}

export function buildExperimentDocument(id: string): CircuitDocument | null {
  const experiment = getExperiment(id);
  return experiment ? experiment.build() : null;
}

/** Sweep helper for experiments that plot a characteristic. */
export function experimentSweep(experiment: Experiment, doc: CircuitDocument) {
  if (!experiment.sweep || experiment.chart !== 'iv') return null;
  const target = doc.components.find((c) => c.kind !== 'cell' && c.kind !== 'battery');
  return sweepCharacteristic(doc, {
    ...experiment.sweep,
    componentId: target?.id,
  });
}
