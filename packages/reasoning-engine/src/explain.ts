import { getDesignators } from '@circuitlab/circuit-core';
import type { CircuitDocument, ComponentInstance } from '@circuitlab/circuit-core';
import type { CircuitSolution } from '@circuitlab/physics-engine';
import type {
  ComparisonRow,
  Direction,
  ExplainInput,
  ExplainResult,
  MarkingPoint,
  QuantityChange,
  ReasoningStep,
} from './types';
import {
  analyzeNetwork,
  acrossSource,
  componentResistance,
  currentThrough,
  DIR_EN,
  DIR_ZH,
  direction,
  findParamChanges,
  formatNumber as fmt,
  isFixedResistor,
  isIdealSource,
  isSourceKind,
  opposite,
  RISE_EN,
  RISE_ZH,
  sameTopology,
  seriesIn,
  sourceOf,
  voltageAcross,
  type AnalysisNet,
  type ParamChange,
} from './utils';

interface Ctx {
  before: CircuitDocument;
  after: CircuitDocument;
  beforeSolution: CircuitSolution;
  afterSolution: CircuitSolution;
  labels: Record<string, string>;
  changes: ParamChange[];
  net: AnalysisNet;
  sourceBefore: ComponentInstance;
  sourceAfter: ComponentInstance;
}

const label = (ctx: Ctx, id: string): string => ctx.labels[id] ?? id;
const componentIn = (doc: CircuitDocument, id: string) => doc.components.find((c) => c.id === id);

function makeStep(
  id: string,
  kind: ReasoningStep['kind'],
  law: ReasoningStep['law'],
  en: string,
  zh: string,
  highlight?: string[],
  quantities?: Record<string, QuantityChange>,
): ReasoningStep {
  return { id, kind, law, en, zh, highlight, quantities };
}

function buildMarkingPoints(items: [string, string][]): MarkingPoint[] {
  return items.map(([en, zh], index) => ({ en, zh, required: index < items.length - 1 }));
}

function sameNumber(a: number, b: number, tol = 1e-6): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / scale < tol;
}

function quantityChange(
  changes: Record<string, QuantityChange>,
  key: string,
  before: number,
  after: number,
  unit: string,
): QuantityChange {
  const existing = changes[key];
  if (existing) return existing;
  const change: QuantityChange = {
    before,
    after,
    delta: after - before,
    direction: direction(before, after),
    unit,
  };
  changes[key] = change;
  return change;
}

function collectChanges(input: ExplainInput): Record<string, QuantityChange> {
  const changes: Record<string, QuantityChange> = {};
  for (const comp of input.after.components) {
    const beforeComp = input.before.components.find((c) => c.id === comp.id);
    if (!beforeComp) continue;
    const b = input.beforeSolution.components[comp.id];
    const a = input.afterSolution.components[comp.id];
    if (!b || !a) continue;
    quantityChange(changes, `I:${comp.id}`, b.currentMagnitude, a.currentMagnitude, 'A');
    quantityChange(changes, `V:${comp.id}`, b.voltageMagnitude, a.voltageMagnitude, 'V');
    quantityChange(changes, `P:${comp.id}`, Math.abs(b.power), Math.abs(a.power), 'W');
    const rb = componentResistance(beforeComp);
    const ra = componentResistance(comp);
    if (rb !== null && ra !== null) {
      quantityChange(changes, `R:${comp.id}`, Math.abs(rb), Math.abs(ra), 'Ω');
    }
  }
  if (input.beforeSolution.totalResistance !== null && input.afterSolution.totalResistance !== null) {
    quantityChange(
      changes,
      'total:R',
      input.beforeSolution.totalResistance,
      input.afterSolution.totalResistance,
      'Ω',
    );
  }
  quantityChange(
    changes,
    'total:I',
    Math.abs(input.beforeSolution.totalCurrent ?? 0),
    Math.abs(input.afterSolution.totalCurrent ?? 0),
    'A',
  );
  quantityChange(
    changes,
    'total:P',
    input.beforeSolution.totalPowerDelivered,
    input.afterSolution.totalPowerDelivered,
    'W',
  );
  return changes;
}

