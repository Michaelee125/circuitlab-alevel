import type { LocalizedText } from './experiments';

export interface ExamMarkPoint {
  id: string;
  text: LocalizedText;
  /**
   * Each group is a set of alternative phrases; every group must be present in
   * the answer for the mark to be awarded.
   */
  keywords: string[][];
}

export interface ExamQuestion {
  id: string;
  title: LocalizedText;
  topic: 'ldr' | 'internal-resistance' | 'iv-characteristic' | 'rc' | 'circuits';
  level: 'A-Level';
  marks: number;
  prompt: LocalizedText;
  markScheme: ExamMarkPoint[];
  modelAnswer: LocalizedText;
  /** These are CircuitLab practice points, never an official mark scheme. */
  schemeType: 'software-authored';
  verified: false;
}

export interface ExamMarkResult {
  id: string;
  awarded: boolean;
  text: LocalizedText;
  matched: string[];
}

export interface ExamGrade {
  awarded: number;
  total: number;
  percentage: number;
  points: ExamMarkResult[];
  schemeType: 'software-authored';
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/p\.?\s?d\.?/g, 'pd')
    .replace(/potential difference/g, 'pd')
    .replace(/[ΩΩ]/g, 'ω')
    .replace(/−|–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(text: string, alternative: string): boolean {
  const alt = normalise(alternative);
  if (!alt) return false;
  if (/^[0-9]/.test(alt)) {
    const escaped = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^0-9.])${escaped}(?![0-9])`).test(text);
  }
  return text.includes(alt);
}

/** Split into sentences before lowercasing so decimals are not treated as full stops. */
function sentencesOf(answer: string): string[] {
  // Protect abbreviations that contain full stops ("p.d.", "e.m.f.") so they do
  // not create a false sentence boundary.
  const protectedText = answer
    .replace(/e\.\s?m\.\s?f\./gi, 'EMF')
    .replace(/p\.\s?d\./gi, 'PD');
  return protectedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalise(sentence))
    .filter((sentence) => sentence.length > 0);
}

export function gradeExamAnswer(question: ExamQuestion, answer: string): ExamGrade {
  const sentences = sentencesOf(answer);
  let awarded = 0;
  const points = question.markScheme.map((point) => {
    // All keyword groups for a mark must appear in the same sentence, so an
    // answer about a parallel circuit cannot accidentally collect a series
    // marking point from a different part of the response.
    const matched: string[] = [];
    let ok = false;
    for (const sentence of sentences) {
      const hits: string[] = [];
      let all = true;
      for (const group of point.keywords) {
        const hit = group.find((alternative) => matches(sentence, alternative));
        if (!hit) {
          all = false;
          break;
        }
        hits.push(hit);
      }
      if (all) {
        ok = true;
        matched.push(...hits);
        break;
      }
    }
    if (ok) awarded += 1;
    return { id: point.id, awarded: ok, text: point.text, matched };
  });
  return {
    awarded,
    total: question.markScheme.length,
    percentage: Math.round((awarded / question.markScheme.length) * 100),
    points,
    schemeType: 'software-authored',
  };
}

export const EXAM_QUESTIONS: ExamQuestion[] = [
  {
    id: 'ldr-series',
    title: { en: 'LDR in a series circuit', zh: '串联电路中的 LDR' },
    topic: 'ldr',
    level: 'A-Level',
    marks: 5,
    prompt: {
      en: 'A 12 V battery of negligible internal resistance is connected in series with an LDR and a 4.0 Ω resistor. The light intensity on the LDR increases so that its resistance falls from 8.0 Ω to 2.0 Ω. Explain how the current in the circuit and the potential difference across the 4.0 Ω resistor change. (5 marks)',
      zh: '一个电动势为 12 V、内阻可忽略的电源与一个 LDR 和一个 4.0 Ω 定值电阻串联。光照增强使 LDR 的电阻由 8.0 Ω 减小到 2.0 Ω。请解释电路中电流以及 4.0 Ω 电阻两端电压的变化。（5 分）',
    },
    markScheme: [
      {
        id: 'm1',
        text: {
          en: 'The resistance of the LDR falls as the light intensity increases.',
          zh: '光照增强使 LDR 的电阻减小。',
        },
        keywords: [
          ['ldr', 'light dependent', 'light-dependent'],
          ['resistance'],
          ['falls', 'decreases', 'drops', 'lower', 'reduces', 'reduced', 'decreased'],
        ],
      },
      {
        id: 'm2',
        text: {
          en: 'The total resistance of the series circuit falls.',
          zh: '串联电路的总电阻减小。',
        },
        keywords: [
          ['total resistance', 'combined resistance', 'total r', 'overall resistance'],
          ['falls', 'decreases', 'drops', 'lower', 'reduces', 'reduced', 'decreased'],
        ],
      },
      {
        id: 'm3',
        text: {
          en: 'The current increases because the EMF is constant.',
          zh: '电动势不变，因此电流增大。',
        },
        keywords: [
          ['current'],
          ['increases', 'rises', 'larger', 'higher', 'goes up', 'increased'],
        ],
      },
      {
        id: 'm4',
        text: {
          en: 'Uses I = V/R or V = IR to relate the current and the p.d.',
          zh: '使用 I = U/R 或 U = IR 说明电流与电压的关系。',
        },
        keywords: [['v = ir', 'v=ir', 'i = v/r', 'i=v/r', 'i = v / r', 'v = i r', 'ohm']],
      },
      {
        id: 'm5',
        text: {
          en: 'The p.d. across the 4.0 Ω resistor increases because its resistance is constant (4.0 V → 8.0 V).',
          zh: '4.0 Ω 电阻的阻值不变，因此其两端电压增大（4.0 V → 8.0 V）。',
        },
        keywords: [
          ['across the 4', 'across the resistor', 'across r', 'resistor'],
          ['rises', 'increases', 'higher', '8.0', '8 v', 'increased'],
        ],
      },
    ],
    modelAnswer: {
      en: 'The light intensity increases, so the resistance of the LDR falls from 8.0 Ω to 2.0 Ω. The total resistance of the series circuit therefore falls from 12 Ω to 6.0 Ω. Since the EMF stays at 12 V, the current increases from 1.0 A to 2.0 A (I = V / R). The resistance of the 4.0 Ω resistor is constant, so the p.d. across the resistor rises from 4.0 V to 8.0 V because V = IR.',
      zh: '光照增强，因此 LDR 的电阻由 8.0 Ω 减小到 2.0 Ω。串联电路的总电阻随之由 12 Ω 减小到 6.0 Ω。由于电动势恒为 12 V，电流由 1.0 A 增大到 2.0 A（I = U / R）。4.0 Ω 电阻的阻值不变，由 U = IR 可知其两端电压由 4.0 V 增大到 8.0 V。',
    },
    schemeType: 'software-authored',
    verified: false,
  },
  {
    id: 'ldr-parallel',
    title: { en: 'LDR in a parallel circuit', zh: '并联电路中的 LDR' },
    topic: 'ldr',
    level: 'A-Level',
    marks: 4,
    prompt: {
      en: 'An LDR is connected in parallel with a 4.0 Ω resistor directly across a 12 V ideal supply. The light intensity on the LDR increases so that its resistance falls from 8.0 Ω to 2.0 Ω. Explain what happens to the currents in the two branches and to the total current. (4 marks)',
      zh: '一个 LDR 与一个 4.0 Ω 定值电阻并联，直接接在 12 V 理想电源两端。光照增强使 LDR 的电阻由 8.0 Ω 减小到 2.0 Ω。请解释两条支路的电流以及总电流如何变化。（4 分）',
    },
    markScheme: [
      {
        id: 'm1',
        text: {
          en: 'The p.d. across each parallel branch equals the supply EMF and is unchanged (12 V).',
          zh: '并联各支路两端电压等于电源电动势，且保持不变（12 V）。',
        },
        keywords: [
          ['pd', 'voltage'],
          ['same', 'equal', 'unchanged', 'constant', '12 v', '12'],
        ],
      },
      {
        id: 'm2',
        text: {
          en: 'The resistance of the LDR falls.',
          zh: 'LDR 的电阻减小。',
        },
        keywords: [
          ['ldr'],
          ['resistance'],
          ['falls', 'decreases', 'drops', 'lower', 'reduces', 'reduced', 'decreased'],
        ],
      },
      {
        id: 'm3',
        text: {
          en: 'The current in the LDR increases because I = V/R with V constant.',
          zh: 'LDR 两端电压不变，由 I = U/R 可知其电流增大。',
        },
        keywords: [
          ['current'],
          ['ldr'],
          ['increases', 'rises', 'larger', 'higher', 'increased'],
        ],
      },
      {
        id: 'm4',
        text: {
          en: 'The current in the 4.0 Ω resistor is unchanged, so the total current increases.',
          zh: '4.0 Ω 电阻中的电流不变，因此总电流增大。',
        },
        keywords: [
          ['resistor', '4.0', '4 ohm', '4 ω'],
          ['unchanged', 'same', 'does not change', 'stays', 'constant'],
        ],
      },
    ],
    modelAnswer: {
      en: 'Both branches are connected in parallel across the ideal supply, so the p.d. across each branch stays at 12 V. The resistance of the LDR falls, so the current in the LDR increases (from 1.5 A to 6.0 A) because I = V / R with V constant. The p.d. across the 4.0 Ω resistor and its resistance are both unchanged, so its current stays at 3.0 A. The total current is the sum of the branch currents, so it increases from 4.5 A to 9.0 A.',
      zh: '两条支路并联在理想电源两端，因此每条支路的电压都保持 12 V 不变。LDR 的电阻减小，在电压不变的情况下由 I = U / R 可知其电流增大（由 1.5 A 增大到 6.0 A）。4.0 Ω 电阻两端的电压和阻值都不变，因此其电流保持 3.0 A。总电流等于两支路电流之和，因此由 4.5 A 增大到 9.0 A。',
    },
    schemeType: 'software-authored',
    verified: false,
  },
  {
    id: 'internal-resistance',
    title: { en: 'EMF and internal resistance', zh: '电动势与内阻' },
    topic: 'internal-resistance',
    level: 'A-Level',
    marks: 4,
    prompt: {
      en: 'A cell of EMF 6.0 V and internal resistance 0.50 Ω is connected to a 2.5 Ω resistor. Calculate the current, the lost volts and the terminal potential difference. (4 marks)',
      zh: '一个电动势为 6.0 V、内阻为 0.50 Ω 的电源与一个 2.5 Ω 的电阻相连。计算电流、内阻损失的电压以及端电压。（4 分）',
    },
    markScheme: [
      {
        id: 'm1',
        text: { en: 'Total resistance = 2.5 + 0.50 = 3.0 Ω', zh: '总电阻 = 2.5 + 0.50 = 3.0 Ω' },
        keywords: [['3.0 ω', '3.0 ohm', '3 ω', '3 ohm', '3.0']],
      },
      {
        id: 'm2',
        text: { en: 'Current I = EMF / R_total = 2.0 A', zh: '电流 I = E / R总 = 2.0 A' },
        keywords: [['2.0 a', '2 a', '2a', '2.0 amp', '2 amp']],
      },
      {
        id: 'm3',
        text: { en: 'Lost volts = I × r = 1.0 V', zh: '损失电压 = I × r = 1.0 V' },
        keywords: [['1.0 v', '1 v', '1.0 volt', '1 volt']],
      },
      {
        id: 'm4',
        text: { en: 'Terminal p.d. = EMF − lost volts = 5.0 V', zh: '端电压 = E − 损失电压 = 5.0 V' },
        keywords: [['5.0 v', '5 v', '5.0 volt', '5 volt']],
      },
    ],
    modelAnswer: {
      en: 'R_total = 2.5 + 0.50 = 3.0 Ω. I = EMF / R_total = 6.0 / 3.0 = 2.0 A. The lost volts are I × r = 2.0 × 0.50 = 1.0 V. The terminal p.d. is 6.0 − 1.0 = 5.0 V (and it equals I × R = 2.0 × 2.5 = 5.0 V).',
      zh: 'R总 = 2.5 + 0.50 = 3.0 Ω。I = E / R总 = 6.0 / 3.0 = 2.0 A。内阻损失电压为 I × r = 2.0 × 0.50 = 1.0 V。端电压为 6.0 − 1.0 = 5.0 V（也等于 I × R = 2.0 × 2.5 = 5.0 V）。',
    },
    schemeType: 'software-authored',
    verified: false,
  },
  {
    id: 'lamp-iv',
    title: { en: 'I–V characteristic of a filament lamp', zh: '灯丝灯泡的伏安特性' },
    topic: 'iv-characteristic',
    level: 'A-Level',
    marks: 4,
    prompt: {
      en: 'The I–V graph of a filament lamp curves so that its gradient decreases as the current increases. Explain why the lamp is not ohmic. (4 marks)',
      zh: '灯丝灯泡的 I–U 图像随电流增大而逐渐变平。请解释为什么灯泡不是欧姆元件。（4 分）',
    },
    markScheme: [
      {
        id: 'm1',
        text: { en: 'The current is not proportional to the p.d.; the graph is curved.', zh: '电流与电压不成正比，图像是曲线。' },
        keywords: [
          ['not proportional', 'not directly proportional', 'non-ohmic', 'non ohmic', 'curves', 'curve', 'bends', 'not a straight'],
        ],
      },
      {
        id: 'm2',
        text: { en: 'The resistance of the filament increases as its temperature rises.', zh: '灯丝温度升高时电阻增大。' },
        keywords: [
          ['resistance'],
          ['increases', 'rises', 'higher', 'greater'],
          ['temperature', 'hot', 'hotter'],
        ],
      },
      {
        id: 'm3',
        text: { en: 'The current heats the filament because power is dissipated.', zh: '电流使灯丝发热，因为电能被耗散。' },
        keywords: [
          ['power', 'p = vi', 'i2r', 'i²r', 'heats', 'heating', 'heat'],
          ['filament', 'lamp', 'temperature'],
        ],
      },
      {
        id: 'm4',
        text: { en: 'A larger current dissipates more power, so the temperature (and resistance) rises further.', zh: '电流越大，耗散功率越多，温度（及电阻）进一步升高。' },
        keywords: [
          ['higher current', 'larger current', 'greater current', 'current increases', 'as the current'],
          ['hotter', 'higher temperature', 'more heat', 'temperature rises'],
        ],
      },
    ],
    modelAnswer: {
      en: 'For an ohmic conductor the current is directly proportional to the p.d., so the I–V graph would be a straight line through the origin. A filament lamp is non-ohmic: the current heats the filament and its resistance increases as its temperature rises. A larger current dissipates more power (P = VI), so the filament becomes hotter and its resistance rises further. This makes the current increase less than in proportion to the p.d., so the gradient of the graph decreases.',
      zh: '对于欧姆元件，电流与电压成正比，I–U 图像应为一条过原点的直线。灯丝灯泡不是欧姆元件：电流使灯丝发热，温度升高使电阻增大。电流越大，耗散功率越大（P = UI），灯丝温度更高，电阻进一步增大。因此电流的增加小于电压成比例的增加，图像斜率逐渐减小。',
    },
    schemeType: 'software-authored',
    verified: false,
  },
  {
    id: 'rc-charging',
    title: { en: 'Capacitor charging', zh: '电容充电' },
    topic: 'rc',
    level: 'A-Level',
    marks: 4,
    prompt: {
      en: 'A 470 µF capacitor is charged through a 10 kΩ resistor from a 6.0 V supply. Describe and explain how the charging current changes with time. (4 marks)',
      zh: '一个 470 µF 的电容器通过 10 kΩ 电阻由 6.0 V 电源充电。描述并解释充电电流随时间的变化。（4 分）',
    },
    markScheme: [
      {
        id: 'm1',
        text: { en: 'At t = 0 the capacitor is uncharged, so the full EMF is across the resistor.', zh: 't = 0 时电容不带电，因此整个电动势都加在电阻上。' },
        keywords: [
          ['capacitor'],
          ['uncharged', 'zero', '0 v', 'no charge', 'initially'],
        ],
      },
      {
        id: 'm2',
        text: { en: 'The initial current is a maximum.', zh: '初始电流最大。' },
        keywords: [
          ['current'],
          ['maximum', 'largest', 'max', 'highest', 'biggest'],
        ],
      },
      {
        id: 'm3',
        text: { en: 'As the capacitor charges, its p.d. rises and the p.d. across the resistor falls, so the current falls.', zh: '充电过程中电容电压升高，电阻两端电压减小，因此电流减小。' },
        keywords: [
          ['charge', 'charges', 'charging'],
          ['increases', 'rises', 'builds', 'accumulates'],
          ['pd', 'voltage'],
        ],
      },
      {
        id: 'm4',
        text: { en: 'The current decreases exponentially with time constant τ = RC.', zh: '电流按指数规律减小，时间常数 τ = RC。' },
        keywords: [
          ['exponential', 'exponentially', 'time constant', 'rc', '63'],
        ],
      },
    ],
    modelAnswer: {
      en: 'At t = 0 the capacitor is uncharged, so the p.d. across it is zero and the whole 6.0 V is across the resistor. The current is therefore maximum (I = V/R = 0.60 mA). As the capacitor charges, the p.d. across it rises and the p.d. across the resistor falls, so the current falls. The charging current decreases exponentially with time constant τ = RC = 4.7 s; after each time constant it falls to about 37% of its value.',
      zh: 't = 0 时电容器不带电，其两端电压为零，整个 6.0 V 都加在电阻上，因此电流最大（I = U/R = 0.60 mA）。随着电容充电，其两端电压升高，电阻两端电压减小，因此电流减小。充电电流按指数规律减小，时间常数 τ = RC = 4.7 s；每经过一个时间常数，电流降为原来的约 37%。',
    },
    schemeType: 'software-authored',
    verified: false,
  },
];

export function getExamQuestion(id: string): ExamQuestion | undefined {
  return EXAM_QUESTIONS.find((q) => q.id === id);
}
