import { useMemo } from 'react';
import { create } from 'zustand';
import {
  addComponent,
  autoLayout,
  connectTerminals as connectCore,
  createComponent,
  createDocument,
  documentBounds,
  moveComponent,
  removeComponent,
  rotateComponent,
  updateParams as applyParams,
} from '@circuitlab/circuit-core';
import type {
  AppMode,
  CircuitDocument,
  ComponentKind,
  ComponentParams,
  Language,
  Point,
  QualityLevel,
  ThemeMode,
  ViewMode,
} from '@circuitlab/circuit-core';
import { solveCircuit } from '@circuitlab/physics-engine';
import { buildComparison, explainChange } from '@circuitlab/reasoning-engine';
import type { ExplainResult } from '@circuitlab/reasoning-engine';
import { buildGuidedQuestions, getExperiment } from '@circuitlab/teaching-engine';
import type { GuidedQuestion } from '@circuitlab/teaching-engine';
import { getAdapters } from '@circuitlab/platform-adapters';
import type { StoredCircuit } from '@circuitlab/platform-adapters';
import { parseCircuitJSON, serializeCircuit } from '@circuitlab/circuit-core';

export type RightTab = 'inspector' | 'explain' | 'compare' | 'guided' | 'exam';
export type BottomTab = 'chart' | 'measure';
export type SheetKind =
  | 'none'
  | 'palette'
  | 'inspector'
  | 'explain'
  | 'compare'
  | 'experiments'
  | 'chart'
  | 'guided'
  | 'exam'
  | 'saved'
  | 'help';

export interface RecordedPoint {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

interface Prefs {
  language: Language;
  theme: ThemeMode;
  viewMode: ViewMode;
  quality: QualityLevel;
}

const PREF_KEY = 'circuitlab.prefs.v1';

function loadPrefs(): Prefs {
  const fallback: Prefs = { language: 'en', theme: 'dark', viewMode: 'schematic', quality: 'high' };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      language: parsed.language === 'zh' || parsed.language === 'bilingual' ? parsed.language : 'en',
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      viewMode: parsed.viewMode === 'realistic' ? 'realistic' : 'schematic',
      quality:
        parsed.quality === 'medium' || parsed.quality === 'low' ? parsed.quality : 'high',
    };
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: Prefs): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // storage may be unavailable (private mode) — preferences then only last for the session
  }
}

const initialDoc = (): CircuitDocument => {
  const doc = createDocument('Untitled circuit');
  return doc;
};

const initialPrefs = loadPrefs();

interface CircuitState {
  doc: CircuitDocument;
  past: CircuitDocument[];
  future: CircuitDocument[];
  refDoc: CircuitDocument | null;
  lastChangeKey: string | null;
  selectionId: string | null;
  wiringFrom: { componentId: string; terminalId: string } | null;
  hoverTerminal: { componentId: string; terminalId: string } | null;
  view: ViewportState;
  viewport: { width: number; height: number };
  viewMode: ViewMode;
  theme: ThemeMode;
  language: Language;
  quality: QualityLevel;
  mode: AppMode;
  experimentId: string | null;
  rightTab: RightTab;
  bottomTab: BottomTab;
  bottomOpen: boolean;
  mobileSheet: SheetKind;
  showGrid: boolean;
  highlightIds: string[];
  transientInitialVoltage: number;
  recorded: RecordedPoint[];
  saved: StoredCircuit[];
  toast: { id: number; message: string; kind: 'ok' | 'error' } | null;
  quizKey: number;

  setDoc: (doc: CircuitDocument) => void;
  commitDoc: (doc: CircuitDocument) => void;
  updateParams: (componentId: string, params: Partial<ComponentParams>) => void;
  addComponent: (kind: ComponentKind) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  rotateSelected: () => void;
  select: (id: string | null) => void;
  setWiringFrom: (endpoint: { componentId: string; terminalId: string } | null) => void;
  setHoverTerminal: (endpoint: { componentId: string; terminalId: string } | null) => void;
  connect: (a: { componentId: string; terminalId: string }, b: { componentId: string; terminalId: string }) => void;
  disconnectWire: (wireId: string) => void;
  beginDrag: () => void;
  dragTo: (componentId: string, x: number, y: number) => void;
  endDrag: () => void;
  undo: () => void;
  redo: () => void;
  autoArrange: () => void;
  clearCircuit: () => void;

