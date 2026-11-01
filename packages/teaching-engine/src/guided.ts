import type { ExplainResult, PhysicsLaw } from '@circuitlab/reasoning-engine';
import type { LocalizedText } from './experiments';

export type DirectionOption = 'increase' | 'decrease' | 'unchanged';

export interface GuidedQuestion {
  id: string;
  prompt: LocalizedText;
  options: { id: string; label: LocalizedText }[];
  correctOptionId: string;
  explanation: LocalizedText;
}

const DIRECTION_OPTIONS: { id: DirectionOption; label: LocalizedText }[] = [
  { id: 'increase', label: { en: 'Increases', zh: '增大' } },
  { id: 'decrease', label: { en: 'Decreases', zh: '减小' } },
  { id: 'unchanged', label: { en: 'Stays the same', zh: '保持不变' } },
];

const TARGETS: Record<string, LocalizedText> = {
  resistance: { en: 'the resistance of the sensor', zh: '传感器的电阻' },
  'total-resistance': { en: 'the total resistance', zh: '总电阻' },
  current: { en: 'the current from the supply', zh: '电源输出的电流' },
  'fixed-pd': { en: 'the p.d. across the fixed resistor', zh: '定值电阻两端的电压' },
  'sensor-pd': { en: 'the p.d. across the sensor', zh: '传感器两端的电压' },
  'sensor-current': { en: 'the current through the sensor', zh: '通过传感器的电流' },
  'partner-pd': { en: 'the p.d. across the other resistor', zh: '另一个电阻两端的电压' },
  'changed-pd': { en: 'the p.d. across the changed resistor', zh: '被改变电阻两端的电压' },
  'r1-pd': { en: 'the p.d. across R1', zh: 'R1 两端的电压' },
  'r2-pd': { en: 'the p.d. across R2', zh: 'R2 两端的电压' },
  'total-current': { en: 'the total current', zh: '总电流' },
  'fixed-branch': { en: 'the current in the fixed resistor', zh: '定值电阻中的电流' },
};

const LAW_LABELS: Record<string, LocalizedText> = {
  'ohms-law': { en: 'V = IR (Ohm’s law)', zh: 'U = IR（欧姆定律）' },
  'kirchhoff-voltage': { en: 'The EMF is shared in a series circuit (Kirchhoff’s voltage law)', zh: '串联电路中电动势被分担（基尔霍夫电压定律）' },
  'kirchhoff-current': { en: 'Currents add at a junction (Kirchhoff’s current law)', zh: '支路电流在节点处相加（基尔霍夫电流定律）' },
  'parallel-voltage': { en: 'Parallel branches have the same p.d.', zh: '并联支路两端电压相等' },
  'series-resistance': { en: 'Series resistances add', zh: '串联电阻相加' },
  'potential-divider': { en: 'The p.d. divides in the ratio of the resistances', zh: '电压按电阻比例分配' },
};

const LAW_OPTION_IDS = [
  'ohms-law',
  'kirchhoff-voltage',
  'kirchhoff-current',
  'parallel-voltage',
];

/**
 * Turn a verified reasoning chain into guided questions. The correct answers
 * are taken from the solved direction of each quantity, so the questions can
 * never disagree with the explanation.
 */
export function buildGuidedQuestions(explain: ExplainResult): GuidedQuestion[] {
  if (!explain.supported || explain.steps.length === 0) return [];
  const questions: GuidedQuestion[] = [];

  for (const step of explain.steps) {
    const target = TARGETS[step.id];
    if (!target) continue;
    const quantity = step.quantities ? Object.values(step.quantities)[0] : undefined;
    if (!quantity) continue;
    const correct = quantity.direction === 'increase'
      ? 'increase'
      : quantity.direction === 'decrease'
        ? 'decrease'
        : 'unchanged';
    questions.push({
      id: `q-${step.id}`,
      prompt: {
        en: `What happens to ${target.en}?`,
        zh: `${target.zh}会发生什么变化？`,
      },
      options: DIRECTION_OPTIONS,
      correctOptionId: correct,
      explanation: { en: step.en, zh: step.zh },
    });
  }

  const lawStep = [...explain.steps].reverse().find((s) => LAW_LABELS[s.law]);
  if (lawStep) {
    const correctLaw = lawStep.law;
    const options = LAW_OPTION_IDS.map((id) => ({
      id,
      label: LAW_LABELS[id] ?? { en: id, zh: id },
    }));
    if (!options.some((o) => o.id === correctLaw)) {
      options.unshift({ id: correctLaw, label: LAW_LABELS[correctLaw] });
    }
    questions.push({
      id: 'q-law',
      prompt: {
        en: 'Which relationship justifies the final step of the reasoning?',
        zh: '哪一条物理关系支持推理的最后一步？',
      },
      options,
      correctOptionId: correctLaw,
      explanation: { en: lawStep.en, zh: lawStep.zh },
    });
  }

  return questions;
}

export interface GuidedState {
  index: number;
  score: number;
  answers: Record<string, string>;
}

export function emptyGuidedState(): GuidedState {
  return { index: 0, score: 0, answers: {} };
}

export function answerGuidedQuestion(
  state: GuidedState,
  questions: GuidedQuestion[],
  questionId: string,
  optionId: string,
): GuidedState {
  const question = questions.find((q) => q.id === questionId);
  if (!question || state.answers[questionId]) return state;
  const correct = question.correctOptionId === optionId;
  const answered = { ...state.answers, [questionId]: optionId };
  const answeredCount = Object.keys(answered).length;
  return {
    answers: answered,
    score: state.score + (correct ? 1 : 0),
    index: Math.min(answeredCount, questions.length),
  };
}

export type { PhysicsLaw };
