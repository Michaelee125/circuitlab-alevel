import type { ComponentKind, Language } from '@circuitlab/circuit-core';

type Entry = [en: string, zh: string];

const D: Record<string, Entry> = {
  'app.name': ['CircuitLab Physics', 'CircuitLab 物理实验室'],
  'app.tagline': ['Explore Circuits. Understand Physics.', '探索电路，理解物理。'],
  'app.subtitle': ['A-Level interactive circuit laboratory', 'A-Level 交互式电路实验室'],
  'mode.explore': ['Explore', '探索'],
  'mode.guided': ['Guided', '引导'],
  'mode.exam': ['Exam', '考试'],
  'panel.components': ['Components', '元件库'],
  'panel.properties': ['Properties', '属性'],
  'panel.explain': ['Explain', '讲解'],
  'panel.compare': ['Compare', '对比'],
  'panel.measure': ['Measurements', '测量'],
  'panel.graph': ['Graph', '图像'],
  'panel.experiments': ['Experiments', '实验'],
  'cat.source': ['Sources', '电源'],
  'cat.passive': ['Passive', '无源元件'],
  'cat.meter': ['Meters', '仪表'],
  'cat.sensor': ['Sensors', '传感器'],
  'cat.semiconductor': ['Semiconductors', '半导体'],
  'action.add': ['Add component', '添加元件'],
  'action.delete': ['Delete', '删除'],
  'action.duplicate': ['Duplicate', '复制'],
  'action.rotate': ['Rotate 90°', '旋转 90°'],
  'action.undo': ['Undo', '撤销'],
  'action.redo': ['Redo', '重做'],
  'action.save': ['Save', '保存'],
  'action.saved': ['Saved', '已保存'],
  'action.load': ['Open', '打开'],
  'action.export': ['Export JSON', '导出 JSON'],
  'action.import': ['Import JSON', '导入 JSON'],
  'action.share': ['Share', '分享'],
  'action.shareCopied': ['Link copied to clipboard', '链接已复制到剪贴板'],
  'action.autoLayout': ['Auto-arrange', '自动整理'],
  'action.fit': ['Fit to screen', '适应屏幕'],
  'action.zoomIn': ['Zoom in', '放大'],
  'action.zoomOut': ['Zoom out', '缩小'],
  'action.clear': ['Clear circuit', '清空电路'],
  'action.close': ['Close', '关闭'],
  'action.cancel': ['Cancel', '取消'],
  'action.confirm': ['Confirm', '确认'],
  'action.done': ['Done', '完成'],
  'action.next': ['Next', '下一题'],
  'action.restart': ['Start again', '重新开始'],
  'action.open': ['Open', '打开'],
  'action.loaded': ['Loaded', '已载入'],
  'view.schematic': ['Schematic', '电路符号'],
  'view.realistic': ['Realistic', '真实器材'],
  'view.theme': ['Theme', '主题'],
  'view.dark': ['Dark', '深色'],
  'view.light': ['Light', '浅色'],
  'view.quality': ['Quality', '画质'],
  'view.quality.high': ['High', '高'],
  'view.quality.medium': ['Medium', '中'],
  'view.quality.low': ['Low', '低'],
  'view.language': ['Language', '语言'],
  'canvas.emptyTitle': ['Build your first circuit', '搭建你的第一个电路'],
  'canvas.emptyHint': ['Add a cell, a resistor and an LDR, then click two terminals to connect them.', '添加电源、定值电阻和 LDR，然后依次点击两个接线端完成连接。'],
  'canvas.connectHint': ['Select the second terminal to connect', '请选择第二个接线端以完成连接'],
  'canvas.cancelConnect': ['Cancel connection', '取消连接'],
  'canvas.deleteSelected': ['Delete selected', '删除所选'],
  'canvas.zoom': ['Zoom', '缩放'],
  'canvas.grid': ['Grid', '网格'],
  'canvas.hint': ['Drag to move · scroll or pinch to zoom · click terminals to wire', '拖动元件 · 滚轮或双指缩放 · 点击接线端连线'],
  'properties.empty': ['Select a component to inspect it.', '选择一个元件以查看属性。'],
  'properties.resistance': ['Resistance', '电阻'],
  'properties.emf': ['EMF', '电动势'],
  'properties.internalResistance': ['Internal resistance', '内阻'],
  'properties.capacitance': ['Capacitance', '电容'],
  'properties.illuminance': ['Light intensity', '光照强度'],
  'properties.temperature': ['Temperature', '温度'],
  'properties.closed': ['Switch closed', '开关闭合'],
  'properties.coldResistance': ['Cold resistance', '冷态电阻'],
  'properties.thermalCoefficient': ['Filament coefficient', '灯丝系数'],
  'properties.saturationCurrent': ['Saturation current', '反向饱和电流'],
  'properties.ideality': ['Ideality factor', '理想因子'],
  'properties.referenceResistance': ['Reference resistance', '参考电阻'],
  'properties.beta': ['Thermistor B value', '热敏电阻 B 值'],
  'properties.gamma': ['LDR sensitivity', 'LDR 灵敏度'],
  'properties.derivedResistance': ['Effective resistance', '有效电阻'],
  'measure.current': ['Current', '电流'],
  'measure.voltage': ['p.d.', '电压'],
  'measure.power': ['Power', '功率'],
  'measure.resistance': ['Resistance', '电阻'],
  'measure.totalR': ['Total resistance', '总电阻'],
  'measure.totalI': ['Supply current', '电源电流'],
  'measure.totalP': ['Power delivered', '输出功率'],
  'measure.component': ['Component', '元件'],
  'measure.none': ['No measurements yet.', '暂无测量数据。'],
  'explain.title': ['Physics reasoning', '物理解释'],
  'explain.hint': ['Change one parameter — light level, temperature, resistance or EMF — to generate a verified causal chain.', '改变一个参数（光照、温度、电阻或电动势），生成经过验证的因果链。'],
  'explain.cause': ['First change', '最初变化'],
  'explain.chain': ['Causal chain', '因果链'],
  'explain.marking': ['Marking points', '评分要点'],
  'explain.answer': ['Exam-style answer', '考试风格答案'],
  'explain.summary': ['Summary', '小结'],
  'explain.notSupported': ['Full explanation not available', '暂不支持完整解释'],
  'explain.noChange': ['No change yet', '尚未发生变化'],
  'explain.compareHint': ['Before / after comparison of the last change', '最近一次变化的前后对比'],
  'explain.practiceNotice': ['CircuitLab practice marking scheme — not an official mark scheme.', 'CircuitLab 自定义练习评分标准，并非官方评分标准。'],
  'explain.before': ['Before', '变化前'],
  'explain.after': ['After', '变化后'],
  'explain.change': ['Change', '变化'],
  'explain.highlight': ['Highlight in circuit', '在电路中高亮'],
  'compare.empty': ['Change a parameter to compare before and after.', '改变参数以查看前后对比。'],
  'direction.increase': ['Increase', '增大'],
  'direction.decrease': ['Decrease', '减小'],
  'direction.unchanged': ['Unchanged', '不变'],
  'status.ok': ['Circuit solved', '电路求解成功'],
  'status.open': ['Open circuit', '断路'],
  'status.noSource': ['No source', '无电源'],
  'status.short': ['Short circuit', '短路'],
  'status.singular': ['Contradictory sources', '电源矛盾'],
  'status.empty': ['Empty circuit', '电路为空'],
  'status.warning': ['Warning', '警告'],
  'guided.intro': ['Guided mode asks you to follow the causal chain one step at a time.', '引导模式会逐步向你提问因果链中的每一步。'],
  'guided.needsChange': ['Change a component parameter first (for example the light level of the LDR), then return here.', '请先改变一个元件参数（例如 LDR 的光照强度），然后回到这里。'],
  'guided.question': ['Question', '问题'],
  'guided.score': ['Score', '得分'],
  'guided.correct': ['Correct', '回答正确'],
  'guided.incorrect': ['Not quite', '还差一点'],
  'guided.complete': ['Guided sequence complete', '引导练习完成'],
  'exam.intro': ['Original A-Level style questions marked against software-authored practice points.', '原创 A-Level 风格题目，按软件自定义练习评分要点评分。'],
  'exam.choose': ['Choose a question', '选择题目'],
  'exam.answer': ['Your answer', '你的答案'],
  'exam.placeholder': ['Write your explanation in English…', '请用英文写出你的解释……'],
  'exam.submit': ['Mark my answer', '评分'],
  'exam.awarded': ['Marks awarded', '得分'],
  'exam.modelAnswer': ['Model answer', '参考答案'],
  'exam.notice': ['Practice marking only — this is not an official mark scheme. Marking is keyword-based and supports English answers.', '仅为练习评分，并非官方评分标准。评分基于关键词，支持英文作答。'],
  'exam.emptyAnswer': ['Write an answer before asking for marks.', '请先作答再评分。'],
  'experiments.library': ['Experiment library', '实验库'],
  'experiments.load': ['Load experiment', '载入实验'],
  'experiments.actions': ['Try a change', '尝试改变'],
  'experiments.instructions': ['What to look for', '观察要点'],
  'experiments.level': ['Level', '难度'],
  'experiments.completed': ['Runnable', '可运行'],
  'chart.empty': ['No graph data for this circuit yet.', '该电路暂无图表数据。'],
  'chart.export': ['Export CSV', '导出 CSV'],
  'chart.record': ['Record point', '记录数据点'],
  'chart.recorded': ['Point recorded', '已记录数据点'],
  'chart.clear': ['Clear data', '清空数据'],
  'chart.fit': ['Linear fit', '线性拟合'],
  'chart.gradient': ['Gradient', '斜率'],
  'chart.intercept': ['Intercept', '截距'],
  'chart.timeConstant': ['Time constant τ', '时间常数 τ'],
  'chart.characteristic': ['I–V characteristic', 'I–U 特性曲线'],
  'chart.transient': ['Transient response', '瞬态响应'],
  'chart.data': ['Recorded data', '记录数据'],
  'chart.points': ['points', '个数据点'],
  'chart.sweep': ['Generated by the solver at every voltage', '由求解器在每个电压下计算生成'],
  'chart.charging': ['Charging', '充电'],
  'chart.discharging': ['Discharging', '放电'],
  'quality.title': ['Rendering quality', '渲染画质'],
  'help.title': ['Quick guide', '快速指南'],
  'help.body': ['Click a component to select it. Click a terminal, then another terminal, to connect them with a wire. Drag components to move them. Use the sliders to change values and watch the reasoning panel.', '点击元件以选中。依次点击两个接线端即可用导线连接。拖动元件可移动。使用滑块改变数值，并观察讲解面板。'],
  'toast.imported': ['Circuit imported', '电路已导入'],
  'toast.importError': ['Could not import that file', '无法导入该文件'],
  'toast.exported': ['Circuit exported', '电路已导出'],
  'toast.saved': ['Circuit saved locally', '电路已保存到本地'],
  'toast.loaded': ['Circuit loaded', '电路已载入'],
  'toast.shared': ['Share link copied', '分享链接已复制'],
  'toast.noChanges': ['Nothing to save yet', '暂无可保存的内容'],
  'toast.unsupported': ['Not supported on this platform', '当前平台不支持该操作'],
  'save.title': ['Saved circuits', '已保存电路'],
  'save.empty': ['No saved circuits yet.', '尚未保存任何电路。'],
  'save.delete': ['Delete', '删除'],
  'experiments.loadConfirm': ['Replace the current circuit with this experiment?', '用该实验替换当前电路？'],
  'units.ohm': ['Ω', 'Ω'],
  'units.volt': ['V', 'V'],
  'units.amp': ['A', 'A'],
  'units.watt': ['W', 'W'],
  'units.farad': ['F', 'F'],
  'units.lux': ['lx', 'lx'],
  'units.celsius': ['°C', '°C'],
  'units.second': ['s', 's'],
};

