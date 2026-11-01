import { describe, expect, it } from 'vitest';
import { solveCircuit, linearFit, ldrIlluminanceForResistance } from '@circuitlab/physics-engine';
import { explainChange } from '@circuitlab/reasoning-engine';
import type { CircuitDocument } from '@circuitlab/circuit-core';
import {
  EXAM_QUESTIONS,
  EXPERIMENTS,
  answerGuidedQuestion,
  buildExperimentDocument,
  buildGuidedQuestions,
  emptyGuidedState,
  gradeExamAnswer,
  internalResistanceDataset,
} from '@circuitlab/teaching-engine';

function expectSolvable(doc: CircuitDocument) {
  const solution = solveCircuit(doc);
  expect(solution.ok).toBe(true);
  return solution;
}

describe('experiment library', () => {
  it('ships ten core experiments plus the LDR parallel case', () => {
    expect(EXPERIMENTS).toHaveLength(11);
    expect(EXPERIMENTS.filter((e) => e.id !== 'ldr-parallel')).toHaveLength(10);
    for (const experiment of EXPERIMENTS) {
      expect(experiment.completed).toBe(true);
      const doc = buildExperimentDocument(experiment.id);
      expect(doc).not.toBeNull();
      expect(doc?.components.length).toBeGreaterThan(0);
      const solution = solveCircuit(doc as CircuitDocument);
      // every experiment must at least solve into a defined state
      expect(solution.status === 'short-circuit' || solution.status === 'singular').toBe(false);
    }
  });

  it('series and parallel experiments produce the expected readings', () => {
    const series = buildExperimentDocument('series-circuit') as CircuitDocument;
    const s = solveCircuit(series);
    expect(s.components[series.components[0].id].currentMagnitude).toBeCloseTo(0.2, 6);

    const parallel = buildExperimentDocument('parallel-circuit') as CircuitDocument;
    const p = solveCircuit(parallel);
    const r1 = parallel.components.find((c) => c.label === 'R1');
    const r2 = parallel.components.find((c) => c.label === 'R2');
    expect(p.components[r1!.id].currentMagnitude).toBeCloseTo(0.6, 6);
    expect(p.components[r2!.id].currentMagnitude).toBeCloseTo(0.3, 6);
  });

  it('LDR experiment starts at 8 Ω and the light action drops it to 2 Ω', () => {
    const experiment = EXPERIMENTS.find((e) => e.id === 'ldr-circuit');
    const doc = buildExperimentDocument('ldr-circuit') as CircuitDocument;
    expectSolvable(doc);
    const lightUp = experiment?.actions.find((a) => a.id === 'light-up');
    const after = lightUp?.apply(doc) as CircuitDocument;
    const solution = solveCircuit(after);
    const ldr = after.components.find((c) => c.kind === 'ldr');
    const resistor = after.components.find((c) => c.kind === 'resistor');
    expect(solution.ok).toBe(true);
    expect(solution.components[resistor!.id].voltageMagnitude).toBeCloseTo(8, 4);
    expect(solution.components[ldr!.id].voltageMagnitude).toBeCloseTo(4, 4);
    expect(solution.components[ldr!.id].currentMagnitude).toBeCloseTo(2, 4);
  });

  it('the internal-resistance dataset fits V = E − Ir', () => {
    const doc = buildExperimentDocument('internal-resistance') as CircuitDocument;
    const points = internalResistanceDataset(doc);
    expect(points.length).toBeGreaterThan(8);
    const fit = linearFit(points.map((p) => ({ x: p.x, y: p.y })));
    expect(fit.slope).toBeCloseTo(-0.5, 3);
    expect(fit.intercept).toBeCloseTo(6, 3);
    expect(fit.r2).toBeGreaterThan(0.999);
  });

  it('can explain the LDR experiment change end to end', () => {
    const experiment = EXPERIMENTS.find((e) => e.id === 'ldr-circuit');
    const before = buildExperimentDocument('ldr-circuit') as CircuitDocument;
    const action = experiment?.actions.find((a) => a.id === 'light-up');
    const after = action?.apply(before) as CircuitDocument;
    const result = explainChange({
      before,
      after,
      beforeSolution: solveCircuit(before),
      afterSolution: solveCircuit(after),
    });
    expect(result.supported).toBe(true);
    expect(result.ruleId).toBe('sensor-series-light');
    const ldrLux = ldrIlluminanceForResistance(8, { referenceResistance: 100, gamma: 0.7 });
    expect(ldrLux).toBeGreaterThan(0);
  });
});

