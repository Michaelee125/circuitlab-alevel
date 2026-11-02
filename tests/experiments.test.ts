import { describe, expect, it } from 'vitest';
import {
  linearFit,
  solveCircuit,
  solveRCTransient,
  thermistorResistance,
} from '@circuitlab/physics-engine';
import { explainChange } from '@circuitlab/reasoning-engine';
import {
  buildGuidedQuestions,
  experimentSweep,
  EXPERIMENTS,
  getExperiment,
  internalResistanceDataset,
} from '@circuitlab/teaching-engine';
import type { CircuitDocument } from '@circuitlab/circuit-core';

const near = (actual: number | undefined, expected: number, digits = 2) =>
  expect(actual ?? Number.NaN).toBeCloseTo(expected, digits);

function run(id: string) {
  const doc = getExperiment(id)!.build();
  return { doc, solution: solveCircuit(doc) };
}

function read(doc: CircuitDocument, solution: ReturnType<typeof solveCircuit>, label: string) {
  const comp = doc.components.find((c) => c.label === label);
  if (!comp) throw new Error(`No component ${label}`);
  const reading = solution.components[comp.id];
  if (!reading) throw new Error(`No reading for ${label}`);
  return reading;
}

function act(id: string, actionId: string, source?: CircuitDocument) {
  const experiment = getExperiment(id)!;
  const action = experiment.actions.find((a) => a.id === actionId);
  if (!action) throw new Error(`No action ${actionId}`);
  const before = source ?? experiment.build();
  const after = action.apply(before);
  return { before, after, beforeSolution: solveCircuit(before), afterSolution: solveCircuit(after) };
}

function explainTheAction(id: string, actionId: string) {
  const result = act(id, actionId);
  return { ...result, explanation: explainChange(result) };
}

function changedParams(before: CircuitDocument, after: CircuitDocument) {
  return JSON.stringify(before.components.map((c) => c.params)) !==
    JSON.stringify(after.components.map((c) => c.params));
}