export const UI_LANGUAGES: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
  { id: 'bilingual', label: 'EN / 中文' },
];

export function t(lang: Language, key: string, vars?: Record<string, string | number>): string {
  const entry = D[key];
  let text: string;
  if (!entry) {
    text = key;
  } else if (lang === 'en') {
    text = entry[0];
  } else if (lang === 'zh') {
    text = entry[1];
  } else {
    text = `${entry[0]} · ${entry[1]}`;
  }
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export interface Localized {
  en: string;
  zh: string;
}

/** Render a localized pair according to the application language. */
export function localized(lang: Language, value: Localized): string {
  if (lang === 'en') return value.en;
  if (lang === 'zh') return value.zh;
  return `${value.en}\n${value.zh}`;
}

const COMPONENT_NAMES: Record<ComponentKind, Entry> = {
  cell: ['Cell', '电池'],
  battery: ['Battery', '电池组'],
  resistor: ['Resistor', '定值电阻'],
  'variable-resistor': ['Variable resistor', '滑动变阻器'],
  lamp: ['Filament lamp', '灯丝灯泡'],
  switch: ['Switch', '开关'],
  ammeter: ['Ammeter', '电流表'],
  voltmeter: ['Voltmeter', '电压表'],
  ldr: ['LDR', '光敏电阻'],
  thermistor: ['NTC thermistor', 'NTC 热敏电阻'],
  capacitor: ['Capacitor', '电容器'],
  diode: ['Diode', '二极管'],
};

export function componentName(lang: Language, kind: ComponentKind): string {
  const entry = COMPONENT_NAMES[kind];
  if (!entry) return kind;
  return lang === 'zh' ? entry[1] : lang === 'bilingual' ? `${entry[0]} / ${entry[1]}` : entry[0];
}

/** Three-significant-figure formatting used by all instrument displays. */
function sig(value: number, digits = 3): string {
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  const exponent = Math.floor(Math.log10(abs));
  const decimals = Math.max(0, digits - 1 - exponent);
  return value.toFixed(decimals);
}

/** Compact engineering formatting for instrument displays. */
export function formatQuantity(value: number, quantity: 'current' | 'voltage' | 'resistance' | 'power' | 'capacitance' | 'charge'): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  switch (quantity) {
    case 'current':
      if (abs === 0) return '0 A';
      if (abs < 1e-3) return `${sign}${sig(abs * 1e6)} µA`;
      if (abs < 1e-2) return `${sign}${sig(abs * 1e3)} mA`;
      return `${sign}${sig(abs)} A`;
    case 'voltage':
      if (abs === 0) return '0 V';
      if (abs < 1e-3) return `${sign}${sig(abs * 1e3)} mV`;
      return `${sign}${sig(abs)} V`;
    case 'resistance':
      if (abs >= 1e6) return `${sign}${sig(abs / 1e6)} MΩ`;
      if (abs >= 1e3) return `${sign}${sig(abs / 1e3)} kΩ`;
      if (abs < 1) return `${sign}${sig(abs * 1e3)} mΩ`;
      return `${sign}${sig(abs)} Ω`;
    case 'power':
      if (abs === 0) return '0 W';
      if (abs < 1e-3) return `${sign}${sig(abs * 1e6)} µW`;
      if (abs < 1e-2) return `${sign}${sig(abs * 1e3)} mW`;
      return `${sign}${sig(abs)} W`;
    case 'capacitance':
      return `${sig(abs * 1e6)} µF`;
    case 'charge':
      return `${sig(abs * 1e3)} mC`;
    default:
      return String(value);
  }
}

const UNIT_TO_QUANTITY: Record<string, 'current' | 'voltage' | 'resistance' | 'power' | 'capacitance' | 'charge'> = {
  A: 'current',
  V: 'voltage',
  'Ω': 'resistance',
  W: 'power',
  F: 'capacitance',
  C: 'charge',
};

/** Format a value using the unit recorded in a QuantityChange. */
export function formatWithUnit(value: number, unit: string): string {
  const quantity = UNIT_TO_QUANTITY[unit];
  return quantity ? formatQuantity(value, quantity) : `${value} ${unit}`;
}

export type { Language };