function emptyResult(
  reasonEn: string,
  reasonZh: string,
  extra: Partial<ExplainResult> = {},
): ExplainResult {
  return {
    supported: false,
    title: { en: 'Explanation not available', zh: '暂时无法生成解释' },
    steps: [],
    markingPoints: [],
    answer: { en: '', zh: '' },
    summary: { en: '', zh: '' },
    changes: {},
    highlights: [],
    reason: { en: reasonEn, zh: reasonZh },
    markingScheme: 'software-authored',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Rule: sensor (LDR / thermistor) in series with a fixed resistor
// ---------------------------------------------------------------------------

function sensorSeriesRule(
  ctx: Ctx,
  sensor: ComponentInstance,
  fixed: ComponentInstance,
  cause: 'light' | 'temperature',
  changes: Record<string, QuantityChange>,
): ExplainResult | null {
  if (!isIdealSource(ctx.after)) return null;
  const sensorBefore = componentIn(ctx.before, sensor.id);
  if (!sensorBefore) return null;
  const rsBefore = componentResistance(sensorBefore);
  const rsAfter = componentResistance(sensor);
  if (rsBefore === null || rsAfter === null) return null;
  const rf = componentResistance(fixed);
  const rfBefore = componentResistance(componentIn(ctx.before, fixed.id) ?? fixed);
  if (rf === null || rfBefore === null || !sameNumber(rf, rfBefore)) return null;

  const eBefore = Math.abs(ctx.beforeSolution.components[ctx.sourceBefore.id]?.terminalVoltage ?? 0);
  const eAfter = Math.abs(ctx.afterSolution.components[ctx.sourceAfter.id]?.terminalVoltage ?? 0);
  if (eBefore < 1e-9 || !sameNumber(eBefore, eAfter, 1e-4)) return null;

  const iBefore = currentThrough(ctx.beforeSolution, fixed.id);
  const iAfter = currentThrough(ctx.afterSolution, fixed.id);
  const vfBefore = voltageAcross(ctx.beforeSolution, fixed.id);
  const vfAfter = voltageAcross(ctx.afterSolution, fixed.id);
  const vsBefore = voltageAcross(ctx.beforeSolution, sensor.id);
  const vsAfter = voltageAcross(ctx.afterSolution, sensor.id);
  const rtBefore = ctx.beforeSolution.totalResistance ?? Number.POSITIVE_INFINITY;
  const rtAfter = ctx.afterSolution.totalResistance ?? Number.POSITIVE_INFINITY;

  if (!Number.isFinite(rtBefore) || !Number.isFinite(rtAfter)) return null;
  if (Math.abs(vfBefore + vsBefore - eBefore) > Math.max(1e-6, eBefore * 1e-4)) return null;
  if (Math.abs(vfAfter + vsAfter - eAfter) > Math.max(1e-6, eAfter * 1e-4)) return null;

  const dR = direction(rsBefore, rsAfter);
  if (dR === 'unchanged') return null;
  const dRt = direction(rtBefore, rtAfter);
  const dI = direction(iBefore, iAfter);
  const dVf = direction(vfBefore, vfAfter);
  const dVs = direction(vsBefore, vsAfter);

  if (dRt !== dR) return null;
  if (dI !== opposite(dR)) return null;
  if (dVs !== opposite(dVf)) return null;
  if (dVf !== dI) return null;

  const sensorLabel = label(ctx, sensor.id);
  const fixedLabel = label(ctx, fixed.id);
  const causeDir: Direction = opposite(dR);
  const isLight = cause === 'light';
  const causeEn = isLight
    ? `The light intensity on ${sensorLabel} ${causeDir === 'increase' ? 'increases' : 'decreases'}.`
    : `The temperature of ${sensorLabel} ${causeDir === 'increase' ? 'rises' : 'falls'}.`;
  const causeZh = isLight
    ? `${sensorLabel} 受到的光照强度${causeDir === 'increase' ? '增大' : '减小'}。`
    : `${sensorLabel} 的温度${causeDir === 'increase' ? '升高' : '降低'}。`;

  changes[`R:${sensor.id}`] = {
    before: rsBefore,
    after: rsAfter,
    delta: rsAfter - rsBefore,
    direction: dR,
    unit: 'Ω',
  };
  changes['total:R'] = {
    before: rtBefore,
    after: rtAfter,
    delta: rtAfter - rtBefore,
    direction: dRt,
    unit: 'Ω',
  };
  changes['total:I'] = {
    before: iBefore,
    after: iAfter,
    delta: iAfter - iBefore,
    direction: dI,
    unit: 'A',
  };
  changes[`V:${fixed.id}`] = {
    before: vfBefore,
    after: vfAfter,
    delta: vfAfter - vfBefore,
    direction: dVf,
    unit: 'V',
  };
  changes[`V:${sensor.id}`] = {
    before: vsBefore,
    after: vsAfter,
    delta: vsAfter - vsBefore,
    direction: dVs,
    unit: 'V',
  };

  const steps = [
    makeStep(
      'cause',
      'cause',
      isLight ? 'ldr-property' : 'thermistor-property',
      causeEn,
      causeZh,
      [sensor.id],
    ),
    makeStep(
      'resistance',
      'change',
      isLight ? 'ldr-property' : 'thermistor-property',
      `The resistance of ${sensorLabel} ${RISE_EN[dR]} from ${fmt(rsBefore)} Ω to ${fmt(rsAfter)} Ω.`,
      `${sensorLabel} 的电阻由 ${fmt(rsBefore)} Ω ${RISE_ZH[dR]}到 ${fmt(rsAfter)} Ω。`,
      [sensor.id],
      { [`R:${sensor.id}`]: changes[`R:${sensor.id}`] },
    ),
    makeStep(
      'total-resistance',
      'consequence',
      'series-resistance',
      `Because ${sensorLabel} and ${fixedLabel} are in series, the total resistance ${RISE_EN[dRt]} from ${fmt(rtBefore)} Ω to ${fmt(rtAfter)} Ω (R_total = R_${sensorLabel} + R_${fixedLabel}).`,
      `由于 ${sensorLabel} 与 ${fixedLabel} 串联，总电阻由 ${fmt(rtBefore)} Ω ${RISE_ZH[dRt]}到 ${fmt(rtAfter)} Ω（R总 = R_${sensorLabel} + R_${fixedLabel}）。`,
      [sensor.id, fixed.id],
      { 'total:R': changes['total:R'] },
    ),
    makeStep(
      'current',
      'consequence',
      'ohms-law',
      `The EMF of the supply stays constant at ${fmt(eBefore)} V, so the current ${DIR_EN[dI]} from ${fmt(iBefore)} A to ${fmt(iAfter)} A because I = EMF / R_total.`,
      `电源电动势保持 ${fmt(eBefore)} V 不变，因此电流由 ${fmt(iBefore)} A ${DIR_ZH[dI]}到 ${fmt(iAfter)} A（I = E / R总）。`,
      [ctx.sourceAfter.id],
      { 'total:I': changes['total:I'] },
    ),
    makeStep(
      'fixed-pd',
      'consequence',
      'ohms-law',
      `The resistance of ${fixedLabel} is constant at ${fmt(rf)} Ω, so the p.d. across it ${DIR_EN[dVf]} from ${fmt(vfBefore)} V to ${fmt(vfAfter)} V because V = IR.`,
      `${fixedLabel} 的电阻恒为 ${fmt(rf)} Ω，因此其两端电压由 ${fmt(vfBefore)} V ${DIR_ZH[dVf]}到 ${fmt(vfAfter)} V（U = IR）。`,
      [fixed.id],
      { [`V:${fixed.id}`]: changes[`V:${fixed.id}`] },
    ),
    makeStep(
      'sensor-pd',
      'conclusion',
      'kirchhoff-voltage',
      `The EMF is shared between the two components, so the p.d. across ${sensorLabel} ${DIR_EN[dVs]} from ${fmt(vsBefore)} V to ${fmt(vsAfter)} V because EMF = V_${fixedLabel} + V_${sensorLabel}.`,
      `电动势由两个元件共同分担，因此 ${sensorLabel} 两端电压由 ${fmt(vsBefore)} V ${DIR_ZH[dVs]}到 ${fmt(vsAfter)} V（E = U_${fixedLabel} + U_${sensorLabel}）。`,
      [sensor.id, fixed.id],
      { [`V:${sensor.id}`]: changes[`V:${sensor.id}`] },
    ),
  ];

  const markingPoints = buildMarkingPoints([
    [
      `${isLight ? 'Light intensity' : 'Temperature'} ${causeDir === 'increase' ? (isLight ? 'increases' : 'rises') : isLight ? 'decreases' : 'falls'}, so the resistance of ${sensorLabel} ${DIR_EN[dR]}.`,
      `${isLight ? '光照强度' : '温度'}${causeDir === 'increase' ? (isLight ? '增大' : '升高') : isLight ? '减小' : '降低'}，因此 ${sensorLabel} 的电阻${DIR_ZH[dR]}。`,
    ],
    [
      `The total resistance ${DIR_EN[dRt]} because the two components are in series.`,
      `由于两个元件串联，总电阻${DIR_ZH[dRt]}。`,
    ],
    [
      `The current ${DIR_EN[dI]} because I = EMF / R_total and the EMF is constant.`,
      `电动势不变，由 I = E / R总 可得电流${DIR_ZH[dI]}。`,
    ],
    [
      `The p.d. across ${fixedLabel} ${DIR_EN[dVf]} because V = IR with constant R and the current ${DIR_EN[dI]}.`,
      `${fixedLabel} 的电阻不变，电流${DIR_ZH[dI]}，由 U = IR 得其两端电压${DIR_ZH[dVf]}。`,
    ],
    [
      `The p.d. across ${sensorLabel} ${DIR_EN[dVs]} because the two p.d.s must add up to the constant EMF.`,
      `两个元件的电压之和等于不变的电动势，因此 ${sensorLabel} 两端电压${DIR_ZH[dVs]}。`,
    ],
  ]);

  const answerEn = [causeEn, ...steps.slice(1).map((s) => s.en)].join(' ');
  const answerZh = [causeZh, ...steps.slice(1).map((s) => s.zh)].join('');
  const summaryEn = `The resistance of ${sensorLabel} ${RISE_EN[dR]}, so the total resistance ${RISE_EN[dRt]} and the current ${DIR_EN[dI]}. The p.d. across ${fixedLabel} ${DIR_EN[dVf]}, while the p.d. across ${sensorLabel} ${DIR_EN[dVs]}.`;
  const summaryZh = `${sensorLabel} 的电阻${RISE_ZH[dR]}，总电阻随之${RISE_ZH[dRt]}，电流${DIR_ZH[dI]}。${fixedLabel} 两端电压${DIR_ZH[dVf]}，而 ${sensorLabel} 两端电压${DIR_ZH[dVs]}。`;

  return {
    supported: true,
    ruleId: `sensor-series-${cause}`,
    title: isLight
      ? { en: 'LDR in series with a fixed resistor', zh: 'LDR 与定值电阻串联' }
      : { en: 'NTC thermistor in series with a fixed resistor', zh: 'NTC 热敏电阻与定值电阻串联' },
    cause: { en: causeEn, zh: causeZh },
    steps,
    markingPoints,
    answer: { en: answerEn, zh: answerZh },
    summary: { en: summaryEn, zh: summaryZh },
    changes,
    highlights: [sensor.id, fixed.id, ctx.sourceAfter.id],
    markingScheme: 'software-authored',
  };
}

// ---------------------------------------------------------------------------
// Rule: sensor in parallel with a fixed resistor directly across the supply
// ---------------------------------------------------------------------------

function sensorParallelRule(
  ctx: Ctx,
  sensor: ComponentInstance,
  fixed: ComponentInstance,
  cause: 'light' | 'temperature',
  changes: Record<string, QuantityChange>,
): ExplainResult | null {
  if (!isIdealSource(ctx.after)) return null;
  const sensorBefore = componentIn(ctx.before, sensor.id);
  if (!sensorBefore) return null;
  const rsBefore = componentResistance(sensorBefore);
  const rsAfter = componentResistance(sensor);
  const rf = componentResistance(fixed);
  const rfBefore = componentResistance(componentIn(ctx.before, fixed.id) ?? fixed);
  if (rsBefore === null || rsAfter === null || rf === null || rfBefore === null) return null;
  if (!sameNumber(rf, rfBefore)) return null;

  const eBefore = Math.abs(ctx.beforeSolution.components[ctx.sourceBefore.id]?.terminalVoltage ?? 0);
  const eAfter = Math.abs(ctx.afterSolution.components[ctx.sourceAfter.id]?.terminalVoltage ?? 0);
  if (eBefore < 1e-9 || !sameNumber(eBefore, eAfter, 1e-4)) return null;

  const vlBefore = voltageAcross(ctx.beforeSolution, sensor.id);
  const vlAfter = voltageAcross(ctx.afterSolution, sensor.id);
  const vrBefore = voltageAcross(ctx.beforeSolution, fixed.id);
  const vrAfter = voltageAcross(ctx.afterSolution, fixed.id);
  const ilBefore = currentThrough(ctx.beforeSolution, sensor.id);
  const ilAfter = currentThrough(ctx.afterSolution, sensor.id);
  const irBefore = currentThrough(ctx.beforeSolution, fixed.id);
  const irAfter = currentThrough(ctx.afterSolution, fixed.id);
  const itBefore = ctx.beforeSolution.components[ctx.sourceBefore.id]?.currentMagnitude ?? 0;
  const itAfter = ctx.afterSolution.components[ctx.sourceAfter.id]?.currentMagnitude ?? 0;

  // The hallmark of the parallel case: each branch sees the full supply EMF,
  // so the fixed-branch current cannot change.
  if (!sameNumber(vlBefore, eBefore, 1e-4) || !sameNumber(vrBefore, eBefore, 1e-4)) return null;
  if (!sameNumber(vlAfter, eAfter, 1e-4) || !sameNumber(vrAfter, eAfter, 1e-4)) return null;

  const dR = direction(rsBefore, rsAfter);
  if (dR === 'unchanged') return null;
  const dIL = direction(ilBefore, ilAfter);
  const dIR = direction(irBefore, irAfter);
  const dIt = direction(itBefore, itAfter);
  if (dIR !== 'unchanged') return null;
  if (dIL !== opposite(dR)) return null;
  if (dIt !== dIL) return null;
  if (direction(vrBefore, vrAfter) !== 'unchanged') return null;

  const sensorLabel = label(ctx, sensor.id);
  const fixedLabel = label(ctx, fixed.id);
  const causeDir: Direction = opposite(dR);
  const isLight = cause === 'light';
  const causeEn = isLight
    ? `The light intensity on ${sensorLabel} ${causeDir === 'increase' ? 'increases' : 'decreases'}.`
    : `The temperature of ${sensorLabel} ${causeDir === 'increase' ? 'rises' : 'falls'}.`;
  const causeZh = isLight
    ? `${sensorLabel} 受到的光照强度${causeDir === 'increase' ? '增大' : '减小'}。`
    : `${sensorLabel} 的温度${causeDir === 'increase' ? '升高' : '降低'}。`;

  changes[`R:${sensor.id}`] = {
    before: rsBefore,
    after: rsAfter,
    delta: rsAfter - rsBefore,
    direction: dR,
    unit: 'Ω',
  };
  changes[`I:${sensor.id}`] = {
    before: ilBefore,
    after: ilAfter,
    delta: ilAfter - ilBefore,
    direction: dIL,
    unit: 'A',
  };
  changes[`I:${fixed.id}`] = {
    before: irBefore,
    after: irAfter,
    delta: irAfter - irBefore,
    direction: dIR,
    unit: 'A',
  };
  changes[`V:${fixed.id}`] = {
    before: vrBefore,
    after: vrAfter,
    delta: vrAfter - vrBefore,
    direction: 'unchanged',
    unit: 'V',
  };
  changes['total:I'] = {
    before: itBefore,
    after: itAfter,
    delta: itAfter - itBefore,
    direction: dIt,
    unit: 'A',
  };

  const steps = [
    makeStep(
      'cause',
      'cause',
      isLight ? 'ldr-property' : 'thermistor-property',
      causeEn,
      causeZh,
      [sensor.id],
    ),
    makeStep(
      'resistance',
      'change',
      isLight ? 'ldr-property' : 'thermistor-property',
      `The resistance of ${sensorLabel} ${RISE_EN[dR]} from ${fmt(rsBefore)} Ω to ${fmt(rsAfter)} Ω.`,
      `${sensorLabel} 的电阻由 ${fmt(rsBefore)} Ω ${RISE_ZH[dR]}到 ${fmt(rsAfter)} Ω。`,
      [sensor.id],
      { [`R:${sensor.id}`]: changes[`R:${sensor.id}`] },
    ),
    makeStep(
      'sensor-current',
      'consequence',
      'parallel-voltage',
      `${sensorLabel} is connected directly across the supply, so its p.d. stays at ${fmt(eBefore)} V because parallel branches share the same p.d. Its current ${DIR_EN[dIL]} from ${fmt(ilBefore)} A to ${fmt(ilAfter)} A because I = V / R.`,
      `${sensorLabel} 直接并联在电源两端，因此其两端电压保持 ${fmt(eBefore)} V 不变（并联支路电压相等）。由 I = U / R 可知，其电流由 ${fmt(ilBefore)} A ${DIR_ZH[dIL]}到 ${fmt(ilAfter)} A。`,
      [sensor.id, ctx.sourceAfter.id],
      { [`I:${sensor.id}`]: changes[`I:${sensor.id}`] },
    ),
    makeStep(
      'fixed-branch',
      'consequence',
      'parallel-voltage',
      `${fixedLabel} is also connected directly across the supply, so its p.d. stays at ${fmt(vrBefore)} V. Its resistance is unchanged, so its current stays at ${fmt(irBefore)} A.`,
      `${fixedLabel} 同样直接并联在电源两端，其两端电压保持 ${fmt(vrBefore)} V 不变。由于其电阻不变，通过它的电流保持 ${fmt(irBefore)} A 不变。`,
      [fixed.id],
      { [`I:${fixed.id}`]: changes[`I:${fixed.id}`] },
    ),
    makeStep(
      'total-current',
      'conclusion',
      'kirchhoff-current',
      `The current drawn from the supply is the sum of the two branch currents, so it ${DIR_EN[dIt]} from ${fmt(itBefore)} A to ${fmt(itAfter)} A (Kirchhoff's current law).`,
      `电源输出的总电流等于两条支路电流之和，因此总电流由 ${fmt(itBefore)} A ${DIR_ZH[dIt]}到 ${fmt(itAfter)} A（基尔霍夫电流定律）。`,
      [ctx.sourceAfter.id, sensor.id, fixed.id],
      { 'total:I': changes['total:I'] },
    ),
    makeStep(
      'conclusion',
      'conclusion',
      'parallel-voltage',
      `The p.d. across ${fixedLabel} does not change, unlike in a series circuit: in parallel, each branch sees the full supply p.d.`,
      `与串联电路不同，${fixedLabel} 两端电压保持不变：在并联电路中，每条支路都承受完整的电源电压。`,
      [fixed.id],
      { [`V:${fixed.id}`]: changes[`V:${fixed.id}`] },
    ),
  ];

  const markingPoints = buildMarkingPoints([
    [
      `${isLight ? 'Light intensity' : 'Temperature'} ${causeDir === 'increase' ? (isLight ? 'increases' : 'rises') : isLight ? 'decreases' : 'falls'}, so the resistance of ${sensorLabel} ${DIR_EN[dR]}.`,
      `${isLight ? '光照强度' : '温度'}${causeDir === 'increase' ? (isLight ? '增大' : '升高') : isLight ? '减小' : '降低'}，因此 ${sensorLabel} 的电阻${DIR_ZH[dR]}。`,
    ],
    [
      'Components connected in parallel have the same potential difference, which equals the supply EMF here.',
      '并联元件两端电压相等，且等于电源电动势。',
    ],
    [
      `The current in ${sensorLabel} ${DIR_EN[dIL]} because I = V / R with V constant.`,
      `${sensorLabel} 两端电压不变，由 I = U / R 可得其电流${DIR_ZH[dIL]}。`,
    ],
    [
      `The current in ${fixedLabel} is unchanged because both its resistance and its p.d. are unchanged.`,
      `${fixedLabel} 的电阻和两端电压都不变，因此通过它的电流不变。`,
    ],
    [
      `The total current ${DIR_EN[dIt]} because it is the sum of the branch currents.`,
      `总电流等于各支路电流之和，因此总电流${DIR_ZH[dIt]}。`,
    ],
  ]);

  const answerEn = [causeEn, ...steps.slice(1).map((s) => s.en)].join(' ');
  const answerZh = [causeZh, ...steps.slice(1).map((s) => s.zh)].join('');
  const summaryEn = `${sensorLabel} is in parallel with ${fixedLabel}, so the p.d. across each branch stays at ${fmt(eBefore)} V. The resistance of ${sensorLabel} ${RISE_EN[dR]}, so the current through it ${DIR_EN[dIL]} while the current through ${fixedLabel} stays at ${fmt(irBefore)} A. The total current ${DIR_EN[dIt]}.`;
  const summaryZh = `${sensorLabel} 与 ${fixedLabel} 并联，各支路电压保持 ${fmt(eBefore)} V 不变。${sensorLabel} 的电阻${RISE_ZH[dR]}，因此其电流${DIR_ZH[dIL]}，而 ${fixedLabel} 中的电流保持 ${fmt(irBefore)} A 不变。总电流${DIR_ZH[dIt]}。`;

  return {
    supported: true,
    ruleId: `sensor-parallel-${cause}`,
    title: isLight
      ? { en: 'LDR in parallel with a fixed resistor', zh: 'LDR 与定值电阻并联' }
      : { en: 'NTC thermistor in parallel with a fixed resistor', zh: 'NTC 热敏电阻与定值电阻并联' },
    cause: { en: causeEn, zh: causeZh },
    steps,
    markingPoints,
    answer: { en: answerEn, zh: answerZh },
    summary: { en: summaryEn, zh: summaryZh },
    changes,
    highlights: [sensor.id, fixed.id, ctx.sourceAfter.id],
    markingScheme: 'software-authored',
  };
}

function explainSensorChange(
  ctx: Ctx,
  sensor: ComponentInstance,
  cause: 'light' | 'temperature',
  changes: Record<string, QuantityChange>,
): ExplainResult | null {
  const source = ctx.sourceAfter;
  const net = ctx.net;
  const fixed = net.components.filter(isFixedResistor);
  const sensors = net.components.filter((c) => c.kind === 'ldr' || c.kind === 'thermistor');
  if (sensors.length !== 1 || fixed.length !== 1) return null;
  if (net.components.length !== 3) return null;
  const partner = fixed[0];

  if (acrossSource(net, sensor, source) && acrossSource(net, partner, source)) {
    return sensorParallelRule(ctx, sensor, partner, cause, changes);
  }
  if (seriesIn(net, sensor, partner) && seriesIn(net, partner, source) && seriesIn(net, sensor, source)) {
    return sensorSeriesRule(ctx, sensor, partner, cause, changes);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule: fixed resistor changed in a two-resistor series circuit
// ---------------------------------------------------------------------------

function explainResistorChange(
  ctx: Ctx,
  changed: ComponentInstance,
  changes: Record<string, QuantityChange>,
): ExplainResult | null {
  if (!isIdealSource(ctx.after)) return null;
  const net = ctx.net;
  if (net.components.length !== 3) return null;
  const resistors = net.components.filter(isFixedResistor);
  if (resistors.length !== 2) return null;
  const source = ctx.sourceAfter;
  const partner = resistors.find((r) => r.id !== changed.id);
  if (!partner) return null;
  if (!seriesIn(net, changed, partner) || !seriesIn(net, changed, source) || !seriesIn(net, partner, source)) {
    return null;
  }

  const rBefore = componentResistance(componentIn(ctx.before, changed.id) ?? changed);
  const rAfter = componentResistance(changed);
  const rp = componentResistance(partner);
  if (rBefore === null || rAfter === null || rp === null) return null;

  const e = Math.abs(ctx.afterSolution.components[source.id]?.terminalVoltage ?? 0);
  if (e < 1e-9) return null;
  const rtBefore = ctx.beforeSolution.totalResistance ?? Number.POSITIVE_INFINITY;
  const rtAfter = ctx.afterSolution.totalResistance ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(rtBefore) || !Number.isFinite(rtAfter)) return null;

  const iBefore = currentThrough(ctx.beforeSolution, changed.id);
  const iAfter = currentThrough(ctx.afterSolution, changed.id);
  const vBefore = voltageAcross(ctx.beforeSolution, changed.id);
  const vAfter = voltageAcross(ctx.afterSolution, changed.id);
  const vpBefore = voltageAcross(ctx.beforeSolution, partner.id);
  const vpAfter = voltageAcross(ctx.afterSolution, partner.id);

  const dR = direction(rBefore, rAfter);
  if (dR === 'unchanged') return null;
  const dRt = direction(rtBefore, rtAfter);
  const dI = direction(iBefore, iAfter);
  const dVp = direction(vpBefore, vpAfter);
  const dV = direction(vBefore, vAfter);
  if (dRt !== dR) return null;
  if (dI !== opposite(dR)) return null;
  if (dVp !== dI) return null;
  if (dV !== dR) return null;
  if (Math.abs(vBefore + vpBefore - e) > Math.max(1e-6, e * 1e-4)) return null;
  if (Math.abs(vAfter + vpAfter - e) > Math.max(1e-6, e * 1e-4)) return null;

  const changedLabel = label(ctx, changed.id);
  const partnerLabel = label(ctx, partner.id);
  const causeEn = `The resistance of ${changedLabel} is changed from ${fmt(rBefore)} Ω to ${fmt(rAfter)} Ω.`;
  const causeZh = `${changedLabel} 的电阻由 ${fmt(rBefore)} Ω 变为 ${fmt(rAfter)} Ω。`;

  changes['total:R'] = { before: rtBefore, after: rtAfter, delta: rtAfter - rtBefore, direction: dRt, unit: 'Ω' };
  changes['total:I'] = { before: iBefore, after: iAfter, delta: iAfter - iBefore, direction: dI, unit: 'A' };
  changes[`V:${partner.id}`] = { before: vpBefore, after: vpAfter, delta: vpAfter - vpBefore, direction: dVp, unit: 'V' };
  changes[`V:${changed.id}`] = { before: vBefore, after: vAfter, delta: vAfter - vBefore, direction: dV, unit: 'V' };

  const steps = [
    makeStep('cause', 'cause', 'ohms-law', causeEn, causeZh, [changed.id]),
    makeStep(
      'total-resistance',
      'consequence',
      'series-resistance',
      `The total resistance ${RISE_EN[dRt]} from ${fmt(rtBefore)} Ω to ${fmt(rtAfter)} Ω because series resistances add.`,
      `由于串联电阻相加，总电阻由 ${fmt(rtBefore)} Ω ${RISE_ZH[dRt]}到 ${fmt(rtAfter)} Ω。`,
      [changed.id, partner.id],
      { 'total:R': changes['total:R'] },
    ),
    makeStep(
      'current',
      'consequence',
      'ohms-law',
      `The EMF stays constant at ${fmt(e)} V, so the current ${DIR_EN[dI]} from ${fmt(iBefore)} A to ${fmt(iAfter)} A because I = EMF / R_total.`,
      `电动势保持 ${fmt(e)} V 不变，因此电流由 ${fmt(iBefore)} A ${DIR_ZH[dI]}到 ${fmt(iAfter)} A（I = E / R总）。`,
      [source.id],
      { 'total:I': changes['total:I'] },
    ),
    makeStep(
      'partner-pd',
      'consequence',
      'ohms-law',
      `The resistance of ${partnerLabel} is unchanged, so the p.d. across it ${DIR_EN[dVp]} from ${fmt(vpBefore)} V to ${fmt(vpAfter)} V because V = IR.`,
      `${partnerLabel} 的电阻保持不变，因此其两端电压由 ${fmt(vpBefore)} V ${DIR_ZH[dVp]}到 ${fmt(vpAfter)} V（U = IR）。`,
      [partner.id],
      { [`V:${partner.id}`]: changes[`V:${partner.id}`] },
    ),
    makeStep(
      'changed-pd',
      'conclusion',
      'kirchhoff-voltage',
      `The p.d. across ${changedLabel} therefore ${DIR_EN[dV]} from ${fmt(vBefore)} V to ${fmt(vAfter)} V, because the two p.d.s must add up to the constant EMF.`,
      `两个元件的电压之和等于不变的电动势，因此 ${changedLabel} 两端电压由 ${fmt(vBefore)} V ${DIR_ZH[dV]}到 ${fmt(vAfter)} V。`,
      [changed.id],
      { [`V:${changed.id}`]: changes[`V:${changed.id}`] },
    ),
  ];

  return {
    supported: true,
    ruleId: 'resistor-series-divider',
    title: { en: 'Resistance change in a series circuit', zh: '串联电路中的电阻变化' },
    cause: { en: causeEn, zh: causeZh },
    steps,
    markingPoints: buildMarkingPoints([
      [`The total resistance ${DIR_EN[dRt]}.`, `总电阻${DIR_ZH[dRt]}。`],
      [`The current ${DIR_EN[dI]} because I = EMF / R_total with constant EMF.`, `电动势不变，由 I = E / R总 可得电流${DIR_ZH[dI]}。`],
      [`The p.d. across ${partnerLabel} ${DIR_EN[dVp]} because V = IR with constant R.`, `${partnerLabel} 的电阻不变，由 U = IR 得其两端电压${DIR_ZH[dVp]}。`],
      [`The p.d. across ${changedLabel} ${DIR_EN[dV]} so that the p.d.s still add up to the EMF.`, `两个元件的电压之和仍等于电动势，因此 ${changedLabel} 两端电压${DIR_ZH[dV]}。`],
    ]),
    answer: { en: steps.map((s) => s.en).join(' '), zh: steps.map((s) => s.zh).join('') },
    summary: {
      en: `The total resistance ${RISE_EN[dRt]}, so the current ${DIR_EN[dI]}. The p.d. across ${partnerLabel} ${DIR_EN[dVp]} and the p.d. across ${changedLabel} ${DIR_EN[dV]}.`,
      zh: `总电阻${RISE_ZH[dRt]}，因此电流${DIR_ZH[dI]}；${partnerLabel} 两端电压${DIR_ZH[dVp]}，${changedLabel} 两端电压${DIR_ZH[dV]}。`,
    },
    changes,
    highlights: [changed.id, partner.id, source.id],
    markingScheme: 'software-authored',
  };
}

// ---------------------------------------------------------------------------
// Rule: supply EMF changed in a two-resistor series circuit
// ---------------------------------------------------------------------------

function explainSourceChange(
  ctx: Ctx,
  source: ComponentInstance,
  changes: Record<string, QuantityChange>,
): ExplainResult | null {
  const net = ctx.net;
  if (net.components.length !== 3) return null;
  const resistors = net.components.filter(isFixedResistor);
  if (resistors.length !== 2) return null;
  const [r1, r2] = resistors;
  if (!seriesIn(net, r1, r2) || !seriesIn(net, r1, source) || !seriesIn(net, r2, source)) return null;
  const r1Before = componentResistance(componentIn(ctx.before, r1.id) ?? r1);
  const r2Before = componentResistance(componentIn(ctx.before, r2.id) ?? r2);
  const r1After = componentResistance(r1);
  const r2After = componentResistance(r2);
  if (r1Before === null || r2Before === null || r1After === null || r2After === null) return null;
  if (!sameNumber(r1Before, r1After) || !sameNumber(r2Before, r2After)) return null;

  const eBefore = Math.abs(ctx.beforeSolution.components[source.id]?.terminalVoltage ?? 0);
  const eAfter = Math.abs(ctx.afterSolution.components[source.id]?.terminalVoltage ?? 0);
  const iBefore = currentThrough(ctx.beforeSolution, r1.id);
  const iAfter = currentThrough(ctx.afterSolution, r1.id);
  const v1Before = voltageAcross(ctx.beforeSolution, r1.id);
  const v1After = voltageAcross(ctx.afterSolution, r1.id);
  const v2Before = voltageAcross(ctx.beforeSolution, r2.id);
  const v2After = voltageAcross(ctx.afterSolution, r2.id);
  const rtBefore = ctx.beforeSolution.totalResistance ?? Number.POSITIVE_INFINITY;
  const rtAfter = ctx.afterSolution.totalResistance ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(rtBefore) || !Number.isFinite(rtAfter)) return null;
  if (!sameNumber(rtBefore, rtAfter, 1e-4)) return null;

  const dE = direction(eBefore, eAfter);
  if (dE === 'unchanged') return null;
  const dI = direction(iBefore, iAfter);
  const dV1 = direction(v1Before, v1After);
  const dV2 = direction(v2Before, v2After);
  if (dI !== dE || dV1 !== dE || dV2 !== dE) return null;

  const l1 = label(ctx, r1.id);
  const l2 = label(ctx, r2.id);
  const causeEn = `The EMF of the supply is ${dE === 'increase' ? 'increased' : 'decreased'} from ${fmt(eBefore)} V to ${fmt(eAfter)} V.`;
  const causeZh = `电源电动势由 ${fmt(eBefore)} V ${dE === 'increase' ? '增大' : '减小'}到 ${fmt(eAfter)} V。`;

  changes['total:R'] = { before: rtBefore, after: rtAfter, delta: rtAfter - rtBefore, direction: 'unchanged', unit: 'Ω' };
  changes['total:I'] = { before: iBefore, after: iAfter, delta: iAfter - iBefore, direction: dI, unit: 'A' };
  changes[`V:${r1.id}`] = { before: v1Before, after: v1After, delta: v1After - v1Before, direction: dV1, unit: 'V' };
  changes[`V:${r2.id}`] = { before: v2Before, after: v2After, delta: v2After - v2Before, direction: dV2, unit: 'V' };

  const steps = [
    makeStep('cause', 'cause', 'ohms-law', causeEn, causeZh, [source.id]),
    makeStep(
      'current',
      'consequence',
      'ohms-law',
      `The total resistance stays constant at ${fmt(rtBefore)} Ω, so the current ${DIR_EN[dI]} from ${fmt(iBefore)} A to ${fmt(iAfter)} A because I = EMF / R_total.`,
      `总电阻保持 ${fmt(rtBefore)} Ω 不变，因此电流由 ${fmt(iBefore)} A ${DIR_ZH[dI]}到 ${fmt(iAfter)} A（I = E / R总）。`,
      [r1.id, r2.id],
      { 'total:I': changes['total:I'] },
    ),
    makeStep(
      'r1-pd',
      'consequence',
      'ohms-law',
      `The p.d. across ${l1} ${DIR_EN[dV1]} from ${fmt(v1Before)} V to ${fmt(v1After)} V because V = IR.`,
      `由 U = IR 可知，${l1} 两端电压由 ${fmt(v1Before)} V ${DIR_ZH[dV1]}到 ${fmt(v1After)} V。`,
      [r1.id],
      { [`V:${r1.id}`]: changes[`V:${r1.id}`] },
    ),
    makeStep(
      'r2-pd',
      'conclusion',
      'potential-divider',
      `The p.d. across ${l2} ${DIR_EN[dV2]} from ${fmt(v2Before)} V to ${fmt(v2After)} V, keeping the two p.d.s equal to the new EMF.`,
      `${l2} 两端电压由 ${fmt(v2Before)} V ${DIR_ZH[dV2]}到 ${fmt(v2After)} V，两元件电压之和仍等于新的电动势。`,
      [r2.id],
      { [`V:${r2.id}`]: changes[`V:${r2.id}`] },
    ),
  ];

  return {
    supported: true,
    ruleId: 'source-emf-series',
    title: { en: 'Supply EMF change in a series circuit', zh: '串联电路中的电动势变化' },
    cause: { en: causeEn, zh: causeZh },
    steps,
    markingPoints: buildMarkingPoints([
      [`The EMF ${DIR_EN[dE]}.`, `电动势${DIR_ZH[dE]}。`],
      ['The total resistance is unchanged, so the current changes in proportion to the EMF.', '总电阻不变，因此电流与电动势成正比变化。'],
      [`The current ${DIR_EN[dI]}, so the p.d. across each resistor ${DIR_EN[dI]} because V = IR.`, `电流${DIR_ZH[dI]}，由 U = IR 可知每个电阻两端电压都${DIR_ZH[dI]}。`],
      ['The sum of the two p.d.s equals the new EMF.', '两个电阻的电压之和等于新的电动势。'],
    ]),
    answer: { en: steps.map((s) => s.en).join(' '), zh: steps.map((s) => s.zh).join('') },
    summary: {
      en: `With the resistance fixed, the current ${DIR_EN[dI]}, so the p.d. across each resistor ${DIR_EN[dI]}.`,
      zh: `电阻不变，电流${DIR_ZH[dI]}，因此每个电阻两端电压都${DIR_ZH[dI]}。`,
    },
    changes,
    highlights: [source.id, r1.id, r2.id],
    markingScheme: 'software-authored',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Explain a parameter change in a circuit using verified causal chains.
 * A rule is applied only when its structural preconditions hold AND every
 * predicted direction of change matches the numerical solution.
 */
export function explainChange(input: ExplainInput): ExplainResult {
  const changes = collectChanges(input);
  const designators = getDesignators(input.after);
  const labels: Record<string, string> = {};
  for (const comp of input.after.components) {
    labels[comp.id] = comp.label ?? designators[comp.id] ?? comp.id;
  }

  if (input.before.components.length === 0 || input.after.components.length === 0) {
    return emptyResult(
      'The circuit is empty. Add components and a source to see an explanation.',
      '电路为空。请添加元件和电源以查看解释。',
      { changes },
    );
  }
  if (!input.beforeSolution.ok) {
    return emptyResult(
      `The circuit cannot be solved yet (${input.beforeSolution.errors[0]?.message ?? input.beforeSolution.status}). Fix the circuit before asking for an explanation.`,
      `电路目前无法求解（${input.beforeSolution.errors[0]?.message ?? input.beforeSolution.status}）。请先修正电路。`,
      { changes },
    );
  }
  if (!input.afterSolution.ok) {
    return emptyResult(
      `The circuit cannot be solved after the change (${input.afterSolution.errors[0]?.message ?? input.afterSolution.status}). Fix the circuit before asking for an explanation.`,
      `更改后电路无法求解（${input.afterSolution.errors[0]?.message ?? input.afterSolution.status}）。请先修正电路。`,
      { changes },
    );
  }
  if (!sameTopology(input.before, input.after)) {
    return emptyResult(
      'The connections changed. The reasoning engine explains parameter changes such as light level, temperature, resistance and EMF — keep the same connections and change a value instead.',
      '电路的连接方式发生了变化。推理引擎解释的是光照、温度、电阻和电动势等参数变化，请在保持连接不变的情况下修改数值。',
      { changes },
    );
  }

  const paramChanges = findParamChanges(input.before, input.after);
  if (paramChanges.length === 0) {
    return emptyResult(
      'No physical change detected yet. Adjust a component parameter to see a causal explanation.',
      '尚未检测到物理量变化。请调整元件参数以查看因果解释。',
      { changes },
    );
  }
  if (paramChanges.length > 1) {
    return emptyResult(
      'More than one parameter changed at the same time, so a single causal chain cannot be verified. Change one quantity at a time.',
      '同时有多个参数发生变化，无法验证单条因果链。请每次只改变一个量。',
      { changes },
    );
  }

  const sourceBefore = sourceOf(input.before);
  const sourceAfter = sourceOf(input.after);
  if (!sourceBefore || !sourceAfter) {
    return emptyResult(
      'The reasoning engine needs a source (cell or battery) to build a causal explanation.',
      '推理引擎需要电源（电池）才能构建因果解释。',
      { changes },
    );
  }

  const ctx: Ctx = {
    before: input.before,
    after: input.after,
    beforeSolution: input.beforeSolution,
    afterSolution: input.afterSolution,
    labels,
    changes: paramChanges,
    net: analyzeNetwork(input.after),
    sourceBefore,
    sourceAfter,
  };

  const change = paramChanges[0];
  const comp = componentIn(input.after, change.componentId);
  if (!comp) return emptyResult('The changed component could not be identified.', '无法识别发生变化的元件。', { changes });

  let result: ExplainResult | null = null;
  switch (change.key) {
    case 'illuminance':
      if (comp.kind === 'ldr') result = explainSensorChange(ctx, comp, 'light', changes);
      break;
    case 'temperatureC':
      if (comp.kind === 'thermistor') result = explainSensorChange(ctx, comp, 'temperature', changes);
      break;
    case 'resistance':
      if (isFixedResistor(comp)) result = explainResistorChange(ctx, comp, changes);
      break;
    case 'emf':
      result = explainSourceChange(ctx, comp, changes);
      break;
    default:
      break;
  }

  if (result) return result;

  const friendlyKey: Record<string, string> = {
    illuminance: 'light intensity',
    temperatureC: 'temperature',
    resistance: 'resistance',
    emf: 'EMF',
    internalResistance: 'internal resistance',
    capacitance: 'capacitance',
    closed: 'switch state',
  };
  const what = friendlyKey[change.key] ?? change.key;
  return emptyResult(
    `A change in ${what} was detected, but the engine could not verify a complete causal chain for this circuit, so no explanation is given. The measured values are still correct.`,
    `检测到${what}发生了变化，但引擎无法验证该电路的完整因果链，因此不生成解释。上方测量值仍然有效。`,
    { changes, highlights: [comp.id] },
  );
}

/** Before/after rows for the Compare panel (R, I, V and P for every component). */
export function buildComparison(
  before: CircuitDocument,
  after: CircuitDocument,
  beforeSolution: CircuitSolution,
  afterSolution: CircuitSolution,
): ComparisonRow[] {
  const designators = getDesignators(after);
  const rows: ComparisonRow[] = [];
  const push = (
    comp: ComponentInstance,
    quantity: ComparisonRow['quantity'],
    unit: string,
    b: number,
    a: number,
  ) => {
    if (!Number.isFinite(b) && !Number.isFinite(a)) return;
    rows.push({
      componentId: comp.id,
      label: comp.label ?? designators[comp.id] ?? comp.id,
      kind: comp.kind,
      quantity,
      unit,
      before: b,
      after: a,
      direction: direction(b, a),
    });
  };
  for (const comp of after.components) {
    const beforeComp = before.components.find((c) => c.id === comp.id);
    if (!beforeComp) continue;
    const b = beforeSolution.components[comp.id];
    const a = afterSolution.components[comp.id];
    if (!b || !a) continue;
    const rb = componentResistance(beforeComp);
    const ra = componentResistance(comp);
    if (rb !== null && ra !== null && !isSourceKind(comp.kind)) {
      push(comp, 'resistance', 'Ω', Math.abs(rb), Math.abs(ra));
    }
    push(comp, 'current', 'A', b.currentMagnitude, a.currentMagnitude);
    // Ideal meters only report the quantity they are designed to measure.
    if (comp.kind !== 'ammeter') {
      push(comp, 'voltage', 'V', b.voltageMagnitude, a.voltageMagnitude);
    }
    if (comp.kind !== 'ammeter' && comp.kind !== 'voltmeter') {
      push(comp, 'power', 'W', Math.abs(b.power), Math.abs(a.power));
    }
  }
  return rows;
}