describe('preset experiments', () => {
  it('solves every preset and reaches the expected status', () => {
    const expected: Record<string, { status: string; components: number }> = {
      'series-circuit': { status: 'ok', components: 5 },
      'parallel-circuit': { status: 'ok', components: 5 },
      'ohms-law': { status: 'ok', components: 4 },
      'potential-divider': { status: 'ok', components: 4 },
      'ldr-circuit': { status: 'ok', components: 5 },
      'ldr-parallel': { status: 'ok', components: 5 },
      'thermistor-circuit': { status: 'ok', components: 5 },
      'internal-resistance': { status: 'ok', components: 4 },
      'iv-characteristics': { status: 'ok', components: 4 },
      'capacitor-charging': { status: 'open-circuit', components: 4 },
      'capacitor-discharging': { status: 'no-source', components: 3 },
    };
    expect(EXPERIMENTS).toHaveLength(11);
    for (const experiment of EXPERIMENTS) {
      const { doc, solution } = run(experiment.id);
      const target = expected[experiment.id];
      expect(target, experiment.id).toBeDefined();
      expect(doc.components.length, experiment.id).toBe(target.components);
      expect(solution.status, experiment.id).toBe(target.status);
      expect(solution.errors, experiment.id).toEqual([]);
    }
  });

  it('produces the textbook readings for the IGCSE presets', () => {
    const series = run('series-circuit');
    near(read(series.doc, series.solution, 'A1').currentMagnitude, 0.2);
    near(read(series.doc, series.solution, 'R1').voltageMagnitude, 2);
    near(read(series.doc, series.solution, 'R2').voltageMagnitude, 4);
    near(read(series.doc, series.solution, 'V1').voltageMagnitude, 4);

    const parallel = run('parallel-circuit');
    near(read(parallel.doc, parallel.solution, 'E1').currentMagnitude, 0.9);
    near(read(parallel.doc, parallel.solution, 'R1').currentMagnitude, 0.6);
    near(read(parallel.doc, parallel.solution, 'R2').currentMagnitude, 0.3);
    near(read(parallel.doc, parallel.solution, 'V1').voltageMagnitude, 6);
    near(read(parallel.doc, parallel.solution, 'A1').currentMagnitude, 0.9);

    const ohm = run('ohms-law');
    near(read(ohm.doc, ohm.solution, 'A1').currentMagnitude, 0.5);
    near(read(ohm.doc, ohm.solution, 'V1').voltageMagnitude, 6);
    near(read(ohm.doc, ohm.solution, 'R1').resistance ?? 0, 12);
  });

  it('produces the textbook readings for the divider and sensor presets', () => {
    const divider = run('potential-divider');
    near(read(divider.doc, divider.solution, 'E1').currentMagnitude, 1, 1);
    near(read(divider.doc, divider.solution, 'V2').voltageMagnitude, 8);
    near(read(divider.doc, divider.solution, 'R2').voltageMagnitude, 8);
    near(read(divider.doc, divider.solution, 'R1').voltageMagnitude, 4);

    const ldr = run('ldr-circuit');
    near(read(ldr.doc, ldr.solution, 'LDR1').resistance ?? 0, 8, 1);
    near(read(ldr.doc, ldr.solution, 'A1').currentMagnitude, 1);
    near(read(ldr.doc, ldr.solution, 'R1').voltageMagnitude, 4);
    near(read(ldr.doc, ldr.solution, 'LDR1').voltageMagnitude, 8);

    const ldrParallel = run('ldr-parallel');
    near(read(ldrParallel.doc, ldrParallel.solution, 'A1').currentMagnitude, 1.5);
    near(read(ldrParallel.doc, ldrParallel.solution, 'E1').currentMagnitude, 4.5);
    near(read(ldrParallel.doc, ldrParallel.solution, 'R1').currentMagnitude, 3);
    near(read(ldrParallel.doc, ldrParallel.solution, 'V1').voltageMagnitude, 12);

    const thermistor = run('thermistor-circuit');
    near(read(thermistor.doc, thermistor.solution, 'TH1').resistance ?? 0, 1000, 0);
    near(read(thermistor.doc, thermistor.solution, 'A1').currentMagnitude, 0.006, 4);
    near(read(thermistor.doc, thermistor.solution, 'R1').voltageMagnitude, 6);
    near(read(thermistor.doc, thermistor.solution, 'TH1').voltageMagnitude, 6);
  });

  it('produces the textbook readings for the internal-resistance and lamp presets', () => {
    const internal = run('internal-resistance');
    near(read(internal.doc, internal.solution, 'A1').currentMagnitude, 2);
    near(read(internal.doc, internal.solution, 'V1').voltageMagnitude, 5);
    near(read(internal.doc, internal.solution, 'RV1').voltageMagnitude, 5);
    near(internal.solution.totalResistance ?? 0, 2.5);

    const lamp = run('iv-characteristics');
    near(read(lamp.doc, lamp.solution, 'A1').currentMagnitude, 0.75);
    near(read(lamp.doc, lamp.solution, 'V1').voltageMagnitude, 6);
    near(lamp.solution.totalResistance ?? 0, 8);
  });

  it('applies every action and reaches the expected state', () => {
    const series = act('series-circuit', 'r2-up');
    near(read(series.after, series.afterSolution, 'A1').currentMagnitude, 0.12);
    near(read(series.after, series.afterSolution, 'R2').voltageMagnitude, 4.8);
    const seriesDown = act('series-circuit', 'r2-down');
    near(read(seriesDown.after, seriesDown.afterSolution, 'A1').currentMagnitude, 0.3);
    near(read(seriesDown.after, seriesDown.afterSolution, 'R2').voltageMagnitude, 3);

    const parallel = act('parallel-circuit', 'r1-down');
    near(read(parallel.after, parallel.afterSolution, 'E1').currentMagnitude, 1.5);
    near(read(parallel.after, parallel.afterSolution, 'R1').currentMagnitude, 1.2);
    near(read(parallel.after, parallel.afterSolution, 'R2').currentMagnitude, 0.3);
    near(read(parallel.after, parallel.afterSolution, 'V1').voltageMagnitude, 6);
    const parallelR2 = act('parallel-circuit', 'r2-down');
    near(read(parallelR2.after, parallelR2.afterSolution, 'E1').currentMagnitude, 1.2);
    near(read(parallelR2.after, parallelR2.afterSolution, 'R1').currentMagnitude, 0.6);
    near(read(parallelR2.after, parallelR2.afterSolution, 'R2').currentMagnitude, 0.6);

    const ohm3 = act('ohms-law', 'emf-3');
    near(read(ohm3.after, ohm3.afterSolution, 'A1').currentMagnitude, 0.25);
    near(read(ohm3.after, ohm3.afterSolution, 'V1').voltageMagnitude, 3);
    const ohm12 = act('ohms-law', 'emf-12');
    near(read(ohm12.after, ohm12.afterSolution, 'A1').currentMagnitude, 1);
    near(read(ohm12.after, ohm12.afterSolution, 'V1').voltageMagnitude, 12);

    const divUp = act('potential-divider', 'r1-up');
    near(read(divUp.after, divUp.afterSolution, 'V2').voltageMagnitude, 6);
    near(read(divUp.after, divUp.afterSolution, 'R1').voltageMagnitude, 6);
    const divDown = act('potential-divider', 'r1-down');
    near(read(divDown.after, divDown.afterSolution, 'V2').voltageMagnitude, 9.6);
    near(read(divDown.after, divDown.afterSolution, 'R1').voltageMagnitude, 2.4);
  });

  it('returns the sensor presets to their starting readings after the inverse action', () => {
    const ldrUp = act('ldr-circuit', 'light-up');
    near(read(ldrUp.after, ldrUp.afterSolution, 'LDR1').resistance ?? 0, 2, 1);
    near(read(ldrUp.after, ldrUp.afterSolution, 'A1').currentMagnitude, 2);
    near(read(ldrUp.after, ldrUp.afterSolution, 'R1').voltageMagnitude, 8);
    near(read(ldrUp.after, ldrUp.afterSolution, 'LDR1').voltageMagnitude, 4);
    const ldrDown = act('ldr-circuit', 'light-down', ldrUp.after);
    near(read(ldrDown.after, ldrDown.afterSolution, 'LDR1').resistance ?? 0, 8, 1);
    near(read(ldrDown.after, ldrDown.afterSolution, 'A1').currentMagnitude, 1);
    near(read(ldrDown.after, ldrDown.afterSolution, 'R1').voltageMagnitude, 4);

    const ldrParallelUp = act('ldr-parallel', 'light-up');
    near(read(ldrParallelUp.after, ldrParallelUp.afterSolution, 'A1').currentMagnitude, 6);
    near(read(ldrParallelUp.after, ldrParallelUp.afterSolution, 'E1').currentMagnitude, 9);
    near(read(ldrParallelUp.after, ldrParallelUp.afterSolution, 'R1').currentMagnitude, 3);
    const ldrParallelDown = act('ldr-parallel', 'light-down', ldrParallelUp.after);
    near(read(ldrParallelDown.after, ldrParallelDown.afterSolution, 'A1').currentMagnitude, 1.5);
    near(read(ldrParallelDown.after, ldrParallelDown.afterSolution, 'E1').currentMagnitude, 4.5);

    const thermistorHot = act('thermistor-circuit', 'heat');
    const thReading = read(thermistorHot.after, thermistorHot.afterSolution, 'TH1');
    const thComponent = thermistorHot.after.components.find((c) => c.label === 'TH1')!;
    near(thReading.resistance ?? 0, thermistorResistance(thComponent.params), 2);
    near(read(thermistorHot.after, thermistorHot.afterSolution, 'R1').voltageMagnitude, 10.34, 1);
    const thermistorCool = act('thermistor-circuit', 'cool', thermistorHot.after);
    near(read(thermistorCool.after, thermistorCool.afterSolution, 'R1').voltageMagnitude, 6);
  });

  it('applies the internal-resistance rheostat actions', () => {
    const low = act('internal-resistance', 'rv-0.5');
    near(read(low.after, low.afterSolution, 'A1').currentMagnitude, 6);
    near(read(low.after, low.afterSolution, 'V1').voltageMagnitude, 3);
    near(read(low.after, low.afterSolution, 'RV1').voltageMagnitude, 3);
    const high = act('internal-resistance', 'rv-4.5');
    near(read(high.after, high.afterSolution, 'A1').currentMagnitude, 1.2);
    near(read(high.after, high.afterSolution, 'V1').voltageMagnitude, 5.4);
    near(read(high.after, high.afterSolution, 'RV1').voltageMagnitude, 5.4);
  });

  it('supports the explanation for every action that changes a parameter', () => {
    let effective = 0;
    for (const experiment of EXPERIMENTS) {
      for (const action of experiment.actions) {
        const before = experiment.build();
        const after = action.apply(before);
        if (!changedParams(before, after)) continue;
        effective += 1;
        const result = explainChange({
          before,
          after,
          beforeSolution: solveCircuit(before),
          afterSolution: solveCircuit(after),
        });
        expect(result.supported, `${experiment.id}/${action.id}`).toBe(true);
        expect(result.ruleId, `${experiment.id}/${action.id}`).not.toBeUndefined();
        expect(result.steps.length, `${experiment.id}/${action.id}`).toBeGreaterThan(1);
      }
    }
    expect(effective).toBe(13);
  });

  it('reports the true total resistance including the source internal resistance', () => {
    const result = explainTheAction('internal-resistance', 'rv-0.5');
    const totalStep = result.explanation.steps.find((s) => s.id === 'total-resistance');
    expect(totalStep).toBeDefined();
    expect(totalStep!.en).toContain('3.00 Ω');
    expect(totalStep!.en).toContain('1.00 Ω');
    near(totalStep!.quantities?.['total:R']?.before, 3, 2);
    near(totalStep!.quantities?.['total:R']?.after, 1, 2);
    near(result.explanation.changes['total:R']?.before, 3, 2);
    near(result.explanation.changes['total:R']?.after, 1, 2);
    const currentStep = result.explanation.steps.find((s) => s.id === 'current');
    expect(currentStep?.en).toContain('2.00 A');
    expect(currentStep?.en).toContain('6.00 A');
    expect(result.explanation.answer.en).toContain('internal 0.500');
  });

  it('describes a falling EMF as smaller and a rising EMF as larger', () => {
    const down = explainTheAction('ohms-law', 'emf-3');
    expect(down.explanation.answer.en).toContain('because the EMF is smaller');
    expect(down.explanation.answer.en).not.toContain('because the EMF is larger');
    const up = explainTheAction('ohms-law', 'emf-12');
    expect(up.explanation.answer.en).toContain('because the EMF is larger');
  });

  it('fits the internal-resistance graph and the Ohm/lamp sweeps', () => {
    const internal = getExperiment('internal-resistance')!;
    const points = internalResistanceDataset(internal.build());
    expect(points.length).toBe(11);
    const fit = linearFit(points);
    near(fit.slope, -0.5, 2);
    near(fit.intercept, 6, 2);
    expect(fit.r2).toBeGreaterThan(0.999);

    const ohm = getExperiment('ohms-law')!;
    const ohmSweep = experimentSweep(ohm, ohm.build());
    expect(ohmSweep?.ok).toBe(true);
    const ohmFit = linearFit((ohmSweep?.points ?? []).map((p) => ({ x: p.voltage, y: p.current })));
    near(ohmFit.slope, 1 / 12, 3);
    near(ohmFit.intercept, 0, 2);

    const lamp = getExperiment('iv-characteristics')!;
    const lampSweep = experimentSweep(lamp, lamp.build());
    expect(lampSweep?.ok).toBe(true);
    expect(lampSweep!.points.some((p) => p.emf < 0 && p.current < -0.1)).toBe(true);
    const at = (emf: number) =>
      lampSweep!.points.reduce((best, p) => (Math.abs(p.emf - emf) < Math.abs(best.emf - emf) ? p : best));
    const p2 = at(2);
    const p6 = at(6);
    const n6 = at(-6);
    expect(Math.abs(p6.voltage / p6.current)).toBeGreaterThan(Math.abs(p2.voltage / p2.current));
    near(n6.voltage, -p6.voltage, 3);
    near(n6.current, -p6.current, 3);
  });

  it('models the RC time constants and the 63%/37% points', () => {
    const charging = solveRCTransient(getExperiment('capacitor-charging')!.build(), {
      initialVoltage: 0,
      duration: 30,
      steps: 300,
    });
    expect(charging.ok).toBe(true);
    near(charging.timeConstant, 4.7, 2);
    const chargeAtTau = charging.points.reduce((best, p) =>
      Math.abs(p.t - 4.7) < Math.abs(best.t - 4.7) ? p : best,
    );
    near(chargeAtTau.voltage / 6, 1 - Math.exp(-1), 2);

    const discharging = solveRCTransient(getExperiment('capacitor-discharging')!.build(), {
      initialVoltage: 6,
      duration: 30,
      steps: 300,
    });
    expect(discharging.ok).toBe(true);
    near(discharging.timeConstant, 4.7, 2);
    const dischargeAtTau = discharging.points.reduce((best, p) =>
      Math.abs(p.t - 4.7) < Math.abs(best.t - 4.7) ? p : best,
    );
    near(dischargeAtTau.voltage / 6, Math.exp(-1), 2);
    expect(Math.abs(discharging.points[0].current)).toBeGreaterThan(
      Math.abs(discharging.points[discharging.points.length - 1].current),
    );
  });

  it('builds guided questions from the verified causal chain', () => {
    const ldr = explainTheAction('ldr-circuit', 'light-up');
    const questions = buildGuidedQuestions(ldr.explanation);
    expect(questions.length).toBeGreaterThan(2);
    const total = questions.find((q) => q.id === 'q-total-resistance');
    expect(total?.correctOptionId).toBe('decrease');
    const law = questions.find((q) => q.id === 'q-law');
    expect(law?.correctOptionId).toBeTruthy();
    expect(law?.options.length).toBeGreaterThanOrEqual(4);

    const internal = explainTheAction('internal-resistance', 'rv-0.5');
    const internalQuestions = buildGuidedQuestions(internal.explanation);
    const internalTotal = internalQuestions.find((q) => q.id === 'q-total-resistance');
    expect(internalTotal?.correctOptionId).toBe('decrease');
    expect(internalTotal?.explanation.en).toContain('3.00 Ω');
    expect(internalTotal?.explanation.en).toContain('1.00 Ω');
  });
});