  setView: (view: ViewportState) => void;
  panBy: (dx: number, dy: number) => void;
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  setViewport: (width: number, height: number) => void;
  fitView: () => void;
  resetView: () => void;

  setViewMode: (mode: ViewMode) => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setQuality: (quality: QualityLevel) => void;
  setMode: (mode: AppMode) => void;
  setRightTab: (tab: RightTab) => void;
  setBottomTab: (tab: BottomTab) => void;
  setBottomOpen: (open: boolean) => void;
  setSheet: (sheet: SheetKind) => void;
  setShowGrid: (show: boolean) => void;
  setHighlight: (ids: string[]) => void;

  loadDocument: (doc: CircuitDocument, experimentId?: string | null) => void;
  loadExperiment: (id: string) => void;
  applyExperimentAction: (actionId: string) => void;
  setTransientInitialVoltage: (value: number) => void;

  refreshSaved: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  loadSaved: (id: string) => Promise<void>;
  deleteSaved: (id: string) => Promise<void>;
  exportCurrent: () => Promise<void>;
  importCircuit: () => Promise<void>;
  shareCurrent: () => Promise<void>;

  recordPoint: () => void;
  clearRecorded: () => void;
  toastMessage: (message: string, kind?: 'ok' | 'error') => void;
  bumpQuiz: () => void;
  zoomToFitSoon: () => void;
}

let toastCounter = 0;
let dragSnapshot: CircuitDocument | null = null;

