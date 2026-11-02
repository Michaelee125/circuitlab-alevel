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
    // `totalResistance` is the external equivalent (terminal p.d./current).
    // The circuit total also includes the source's internal resistance.
    const sourceBefore = input.before.components.find((comp) => isSourceKind(comp.kind));
    const sourceAfter = input.after.components.find((comp) => isSourceKind(comp.kind));
    const internalBefore = sourceBefore?.params.internalResistance ?? 0;
    const internalAfter = sourceAfter?.params.internalResistance ?? 0;
    quantityChange(
      changes,
      'total:R',
      input.beforeSolution.totalResistance + internalBefore,
      input.afterSolution.totalResistance + internalAfter,
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
  if (!isIdealSource(ctx.before) || !isIdealSource(ctx.after)) return null;
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
// General rule: any single parameter change in any circuit
// ---------------------------------------------------------------------------

/**
 * Build a verified causal chain from the solved before/after states.
 *
 * Unlike the specialised rules above, this one requires no particular topology:
 * every directional claim comes from comparing the two solutions, and the
 * structure of the circuit only shapes the wording. That makes it usable for
 * rheostat + lamp, sensor + lamp, multi-branch networks, source changes,
 * switches and capacitors.
 */
function explainGeneralChange(
  ctx: Ctx,
  changed: ComponentInstance,
  change: ParamChange,
  changes: Record<string, QuantityChange>,
): ExplainResult | null {
  const beforeComp = componentIn(ctx.before, changed.id);
  if (!beforeComp) return null;
  const bSol = ctx.beforeSolution;
  const aSol = ctx.afterSolution;
  const source = ctx.sourceAfter;
  const sourceBefore = ctx.sourceBefore;
  const changedLabel = label(ctx, changed.id);
  const sourceLabel = label(ctx, source.id);
  const isSourceChange = isSourceKind(changed.kind);
  const isCapacitor = changed.kind === 'capacitor';
  const isSwitch = changed.kind === 'switch';
  const isLamp = changed.kind === 'lamp';
  const isSensor = changed.kind === 'ldr' || changed.kind === 'thermistor';
  const isDiode = changed.kind === 'diode';

  const emfB = Math.abs(sourceBefore.params.emf ?? 0);
  const emfA = Math.abs(source.params.emf ?? 0);
  const rIntB = sourceBefore.params.internalResistance ?? 0;
  const rIntA = source.params.internalResistance ?? 0;
  const iB = Math.abs(bSol.components[sourceBefore.id]?.current ?? 0);
  const iA = Math.abs(aSol.components[source.id]?.current ?? 0);
  const vtB = Math.abs(bSol.components[sourceBefore.id]?.terminalVoltage ?? emfB);
  const vtA = Math.abs(aSol.components[source.id]?.terminalVoltage ?? emfA);
  const rtB = bSol.totalResistance;
  const rtA = aSol.totalResistance;
  const finitePair = (a: number | null, b: number | null): boolean =>
    a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b);
  const dI = direction(iB, iA, 1e-4);
  const dVt = direction(vtB, vtA, 1e-4);
  const dEmf = direction(emfB, emfA, 1e-5);
  const dRext = finitePair(rtB, rtA) ? direction(rtB as number, rtA as number, 1e-4) : 'unchanged';
  const openBefore = iB < 1e-9;
  const openAfter = iA < 1e-9;
  const observedR = (comp: ComponentInstance, before: boolean): number | null => {
    if (isSourceKind(comp.kind)) return comp.params.internalResistance ?? 0;
    if (comp.kind === 'resistor' || comp.kind === 'variable-resistor') return comp.params.resistance ?? 10;
    if (comp.kind === 'ldr' || comp.kind === 'thermistor') return componentResistance(comp);
    if (comp.kind === 'switch') return comp.params.closed === false ? Number.POSITIVE_INFINITY : 0;
    const reading = (before ? bSol : aSol).components[comp.id];
    const value = reading?.resistance;
    return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
  };

  const rB = observedR(beforeComp, true);
  const rA = observedR(changed, false);
  const dR = rB !== null && rA !== null ? direction(rB, rA, 1e-5) : 'unchanged';
  const steps: ReasoningStep[] = [];
  const push = (
    id: string,
    kind: ReasoningStep['kind'],
    law: ReasoningStep['law'],
    en: string,
    zh: string,
    highlight: string[] = [changed.id],
    quantities?: Record<string, QuantityChange>,
  ) => {
    steps.push(makeStep(id, kind, law, en, zh, highlight, quantities));
  };

  // --- cause -----------------------------------------------------------------
  let causeEn = '';
  let causeZh = '';
  let titleEn = 'Circuit response to a parameter change';
  let titleZh = '电路对参数变化的响应';
  let ruleId = 'network-change';

  if (change.key === 'illuminance' && isSensor) {
    const dir = direction(Number(change.before ?? 0), Number(change.after ?? 0), 1e-5);
    causeEn = `The light intensity on ${changedLabel} ${dir === 'increase' ? 'increases' : 'decreases'}.`;
    causeZh = `${changedLabel} 受到的光照强度${dir === 'increase' ? '增大' : '减小'}。`;
    titleEn = `Light change on ${changedLabel}`;
    titleZh = `${changedLabel} 的光照变化`;
    ruleId = 'network-sensor-light';
  } else if (change.key === 'temperatureC' && isSensor) {
    const dir = direction(Number(change.before ?? 0), Number(change.after ?? 0), 1e-5);
    causeEn = `The temperature of ${changedLabel} ${dir === 'increase' ? 'rises' : 'falls'}.`;
    causeZh = `${changedLabel} 的温度${dir === 'increase' ? '升高' : '降低'}。`;
    titleEn = `Temperature change on ${changedLabel}`;
    titleZh = `${changedLabel} 的温度变化`;
    ruleId = 'network-sensor-temperature';
  } else if (change.key === 'closed' && isSwitch) {
    const nowOpen = changed.params.closed === false;
    causeEn = nowOpen ? `The switch ${changedLabel} is opened.` : `The switch ${changedLabel} is closed.`;
    causeZh = nowOpen ? `开关 ${changedLabel} 被断开。` : `开关 ${changedLabel} 被闭合。`;
    titleEn = nowOpen ? 'Opening a switch' : 'Closing a switch';
    titleZh = nowOpen ? '断开开关' : '闭合开关';
    ruleId = 'network-switch';
  } else if (isCapacitor) {
    const cb = Number(beforeComp.params.capacitance ?? 0);
    const ca = Number(changed.params.capacitance ?? 0);
    const dir = direction(cb, ca, 1e-6);
    causeEn = `The capacitance of ${changedLabel} is ${dir === 'increase' ? 'increased' : 'decreased'} from ${fmt(cb * 1e6)} µF to ${fmt(ca * 1e6)} µF.`;
    causeZh = `${changedLabel} 的电容由 ${fmt(cb * 1e6)} µF ${dir === 'increase' ? '增大' : '减小'}到 ${fmt(ca * 1e6)} µF。`;
    titleEn = 'Capacitance change (transient)';
    titleZh = '电容变化（暂态）';
    ruleId = 'network-capacitance';
  } else if (change.key === 'emf' && isSourceChange) {
    causeEn = `The EMF of ${changedLabel} is ${dEmf === 'increase' ? 'increased' : 'decreased'} from ${fmt(emfB)} V to ${fmt(emfA)} V.`;
    causeZh = `${changedLabel} 的电动势由 ${fmt(emfB)} V ${dEmf === 'increase' ? '增大' : '减小'}到 ${fmt(emfA)} V。`;
    titleEn = 'Supply EMF change';
    titleZh = '电源电动势变化';
    ruleId = 'network-source-emf';
  } else if (change.key === 'internalResistance' && isSourceChange) {
    const dir = direction(rIntB, rIntA, 1e-6);
    causeEn = `The internal resistance of ${changedLabel} is ${dir === 'increase' ? 'increased' : 'decreased'} from ${fmt(rIntB)} Ω to ${fmt(rIntA)} Ω.`;
    causeZh = `${changedLabel} 的内阻由 ${fmt(rIntB)} Ω ${dir === 'increase' ? '增大' : '减小'}到 ${fmt(rIntA)} Ω。`;
    titleEn = 'Internal resistance change';
    titleZh = '电源内阻变化';
    ruleId = 'network-internal-resistance';
  } else if (change.key === 'wiper' && changed.kind === 'potentiometer') {
    const beforeWiper = Number(change.before ?? 0.5);
    const afterWiper = Number(change.after ?? 0.5);
    const towardA = afterWiper > beforeWiper;
    causeEn = `The wiper of ${changedLabel} is moved ${towardA ? 'towards A' : 'towards B'} (from ${Math.round(beforeWiper * 100)}% to ${Math.round(afterWiper * 100)}%).`;
    causeZh = `${changedLabel} 的滑片向 ${towardA ? 'A' : 'B'} 端移动（由 ${Math.round(beforeWiper * 100)}% 到 ${Math.round(afterWiper * 100)}%）。`;
    titleEn = 'Adjusting a potential divider';
    titleZh = '调节分压器';
    ruleId = 'network-potentiometer';
  } else if (isLamp) {
    causeEn = `The lamp ${changedLabel} is adjusted; its operating resistance changes from ${rB === null ? '—' : `${fmt(rB)} Ω`} to ${rA === null ? '—' : `${fmt(rA)} Ω`}.`;
    causeZh = `灯泡 ${changedLabel} 的特性改变，其工作电阻由 ${rB === null ? '—' : `${fmt(rB)} Ω`} 变为 ${rA === null ? '—' : `${fmt(rA)} Ω`}。`;
    titleEn = `Lamp ${changedLabel} in a circuit`;
    titleZh = `电路中的灯泡 ${changedLabel}`;
    ruleId = 'network-lamp';
  } else if (change.key === 'resistance' || change.key === 'coldResistance' || change.key === 'thermalCoefficient') {
    if (rB !== null && rA !== null && Number.isFinite(rB) && Number.isFinite(rA)) {
      causeEn = `The resistance of ${changedLabel} is ${dR === 'increase' ? 'increased' : 'decreased'} from ${fmt(rB)} Ω to ${fmt(rA)} Ω.`;
      causeZh = `${changedLabel} 的电阻由 ${fmt(rB)} Ω ${dR === 'increase' ? '增大' : '减小'}到 ${fmt(rA)} Ω。`;
    } else {
      causeEn = `The resistance setting of ${changedLabel} is changed.`;
      causeZh = `${changedLabel} 的电阻设置发生变化。`;
    }
    titleEn = changed.kind === 'variable-resistor' ? 'Adjusting a variable resistor' : 'Resistance change';
    titleZh = changed.kind === 'variable-resistor' ? '调节可变电阻' : '电阻变化';
    ruleId = 'network-resistance';
  } else if (isDiode) {
    causeEn = `The characteristics of ${changedLabel} are changed; its effective resistance changes from ${rB === null ? '—' : `${fmt(rB)} Ω`} to ${rA === null ? '—' : `${fmt(rA)} Ω`}.`;
    causeZh = `${changedLabel} 的特性发生变化，其等效电阻由 ${rB === null ? '—' : `${fmt(rB)} Ω`} 变为 ${rA === null ? '—' : `${fmt(rA)} Ω`}。`;
    titleEn = `Diode ${changedLabel} in a circuit`;
    titleZh = `电路中的二极管 ${changedLabel}`;
    ruleId = 'network-diode';
  } else {
    // Any other documented parameter: state the change generically.
    causeEn = `A parameter of ${changedLabel} is changed${rB !== null && rA !== null ? `, and its resistance changes from ${fmt(rB)} Ω to ${fmt(rA)} Ω` : ''}.`;
    causeZh = `${changedLabel} 的参数发生变化${rB !== null && rA !== null ? `，其电阻由 ${fmt(rB)} Ω 变为 ${fmt(rA)} Ω` : ''}。`;
    ruleId = 'network-generic';
  }
  push('cause', 'cause', isSensor ? (changed.kind === 'ldr' ? 'ldr-property' : 'thermistor-property') : isSourceChange ? 'internal-resistance' : 'ohms-law', causeEn, causeZh);
  if (isSensor && rB !== null && rA !== null && dR !== 'unchanged') {
    push(
      'resistance',
      'change',
      changed.kind === 'ldr' ? 'ldr-property' : 'thermistor-property',
      `The resistance of ${changedLabel} ${RISE_EN[dR]} from ${fmt(rB)} Ω to ${fmt(rA)} Ω.`,
      `${changedLabel} 的电阻由 ${fmt(rB)} Ω ${RISE_ZH[dR]}到 ${fmt(rA)} Ω。`,
      [changed.id],
      { [`R:${changed.id}`]: { before: rB, after: rA, delta: rA - rB, direction: dR, unit: 'Ω' } },
    );
  }

  if (change.key === 'wiper' && changed.kind === 'potentiometer') {
    const rTotalBefore = Number(beforeComp.params.resistance ?? 100);
    const rTotalAfter = Number(changed.params.resistance ?? 100);
    const fBefore = Math.min(1, Math.max(0, Number(beforeComp.params.wiper ?? 0.5)));
    const fAfter = Math.min(1, Math.max(0, Number(changed.params.wiper ?? 0.5)));
    const awBefore = Math.max(1e-3, (1 - fBefore) * rTotalBefore);
    const wbBefore = Math.max(1e-3, fBefore * rTotalBefore);
    const awAfter = Math.max(1e-3, (1 - fAfter) * rTotalAfter);
    const wbAfter = Math.max(1e-3, fAfter * rTotalAfter);
    const vBefore = Math.abs(bSol.components[changed.id]?.extra?.wiperVoltage ?? 0);
    const vAfter = Math.abs(aSol.components[changed.id]?.extra?.wiperVoltage ?? 0);
    const dWb = direction(wbBefore, wbAfter, 1e-5);
    const dAw = direction(awBefore, awAfter, 1e-5);
    const dV = direction(vBefore, vAfter, 1e-4);
    push(
      'wiper-sections',
      'change',
      'potential-divider',
      `The wiper taps the track at a new point: the W–B section ${RISE_EN[dWb]} from ${fmt(wbBefore)} Ω to ${fmt(wbAfter)} Ω, while the A–W section ${RISE_EN[dAw]} from ${fmt(awBefore)} Ω to ${fmt(awAfter)} Ω.`,
      `滑片移到新的位置：W–B 段电阻由 ${fmt(wbBefore)} Ω ${RISE_ZH[dWb]}到 ${fmt(wbAfter)} Ω，A–W 段电阻由 ${fmt(awBefore)} Ω ${RISE_ZH[dAw]}到 ${fmt(awAfter)} Ω。`,
      [changed.id],
    );
    if (dV !== 'unchanged') {
      push(
        'wiper-output',
        'conclusion',
        'potential-divider',
        `The output p.d. across W–B ${DIR_EN[dV]} from ${fmt(vBefore)} V to ${fmt(vAfter)} V because V_WB = (R_WB / R_total) × V_AB.`,
        `W–B 端输出电压由 ${fmt(vBefore)} V ${DIR_ZH[dV]}到 ${fmt(vAfter)} V，因为 U_WB = (R_WB / R_total) × U_AB。`,
        [changed.id],
      );
    }
  }

  if (isCapacitor) {
    const rc = ctx.net.components.find((c) => c.kind === 'resistor' || c.kind === 'variable-resistor' || c.kind === 'lamp');
    const rValue = rc ? observedR(rc, false) : null;
    const tauBefore = rValue !== null ? rValue * Number(beforeComp.params.capacitance ?? 0) : null;
    const tauAfter = rValue !== null ? rValue * Number(changed.params.capacitance ?? 0) : null;
    const dTau = tauBefore !== null && tauAfter !== null ? direction(tauBefore, tauAfter, 1e-4) : 'unchanged';
    const unchanged = dI === 'unchanged' && dVt === 'unchanged';
    push(
      'time-constant',
      'consequence',
      'ohms-law',
      tauAfter !== null
        ? `The time constant of the RC network ${dTau === 'unchanged' ? `stays at τ = RC = ${fmt(tauAfter)} s` : `${dTau === 'increase' ? 'rises' : 'falls'} from τ = ${fmt(tauBefore as number)} s to ${fmt(tauAfter)} s`}, so the capacitor charges and discharges ${dTau === 'increase' ? 'more slowly' : dTau === 'decrease' ? 'more quickly' : 'at the same rate'}.`
        : 'The capacitor changes how quickly the circuit reaches steady state, but not its final steady state.',
      tauAfter !== null
        ? `RC 网络的时间常数${dTau === 'unchanged' ? `保持 τ = RC = ${fmt(tauAfter)} s` : `由 τ = ${fmt(tauBefore as number)} s ${DIR_ZH[dTau]}到 ${fmt(tauAfter)} s`}，因此电容充放电${dTau === 'increase' ? '变慢' : dTau === 'decrease' ? '变快' : '快慢不变'}。`
        : '电容只会改变电路达到稳态的快慢，不会改变最终的稳态。',
      [changed.id, ...(rc ? [rc.id] : [])],
    );
    if (unchanged) {
      push(
        'steady-state',
        'conclusion',
        'kirchhoff-current',
        'At steady state a capacitor carries no direct current, so the currents and potential differences in the rest of the circuit are unchanged.',
        '稳态下电容不通过直流电流，因此电路其余部分的电流和电压保持不变。',
        [changed.id],
      );
    }
    return {
      supported: true,
      ruleId,
      title: { en: titleEn, zh: titleZh },
      cause: { en: causeEn, zh: causeZh },
      steps,
      markingPoints: buildMarkingPoints([
        [`The capacitance changes from ${fmt(Number(beforeComp.params.capacitance ?? 0) * 1e6)} µF to ${fmt(Number(changed.params.capacitance ?? 0) * 1e6)} µF.`, `电容由 ${fmt(Number(beforeComp.params.capacitance ?? 0) * 1e6)} µF 变为 ${fmt(Number(changed.params.capacitance ?? 0) * 1e6)} µF。`],
        ['The time constant τ = RC changes, so the charging time changes.', '时间常数 τ = RC 改变，因此充电时间改变。'],
        ['At steady state the capacitor is fully charged and no direct current flows, so the final readings are unchanged.', '稳态下电容充满且无直流电流，因此最终读数不变。'],
      ]),
      answer: { en: steps.map((s) => s.en).join(' '), zh: steps.map((s) => s.zh).join('') },
      summary: {
        en: 'A capacitor only changes the transient behaviour; the steady-state readings stay the same.',
        zh: '电容只改变暂态过程，稳态读数保持不变。',
      },
      changes,
      highlights: [changed.id, ...(rc ? [rc.id] : [])],
      markingScheme: 'software-authored',
    };
  }

  // --- total resistance and current -----------------------------------------
  if (isSourceChange && change.key === 'internalResistance') {
    push(
      'external-resistance',
      'law',
      'ohms-law',
      finitePair(rtB, rtA)
        ? `Together with the external circuit, the total resistance ${RISE_EN[direction((rtB as number) + rIntB, (rtA as number) + rIntA, 1e-4)]} from ${fmt((rtB as number) + rIntB)} Ω to ${fmt((rtA as number) + rIntA)} Ω.`
        : 'The internal resistance changes, so the total resistance of the circuit changes.',
      finitePair(rtB, rtA)
        ? `加上外电路后，总电阻由 ${fmt((rtB as number) + rIntB)} Ω ${RISE_ZH[direction((rtB as number) + rIntB, (rtA as number) + rIntA, 1e-4)]}到 ${fmt((rtA as number) + rIntA)} Ω。`
        : '内阻变化，因此电路总电阻改变。',
      [source.id],
    );
  } else if (!isSourceChange && finitePair(rtB, rtA)) {
    const totalB = (rtB as number) + rIntB;
    const totalA = (rtA as number) + rIntA;
    const dTotal = direction(totalB, totalA, 1e-4);
    push(
      'total-resistance',
      dTotal === 'unchanged' ? 'law' : 'consequence',
      'series-resistance',
      dTotal === 'unchanged'
        ? `The total resistance stays at ${fmt(totalA)} Ω (external ${fmt(rtA as number)} Ω + internal ${fmt(rIntA)} Ω).`
        : `The total resistance of the circuit ${RISE_EN[dTotal]} from ${fmt(totalB)} Ω to ${fmt(totalA)} Ω (external ${fmt(rtB as number)} → ${fmt(rtA as number)} Ω + internal ${fmt(rIntB)} → ${fmt(rIntA)} Ω).`,
      dTotal === 'unchanged'
        ? `总电阻保持 ${fmt(totalA)} Ω 不变（外电路 ${fmt(rtA as number)} Ω + 内阻 ${fmt(rIntA)} Ω）。`
        : `电路总电阻由 ${fmt(totalB)} Ω ${RISE_ZH[dTotal]}到 ${fmt(totalA)} Ω（外电路 ${fmt(rtB as number)} → ${fmt(rtA as number)} Ω + 内阻 ${fmt(rIntB)} → ${fmt(rIntA)} Ω）。`,
      [changed.id, source.id],
      { 'total:R': { before: totalB, after: totalA, delta: totalA - totalB, direction: dTotal, unit: 'Ω' } },
    );
  }

  if (openAfter && !openBefore) {
    push(
      'current',
      'consequence',
      'ohms-law',
      `The current through ${sourceLabel} falls to zero from ${fmt(iB)} A because the circuit is now open.`,
      `电路断开，因此通过 ${sourceLabel} 的电流由 ${fmt(iB)} A 减小到零。`,
      [source.id, changed.id],
      { 'total:I': { before: iB, after: 0, delta: -iB, direction: 'decrease', unit: 'A' } },
    );
  } else if (!openBefore || !openAfter) {
    let reasonEn = 'because I = EMF / R_total with the EMF constant';
    let reasonZh = '因为电动势不变，I = E / R总';
    if (change.key === 'emf') {
      reasonEn = `because the EMF is ${dEmf === 'increase' ? 'larger' : 'smaller'}`;
      reasonZh = `因为电动势${dEmf === 'increase' ? '增大' : '减小'}`;
    } else if (change.key === 'internalResistance') {
      reasonEn = 'because the lost volts I·r change';
      reasonZh = '因为内阻上的损失电压 I·r 改变';
    }
    if (dI !== 'unchanged' || openAfter) {
      push(
        'current',
        'consequence',
        'ohms-law',
        `The current through ${sourceLabel} ${DIR_EN[dI]} from ${fmt(iB)} A to ${fmt(iA)} A ${reasonEn}.`,
        `通过 ${sourceLabel} 的电流由 ${fmt(iB)} A ${DIR_ZH[dI]}到 ${fmt(iA)} A，${reasonZh}。`,
        [source.id],
        { 'total:I': { before: iB, after: iA, delta: iA - iB, direction: dI, unit: 'A' } },
      );
    }
  }

  if (change.key === 'emf' && finitePair(rtB, rtA) && dRext !== 'unchanged') {
    push(
      'operating-point',
      'consequence',
      'ohms-law',
      `The changing current alters the operating temperature (and so the resistance) of the non-ohmic components: the equivalent resistance of the circuit ${RISE_EN[dRext]} from ${fmt(rtB as number)} Ω to ${fmt(rtA as number)} Ω, so the current does not change in proportion to the EMF.`,
      `电流变化改变了非线性元件的温度（从而改变其电阻），电路等效电阻由 ${fmt(rtB as number)} Ω ${RISE_ZH[dRext]}到 ${fmt(rtA as number)} Ω，因此电流并不与电动势成正比。`,
      [changed.id, source.id],
      { 'total:R': { before: rtB as number, after: rtA as number, delta: (rtA as number) - (rtB as number), direction: dRext, unit: 'Ω' } },
    );
  }

  // --- terminal p.d. ---------------------------------------------------------
  if ((rIntA > 1e-9 || rIntB > 1e-9) && dVt !== 'unchanged') {
    push(
      'terminal-pd',
      'consequence',
      'internal-resistance',
      `The terminal p.d. of ${sourceLabel} ${DIR_EN[dVt]} from ${fmt(vtB)} V to ${fmt(vtA)} V because V = EMF − I·r (lost volts).`,
      `${sourceLabel} 的端电压由 ${fmt(vtB)} V ${DIR_ZH[dVt]}到 ${fmt(vtA)} V（U = E − I·r，损失电压改变）。`,
      [source.id],
      { [`V:${source.id}`]: { before: vtB, after: vtA, delta: vtA - vtB, direction: dVt, unit: 'V' } },
    );
  }

  if (isSwitch) {
    const swB = bSol.components[changed.id];
    const swA = aSol.components[changed.id];
    if (swB && swA) {
      const vb = Math.abs(swB.voltageMagnitude);
      const va = Math.abs(swA.voltageMagnitude);
      if (direction(vb, va, 1e-4) !== 'unchanged') {
        const open = changed.params.closed === false;
        push(
          'switch-pd',
          'conclusion',
          'kirchhoff-voltage',
          open
            ? `The p.d. across the open switch rises to ${fmt(va)} V, taking the full EMF of the supply.`
            : `The p.d. across the closed switch falls to ${fmt(va)} V (an ideal closed switch has no p.d.).`,
          open
            ? `断开开关两端电压升高到 ${fmt(va)} V，承担全部电源电动势。`
            : `闭合开关两端电压降为 ${fmt(va)} V（理想闭合开关两端无电压）。`,
          [changed.id],
          { [`V:${changed.id}`]: { before: vb, after: va, delta: va - vb, direction: direction(vb, va, 1e-4), unit: 'V' } },
        );
      }
    }
  }

  // --- changed component p.d. ------------------------------------------------
  const readingB = bSol.components[changed.id];
  const readingA = aSol.components[changed.id];
  if (!isSourceChange && !isSwitch && readingB && readingA && !isCapacitor) {
    const vB = Math.abs(readingB.voltageMagnitude);
    const vA = Math.abs(readingA.voltageMagnitude);
    const dV = direction(vB, vA, 1e-4);
    if (dV !== 'unchanged') {
      push(
        'changed-pd',
        'consequence',
        'ohms-law',
        `The p.d. across ${changedLabel} ${DIR_EN[dV]} from ${fmt(vB)} V to ${fmt(vA)} V because its resistance and the current through it both change.`,
        `${changedLabel} 两端电压由 ${fmt(vB)} V ${DIR_ZH[dV]}到 ${fmt(vA)} V，因为其电阻和通过它的电流都发生变化。`,
        [changed.id],
        { [`V:${changed.id}`]: { before: vB, after: vA, delta: vA - vB, direction: dV, unit: 'V' } },
      );
    }
    if (isLamp) {
      const pB = Math.abs(readingB.power);
      const pA = Math.abs(readingA.power);
      const dP = direction(pB, pA, 1e-4);
      if (dP !== 'unchanged') {
        push(
          'lamp-brightness',
          'conclusion',
          'ohms-law',
          pA < 1e-9
            ? `The power dissipated by the lamp falls from ${fmt(pB)} W to zero, so the lamp goes out.`
            : pB < 1e-9
              ? `The power dissipated by the lamp rises from zero to ${fmt(pA)} W, so the lamp lights up.`
              : `The power dissipated by the lamp changes from ${fmt(pB)} W to ${fmt(pA)} W (P = VI), so the lamp becomes ${dP === 'increase' ? 'brighter' : 'dimmer'}.`,
          pA < 1e-9
            ? `灯泡的功率由 ${fmt(pB)} W 降为零，因此灯泡熄灭。`
            : pB < 1e-9
              ? `灯泡的功率由零升高到 ${fmt(pA)} W，因此灯泡亮起。`
              : `灯泡的功率由 ${fmt(pB)} W 变为 ${fmt(pA)} W（P = UI），因此灯泡变${dP === 'increase' ? '亮' : '暗'}。`,
          [changed.id],
          { [`P:${changed.id}`]: { before: pB, after: pA, delta: pA - pB, direction: dP, unit: 'W' } },
        );
      }
    }
  }

  // --- other components ------------------------------------------------------
  const unaffected: ComponentInstance[] = [];
  const others = ctx.net.components.filter(
    (c) => c.id !== changed.id && !isSourceKind(c.kind),
  );
  for (const comp of others) {
    const beforeOther = componentIn(ctx.before, comp.id);
    if (!beforeOther) continue;
    const rb = bSol.components[comp.id];
    const ra = aSol.components[comp.id];
    if (!rb || !ra) continue;
    const vB = Math.abs(rb.voltageMagnitude);
    const vA = Math.abs(ra.voltageMagnitude);
    const iBefore = Math.abs(rb.currentMagnitude);
    const iAfter = Math.abs(ra.currentMagnitude);
    const dV = direction(vB, vA, 1e-4);
    const dIC = direction(iBefore, iAfter, 1e-4);
    if (dV === 'unchanged' && dIC === 'unchanged') {
      if (vA > 1e-6) unaffected.push(comp);
      continue;
    }
    const compLabel = label(ctx, comp.id);
    if (isSwitch && vA < 1e-6 && vB > 1e-6) {
      push(
        `pd:${comp.id}`,
        'consequence',
        'ohms-law',
        comp.kind === 'lamp'
          ? `The p.d. across ${compLabel} falls to zero because no current flows, so the lamp goes out.`
          : `The p.d. across ${compLabel} falls to zero because no current flows.`,
        comp.kind === 'lamp'
          ? `${compLabel} 两端电压降为零（无电流），灯泡熄灭。`
          : `${compLabel} 两端电压降为零（无电流）。`,
        [comp.id],
        { [`V:${comp.id}`]: { before: vB, after: vA, delta: vA - vB, direction: 'decrease', unit: 'V' } },
      );
      continue;
    }
    const rBeforeC = observedR(beforeOther, true);
    const rAfterC = observedR(comp, false);
    const rConstant =
      rBeforeC !== null && rAfterC !== null && (Math.abs(rAfterC - rBeforeC) <= Math.max(1e-6, Math.abs(rBeforeC) * 0.005));
    if (dIC !== 'unchanged' && rConstant && rAfterC !== null) {
      push(
        `pd:${comp.id}`,
        'consequence',
        'ohms-law',
        `The resistance of ${compLabel} stays at ${fmt(rAfterC)} Ω, so the p.d. across it ${DIR_EN[dV]} from ${fmt(vB)} V to ${fmt(vA)} V because V = IR.`,
        `${compLabel} 的电阻保持 ${fmt(rAfterC)} Ω 不变，由 U = IR 可知其两端电压由 ${fmt(vB)} V ${DIR_ZH[dV]}到 ${fmt(vA)} V。`,
        [comp.id],
        { [`V:${comp.id}`]: { before: vB, after: vA, delta: vA - vB, direction: dV, unit: 'V' } },
      );
    } else if (dIC !== 'unchanged') {
      push(
        `pd:${comp.id}`,
        'consequence',
        'ohms-law',
        `The current through ${compLabel} changes from ${fmt(iBefore)} A to ${fmt(iAfter)} A, and its effective resistance changes${rBeforeC !== null && rAfterC !== null ? ` from ${fmt(rBeforeC)} Ω to ${fmt(rAfterC)} Ω` : ''}, so its p.d. ${DIR_EN[dV]} from ${fmt(vB)} V to ${fmt(vA)} V.`,
        `通过 ${compLabel} 的电流由 ${fmt(iBefore)} A 变为 ${fmt(iAfter)} A${rBeforeC !== null && rAfterC !== null ? `，其等效电阻由 ${fmt(rBeforeC)} Ω 变为 ${fmt(rAfterC)} Ω` : ''}，因此其两端电压由 ${fmt(vB)} V ${DIR_ZH[dV]}到 ${fmt(vA)} V。`,
        [comp.id],
        { [`V:${comp.id}`]: { before: vB, after: vA, delta: vA - vB, direction: dV, unit: 'V' } },
      );
    }
    if (comp.kind === 'lamp') {
      const pB = Math.abs(rb.power);
      const pA = Math.abs(ra.power);
      const dP = direction(pB, pA, 1e-4);
      if (dP !== 'unchanged') {
        push(
          `lamp:${comp.id}`,
          'conclusion',
          'ohms-law',
          pA < 1e-9
            ? `The power dissipated by ${compLabel} falls to zero, so the lamp goes out.`
            : pB < 1e-9
              ? `The power dissipated by ${compLabel} rises from zero, so the lamp lights up.`
              : `The power dissipated by ${compLabel} changes from ${fmt(pB)} W to ${fmt(pA)} W, so it becomes ${dP === 'increase' ? 'brighter' : 'dimmer'}.`,
          pA < 1e-9
            ? `${compLabel} 的功率降为零，因此灯泡熄灭。`
            : pB < 1e-9
              ? `${compLabel} 的功率由零升高，因此灯泡亮起。`
              : `${compLabel} 的功率由 ${fmt(pB)} W 变为 ${fmt(pA)} W，因此变${dP === 'increase' ? '亮' : '暗'}。`,
          [comp.id],
          { [`P:${comp.id}`]: { before: pB, after: pA, delta: pA - pB, direction: dP, unit: 'W' } },
        );
      }
    }
  }

  if (unaffected.length > 0) {
    const namesEn = unaffected.map((c) => label(ctx, c.id)).join(', ');
    const namesZh = unaffected.map((c) => label(ctx, c.id)).join('、');
    push(
      'unaffected',
      'conclusion',
      'parallel-voltage',
      `The current and p.d. of ${namesEn} stay the same because the terminal p.d. of the supply and their resistances do not change.`,
      `${namesZh} 的电流和电压保持不变，因为电源端电压和它们的电阻都没有变化。`,
      unaffected.map((c) => c.id),
    );
  }

  // --- meters ----------------------------------------------------------------
  const meterReadings: string[] = [];
  const meterReadingsZh: string[] = [];
  for (const meter of ctx.after.components) {
    if (meter.kind !== 'ammeter' && meter.kind !== 'voltmeter') continue;
    const b = bSol.components[meter.id];
    const a = aSol.components[meter.id];
    if (!b || !a) continue;
    if (meter.kind === 'ammeter') {
      const d = direction(b.currentMagnitude, a.currentMagnitude, 1e-4);
      if (d !== 'unchanged') {
        meterReadings.push(`${label(ctx, meter.id)} ${DIR_EN[d]} from ${fmt(b.currentMagnitude)} A to ${fmt(a.currentMagnitude)} A`);
        meterReadingsZh.push(`${label(ctx, meter.id)} 的读数由 ${fmt(b.currentMagnitude)} A ${DIR_ZH[d]}到 ${fmt(a.currentMagnitude)} A`);
      }
    } else {
      const d = direction(b.voltageMagnitude, a.voltageMagnitude, 1e-4);
      if (d !== 'unchanged') {
        meterReadings.push(`${label(ctx, meter.id)} ${DIR_EN[d]} from ${fmt(b.voltageMagnitude)} V to ${fmt(a.voltageMagnitude)} V`);
        meterReadingsZh.push(`${label(ctx, meter.id)} 的读数由 ${fmt(b.voltageMagnitude)} V ${DIR_ZH[d]}到 ${fmt(a.voltageMagnitude)} V`);
      }
    }
  }
  if (meterReadings.length > 0) {
    // Reads better as "X falls from a to b and Y falls from c to d"; the
    // direction word is derived per meter for the Chinese version.
    const en = meterReadings.join(meterReadings.length > 1 ? '; ' : '');
    const zh = meterReadingsZh.join('；');
    push('meters', 'consequence', 'ohms-law', `${en.charAt(0).toUpperCase()}${en.slice(1)}.`, `${zh}。`, []);
  }

  if (steps.length <= 1) return null;

  const changedDir = dR !== 'unchanged' ? dR : dI;
  const affectedLabels = others
    .filter((c) => {
      const b = bSol.components[c.id];
      const a = aSol.components[c.id];
      return b && a && (direction(Math.abs(b.voltageMagnitude), Math.abs(a.voltageMagnitude), 1e-4) !== 'unchanged');
    })
    .map((c) => label(ctx, c.id));
  const highlights = [changed.id, source.id, ...others.filter((c) => affectedLabels.includes(label(ctx, c.id))).map((c) => c.id)];
  const lampChanged = [...ctx.net.components, changed].some((c) => c.kind === 'lamp' && (() => {
    const b = bSol.components[c.id];
    const a = aSol.components[c.id];
    return b && a && direction(Math.abs(b.power), Math.abs(a.power), 1e-4) !== 'unchanged';
  })());

  let summaryEn = 'The circuit responds as described by the steps above.';
  let summaryZh = '电路的变化如上所述。';
  if (change.key === 'emf') {
    summaryEn = `The EMF ${dEmf === 'increase' ? 'increases' : 'decreases'}, so the current ${DIR_EN[dI]} and the p.d. across every component ${DIR_EN[dI]}.`;
    summaryZh = `电动势${DIR_ZH[dEmf]}，因此电流${DIR_ZH[dI]}，各元件两端电压也都${DIR_ZH[dI]}。`;
  } else if (change.key === 'internalResistance') {
    summaryEn = `The internal resistance changes, so the lost volts change: the current ${DIR_EN[dI]} and the terminal p.d. ${DIR_EN[dVt]}.`;
    summaryZh = `内阻变化导致损失电压改变：电流${DIR_ZH[dI]}，端电压${DIR_ZH[dVt]}。`;
  } else if (isSwitch) {
    summaryEn = changed.params.closed === false ? 'The switch is open, so no current flows and the lamps go out.' : 'The switch is closed, so the circuit is complete and current flows again.';
    summaryZh = changed.params.closed === false ? '开关断开，电路中没有电流，灯泡熄灭。' : '开关闭合，电路接通，重新有电流。';
  } else if (change.key === 'capacitance') {
    summaryEn = 'The capacitor only changes the transient behaviour; the steady-state readings stay the same.';
    summaryZh = '电容只改变暂态过程，稳态读数保持不变。';
  } else if (changedDir !== 'unchanged') {
    summaryEn = changedDir === 'increase'
      ? 'The total resistance rises, so the current falls; the p.d.s across components in series with the change fall, and lamps dim.'
      : 'The total resistance falls, so the current rises; the p.d.s across components in series with the change rise, and lamps brighten.';
    summaryZh = changedDir === 'increase'
      ? '总电阻增大，电流减小；与变化元件串联的元件电压减小，灯泡变暗。'
      : '总电阻减小，电流增大；与变化元件串联的元件电压增大，灯泡变亮。';
  }

  return {
    supported: true,
    ruleId,
    title: { en: titleEn, zh: titleZh },
    cause: { en: causeEn, zh: causeZh },
    steps,
    markingPoints: buildMarkingPoints([
      [causeEn, causeZh],
      steps.find((s) => s.id === 'resistance')
        ? [steps.find((s) => s.id === 'resistance')!.en, steps.find((s) => s.id === 'resistance')!.zh]
        : steps.find((s) => s.id === 'total-resistance')
          ? [steps.find((s) => s.id === 'total-resistance')!.en, steps.find((s) => s.id === 'total-resistance')!.zh]
          : ['The total resistance changes.', '总电阻改变。'],
      steps.find((s) => s.id === 'current') ? [steps.find((s) => s.id === 'current')!.en, steps.find((s) => s.id === 'current')!.zh] : ['The current changes because the total resistance changes.', '总电阻变化，因此电流变化。'],
      affectedLabels.length > 0
        ? [`The p.d. across ${affectedLabels[0]} changes because V = IR.`, `${affectedLabels[0]} 两端电压因 U = IR 而变化。`]
        : ['The readings follow the changed current and p.d.s.', '各读数随电流和电压的变化而变化。'],
      lampChanged
        ? ['A lamp becomes brighter when its power increases and dimmer when its power decreases.', '灯泡功率增大时变亮，功率减小时变暗。']
        : ['Check that the p.d.s still add up to the supply EMF.', '检查各元件电压之和仍等于电源电动势。'],
    ]),
    answer: { en: steps.map((s) => s.en).join(' '), zh: steps.map((s) => s.zh).join('') },
    summary: { en: summaryEn, zh: summaryZh },
    changes,
    highlights,
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

  const sourceCount = input.after.components.filter((c) => isSourceKind(c.kind)).length;
  if (sourceCount > 1) {
    return emptyResult(
      'This build explains circuits with a single supply. With several sources the total EMF and internal resistance would need to be combined first, so no causal chain is given.',
      '当前版本解释单个电源的电路。多个电源时需要先合并总电动势和内阻，因此这里不生成因果链。',
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
  result = explainGeneralChange(ctx, comp, change, changes);
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