describe('guided mode', () => {
  it('builds questions from the verified reasoning chain', () => {
    const experiment = EXPERIMENTS.find((e) => e.id === 'ldr-circuit');
    const before = buildExperimentDocument('ldr-circuit') as CircuitDocument;
    const after = experiment!.actions.find((a) => a.id === 'light-up')!.apply(before);
    const explain = explainChange({
      before,
      after,
      beforeSolution: solveCircuit(before),
      afterSolution: solveCircuit(after),
    });
    const questions = buildGuidedQuestions(explain);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    for (const q of questions) {
      expect(q.options.some((o) => o.id === q.correctOptionId)).toBe(true);
      expect(q.prompt.en.length).toBeGreaterThan(0);
      expect(q.prompt.zh.length).toBeGreaterThan(0);
    }
    expect(questions[questions.length - 1].id).toBe('q-law');

    let state = emptyGuidedState();
    for (const q of questions) {
      state = answerGuidedQuestion(state, questions, q.id, q.correctOptionId);
    }
    expect(state.score).toBe(questions.length);
    // answering twice does not double-count
    const repeat = answerGuidedQuestion(state, questions, questions[0].id, questions[0].correctOptionId);
    expect(repeat.score).toBe(state.score);
  });

  it('awards zero for wrong options', () => {
    const experiment = EXPERIMENTS.find((e) => e.id === 'ldr-circuit');
    const before = buildExperimentDocument('ldr-circuit') as CircuitDocument;
    const after = experiment!.actions.find((a) => a.id === 'light-up')!.apply(before);
    const explain = explainChange({
      before,
      after,
      beforeSolution: solveCircuit(before),
      afterSolution: solveCircuit(after),
    });
    const questions = buildGuidedQuestions(explain);
    const first = questions[0];
    const wrong = first.options.find((o) => o.id !== first.correctOptionId)!;
    const state = answerGuidedQuestion(emptyGuidedState(), questions, first.id, wrong.id);
    expect(state.score).toBe(0);
    expect(state.answers[first.id]).toBe(wrong.id);
  });

  it('has no questions when the explanation is unsupported', () => {
    const questions = buildGuidedQuestions({
      supported: false,
      title: { en: '', zh: '' },
      steps: [],
      markingPoints: [],
      answer: { en: '', zh: '' },
      summary: { en: '', zh: '' },
      changes: {},
      highlights: [],
      markingScheme: 'software-authored',
    });
    expect(questions).toHaveLength(0);
  });
});

describe('exam mode marking', () => {
  it('awards full marks to every model answer', () => {
    for (const question of EXAM_QUESTIONS) {
      const grade = gradeExamAnswer(question, question.modelAnswer.en);
      expect(grade.awarded, `${question.id} should score ${question.marks}`).toBe(question.marks);
      expect(grade.schemeType).toBe('software-authored');
      expect(question.verified).toBe(false);
    }
  });

  it('awards no marks to an empty answer', () => {
    for (const question of EXAM_QUESTIONS) {
      const grade = gradeExamAnswer(question, '');
      expect(grade.awarded).toBe(0);
      expect(grade.percentage).toBe(0);
    }
  });

  it('gives partial credit and marks individual points', () => {
    const question = EXAM_QUESTIONS.find((q) => q.id === 'internal-resistance')!;
    const grade = gradeExamAnswer(question, 'The total resistance is 3.0 ohm and the current is 2.0 A.');
    expect(grade.awarded).toBe(2);
    expect(grade.points.filter((p) => p.awarded)).toHaveLength(2);
    expect(grade.points.find((p) => p.id === 'm1')?.awarded).toBe(true);
    expect(grade.points.find((p) => p.id === 'm4')?.awarded).toBe(false);
  });

  it('does not treat a parallel answer as a series answer', () => {
    const series = EXAM_QUESTIONS.find((q) => q.id === 'ldr-series')!;
    const parallelAnswer =
      'The p.d. across the fixed resistor stays at 12 V and its current is unchanged. The LDR resistance falls so the total current increases.';
    const grade = gradeExamAnswer(series, parallelAnswer);
    const m5 = grade.points.find((p) => p.id === 'm5');
    // The final marking point claims the resistor p.d. rises; "stays" must not score it.
    expect(m5?.awarded).toBe(false);
  });
});