export const useCircuitStore = create<CircuitState>()((set, get) => ({
  doc: initialDoc(),
  past: [],
  future: [],
  refDoc: null,
  lastChangeKey: null,
  selectionId: null,
  wiringFrom: null,
  hoverTerminal: null,
  view: { x: 80, y: 80, zoom: 1 },
  viewport: { width: 900, height: 600 },
  viewMode: initialPrefs.viewMode,
  theme: initialPrefs.theme,
  language: initialPrefs.language,
  quality: initialPrefs.quality,
  mode: 'explore',
  experimentId: null,
  rightTab: 'inspector',
  bottomTab: 'chart',
  bottomOpen: false,
  mobileSheet: 'none',
  showGrid: true,
  highlightIds: [],
  transientInitialVoltage: 0,
  recorded: [],
  saved: [],
  toast: null,
  quizKey: 0,

  setDoc: (doc) => set({ doc }),

  commitDoc: (doc) =>
    set((state) => ({
      doc,
      past: [...state.past, state.doc].slice(-60),
      future: [],
      refDoc: null,
      lastChangeKey: null,
      highlightIds: [],
    })),

  updateParams: (componentId, params) =>
    set((state) => {
      const key = `${componentId}:${Object.keys(params).sort().join(',')}`;
      const isNewSession = state.lastChangeKey !== key;
      const nextDoc = applyParams(state.doc, componentId, params);
      return {
        doc: nextDoc,
        past: isNewSession ? [...state.past, state.doc].slice(-60) : state.past,
        future: isNewSession ? [] : state.future,
        refDoc: isNewSession ? state.doc : state.refDoc,
        lastChangeKey: key,
        highlightIds: [],
        quizKey: state.quizKey + (isNewSession ? 1 : 0),
      };
    }),

  addComponent: (kind) => {
    const state = get();
    const { width, height } = state.viewport;
    const center = {
      x: (width / 2 - state.view.x) / state.view.zoom,
      y: (height / 2 - state.view.y) / state.view.zoom,
    };
    let x = Math.round(center.x / 20) * 20;
    let y = Math.round(center.y / 20) * 20;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const occupied = state.doc.components.some(
        (c) => Math.abs(c.x - x) < 110 && Math.abs(c.y - y) < 80,
      );
      if (!occupied) break;
      x += 40;
      if (attempt % 4 === 3) {
        x = Math.round(center.x / 20) * 20;
        y += 80;
      }
    }
    const comp = createComponent(kind, x, y);
    const next = addComponent(state.doc, comp);
    set({
      doc: next,
      past: [...state.past, state.doc].slice(-60),
      future: [],
      selectionId: comp.id,
      wiringFrom: null,
      refDoc: null,
      lastChangeKey: null,
      experimentId: null,
      mobileSheet: state.mobileSheet === 'palette' ? 'none' : state.mobileSheet,
    });
  },

  duplicateSelected: () => {
    const state = get();
    const source = state.doc.components.find((c) => c.id === state.selectionId);
    if (!source) return;
    const copy = createComponent(source.kind, source.x + 40, source.y + 40, {
      params: { ...source.params },
      rotation: source.rotation,
    });
    set({
      doc: addComponent(state.doc, copy),
      past: [...state.past, state.doc].slice(-60),
      future: [],
      selectionId: copy.id,
      refDoc: null,
    });
  },

  deleteSelected: () => {
    const state = get();
    if (!state.selectionId) return;
    set({
      doc: removeComponent(state.doc, state.selectionId),
      past: [...state.past, state.doc].slice(-60),
      future: [],
      selectionId: null,
      wiringFrom: null,
      refDoc: null,
      lastChangeKey: null,
      highlightIds: [],
    });
  },

  rotateSelected: () => {
    const state = get();
    if (!state.selectionId) return;
    set({
      doc: rotateComponent(state.doc, state.selectionId, 90),
      past: [...state.past, state.doc].slice(-60),
      future: [],
      refDoc: null,
    });
  },

  select: (id) =>
    set((state) => ({
      selectionId: id,
      wiringFrom: state.wiringFrom && state.wiringFrom.componentId !== id ? state.wiringFrom : state.wiringFrom,
      highlightIds: [],
    })),

  setWiringFrom: (endpoint) => set({ wiringFrom: endpoint }),

  setHoverTerminal: (endpoint) => set({ hoverTerminal: endpoint }),

  connect: (a, b) => {
    const state = get();
    const result = connectCore(state.doc, a, b);
    if (result.error) {
      get().toastMessage(result.error, 'error');
      set({ wiringFrom: null });
      return;
    }
    set({
      doc: result.doc,
      past: [...state.past, state.doc].slice(-60),
      future: [],
      wiringFrom: null,
      refDoc: null,
      lastChangeKey: null,
      highlightIds: [],
    });
  },

  disconnectWire: (wireId) => {
    const state = get();
    set({
      doc: { ...state.doc, wires: state.doc.wires.filter((w) => w.id !== wireId) },
      past: [...state.past, state.doc].slice(-60),
      future: [],
      refDoc: null,
      lastChangeKey: null,
    });
  },

  beginDrag: () => {
    dragSnapshot = get().doc;
  },

  dragTo: (componentId, x, y) =>
    set((state) => ({ doc: moveComponent(state.doc, componentId, x, y) })),

  endDrag: () =>
    set((state) => {
      if (dragSnapshot && dragSnapshot !== state.doc) {
        return {
          past: [...state.past, dragSnapshot].slice(-60),
          future: [],
        };
      }
      return {};
    }),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return {};
      const previous = state.past[state.past.length - 1];
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, 60),
        refDoc: null,
        lastChangeKey: null,
        selectionId: null,
        wiringFrom: null,
        highlightIds: [],
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {};
      const next = state.future[0];
      return {
        doc: next,
        past: [...state.past, state.doc].slice(-60),
        future: state.future.slice(1),
        refDoc: null,
        lastChangeKey: null,
        selectionId: null,
        highlightIds: [],
      };
    }),

  autoArrange: () => {
    const state = get();
    set({
      doc: autoLayout(state.doc),
      past: [...state.past, state.doc].slice(-60),
      future: [],
      refDoc: null,
    });
    get().fitView();
  },

  clearCircuit: () => {
    const state = get();
    const doc = createDocument('Untitled circuit');
    set({
      doc,
      past: [...state.past, state.doc].slice(-60),
      future: [],
      selectionId: null,
      wiringFrom: null,
      refDoc: null,
      lastChangeKey: null,
      experimentId: null,
      highlightIds: [],
      recorded: [],
      view: { x: 80, y: 80, zoom: 1 },
    });
  },

  setView: (view) => set({ view }),

  panBy: (dx, dy) =>
    set((state) => ({ view: { ...state.view, x: state.view.x + dx, y: state.view.y + dy } })),

  zoomAt: (screenX, screenY, factor) =>
    set((state) => {
      const zoom = Math.max(0.2, Math.min(3, state.view.zoom * factor));
      const worldX = (screenX - state.view.x) / state.view.zoom;
      const worldY = (screenY - state.view.y) / state.view.zoom;
      return {
        view: { zoom, x: screenX - worldX * zoom, y: screenY - worldY * zoom },
      };
    }),

  setViewport: (width, height) =>
    set((state) => {
      const first = state.viewport.width <= 1 || state.viewport.height <= 1;
      const next = { viewport: { width, height } };
      if (first && width > 0 && height > 0) {
        const bounds = documentBounds(state.doc);
        const scale = Math.min(width / bounds.width, height / bounds.height, 1.4);
        const zoom = Math.max(0.3, scale * 0.9);
        return {
          ...next,
          view: {
            zoom,
            x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
            y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
          },
        };
      }
      return next;
    }),

  fitView: () => {
    const state = get();
    const { width, height } = state.viewport;
    if (width <= 1 || height <= 1) return;
    const bounds = documentBounds(state.doc);
    const zoom = Math.max(0.25, Math.min(width / bounds.width, height / bounds.height, 1.6) * 0.92);
    set({
      view: {
        zoom,
        x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
        y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
      },
    });
  },

  resetView: () =>
    set({
      view: { x: 80, y: 80, zoom: 1 },
    }),

  setViewMode: (viewMode) => {
    set({ viewMode });
    const { language, theme, quality } = get();
    savePrefs({ language, theme, quality, viewMode });
  },
  setTheme: (theme) => {
    set({ theme });
    const { language, quality, viewMode } = get();
    savePrefs({ language, theme, quality, viewMode });
  },
  setLanguage: (language) => {
    set({ language });
    const { theme, quality, viewMode } = get();
    savePrefs({ language, theme, quality, viewMode });
  },
  setQuality: (quality) => {
    set({ quality });
    const { language, theme, viewMode } = get();
    savePrefs({ language, theme, quality, viewMode });
  },

  setMode: (mode) =>
    set({
      mode,
      highlightIds: [],
      mobileSheet: 'none',
      rightTab: mode === 'guided' ? 'guided' : mode === 'exam' ? 'exam' : 'inspector',
    }),
  setRightTab: (rightTab) => set({ rightTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setBottomOpen: (bottomOpen) => set({ bottomOpen }),
  setSheet: (mobileSheet) => set({ mobileSheet }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setHighlight: (highlightIds) => set({ highlightIds }),

  loadDocument: (doc, experimentId = null) =>
    set({
      doc,
      past: [],
      future: [],
      refDoc: null,
      lastChangeKey: null,
      selectionId: null,
      wiringFrom: null,
      hoverTerminal: null,
      highlightIds: [],
      experimentId,
      recorded: [],
      mobileSheet: 'none',
      rightTab: 'inspector',
    }),

  loadExperiment: (id) => {
    const experiment = getExperiment(id);
    if (!experiment) return;
    const doc = experiment.build();
    get().loadDocument(doc, id);
    set({
      transientInitialVoltage: experiment.transient?.initialVoltage ?? 0,
      bottomOpen: experiment.chart !== 'none',
      bottomTab: experiment.chart === 'none' ? 'measure' : 'chart',
      rightTab: 'inspector',
    });
    get().zoomToFitSoon();
    get().toastMessage(`Loaded: ${experiment.title.en}`);
  },

  applyExperimentAction: (actionId) => {
    const state = get();
    if (!state.experimentId) return;
    const experiment = getExperiment(state.experimentId);
    const action = experiment?.actions.find((a) => a.id === actionId);
    if (!action) return;
    const before = state.doc;
    const after = action.apply(before);
    set({
      doc: after,
      past: [...state.past, before].slice(-60),
      future: [],
      refDoc: before,
      lastChangeKey: `action:${actionId}:${Date.now()}`,
      highlightIds: [],
      rightTab: state.mode === 'guided' ? 'guided' : state.mode === 'exam' ? 'exam' : 'explain',
      quizKey: state.quizKey + 1,
    });
  },

  setTransientInitialVoltage: (value) => set({ transientInitialVoltage: value }),

  refreshSaved: async () => {
    try {
      const saved = await getAdapters().storage.list();
      set({ saved });
    } catch {
      set({ saved: [] });
    }
  },

  saveCurrent: async () => {
    try {
      await getAdapters().storage.save(get().doc);
      await get().refreshSaved();
      get().toastMessage('Circuit saved locally');
    } catch {
      get().toastMessage('Could not save this circuit', 'error');
    }
  },

  loadSaved: async (id) => {
    try {
      const doc = await getAdapters().storage.load(id);
      if (!doc) {
        get().toastMessage('Saved circuit not found', 'error');
        return;
      }
      get().loadDocument(doc);
      get().fitView();
      set({ mobileSheet: 'none' });
      get().toastMessage('Circuit loaded');
    } catch {
      get().toastMessage('Could not load that circuit', 'error');
    }
  },

  deleteSaved: async (id) => {
    try {
      await getAdapters().storage.remove(id);
      await get().refreshSaved();
    } catch {
      get().toastMessage('Could not delete that circuit', 'error');
    }
  },

  exportCurrent: async () => {
    const { doc } = get();
    const name = doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'circuit';
    const ok = await getAdapters().exporter.saveFile(
      `${name}.circuitlab.json`,
      serializeCircuit(doc),
      'application/json',
    );
    get().toastMessage(ok ? 'Circuit exported' : 'Export is not available on this platform', ok ? 'ok' : 'error');
  },

  importCircuit: async () => {
    const raw = await getAdapters().navigation.readFileAsText?.();
    if (!raw) return;
    const result = parseCircuitJSON(raw);
    if (!result.ok || !result.doc) {
      get().toastMessage(result.errors[0] ?? 'Could not import that file', 'error');
      return;
    }
    get().loadDocument(result.doc);
    get().fitView();
    get().toastMessage(`Imported: ${result.doc.name}`);
  },

  shareCurrent: async () => {
    const result = await getAdapters().share.share({
      title: 'CircuitLab Physics',
      text: `Try my circuit: ${get().doc.name}`,
      url: typeof location !== 'undefined' ? location.href : undefined,
    });
    get().toastMessage(
      result === 'copied' ? 'Link copied to clipboard' : result === 'shared' ? 'Shared' : 'Sharing is not available',
      result === 'unsupported' ? 'error' : 'ok',
    );
  },

  recordPoint: () => {
    const state = get();
    const solution = solveCircuit(state.doc);
    const source = state.doc.components.find((c) => c.kind === 'cell' || c.kind === 'battery');
    if (!solution.ok || !source) {
      get().toastMessage('The circuit must be solved before recording a point', 'error');
      return;
    }
    const reading = solution.components[source.id];
    if (!reading) return;
    set({
      recorded: [
        ...state.recorded,
        {
          id: `pt_${Date.now()}_${state.recorded.length}`,
          x: reading.currentMagnitude,
          y: reading.voltageMagnitude,
          label: `${reading.currentMagnitude.toFixed(3)} A`,
        },
      ],
    });
    get().toastMessage('Point recorded');
  },

  clearRecorded: () => set({ recorded: [] }),

  toastMessage: (message, kind = 'ok') => {
    toastCounter += 1;
    const id = toastCounter;
    set({ toast: { id, message, kind } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 2800);
  },

  bumpQuiz: () => set((state) => ({ quizKey: state.quizKey + 1 })),

  zoomToFitSoon: () => {
    setTimeout(() => get().fitView(), 40);
  },
}));

export function useSolution() {
  const doc = useCircuitStore((s) => s.doc);
  return useMemo(() => solveCircuit(doc), [doc]);
}

export function useExplain(enable = true): ExplainResult | null {
  const doc = useCircuitStore((s) => s.doc);
  const refDoc = useCircuitStore((s) => s.refDoc);
  return useMemo(() => {
    if (!enable || !refDoc) return null;
    return explainChange({
      before: refDoc,
      after: doc,
      beforeSolution: solveCircuit(refDoc),
      afterSolution: solveCircuit(doc),
    });
  }, [doc, refDoc, enable]);
}

export function useComparison() {
  const doc = useCircuitStore((s) => s.doc);
  const refDoc = useCircuitStore((s) => s.refDoc);
  return useMemo(() => {
    if (!refDoc) return null;
    return buildComparison(refDoc, doc, solveCircuit(refDoc), solveCircuit(doc));
  }, [doc, refDoc]);
}

export function useGuidedQuestions(): GuidedQuestion[] {
  const explain = useExplain();
  return useMemo(() => (explain ? buildGuidedQuestions(explain) : []), [explain]);
}

export function getReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function downloadText(filename: string, content: string, mime = 'text/csv'): Promise<boolean> {
  return getAdapters().exporter.saveFile(filename, content, mime);
}

export type { Point };
