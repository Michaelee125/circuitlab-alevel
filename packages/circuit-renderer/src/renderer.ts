import { Application, Container, Graphics, Text } from 'pixi.js';
import type { Ticker } from 'pixi.js';
import {
  componentBounds,
  componentTerminals,
  getComponentDef,
  wirePolyline,
} from '@circuitlab/circuit-core';
import type {
  CircuitDocument,
  Point,
  QualityLevel,
  ThemeMode,
  ViewMode,
} from '@circuitlab/circuit-core';
import type { CircuitSolution } from '@circuitlab/physics-engine';
import { formatQuantity } from '@circuitlab/i18n';
import { paletteFor, type Palette } from './palette';
import { drawRealisticBody, drawSchematicBody } from './drawing';

export interface RenderState {
  doc: CircuitDocument;
  solution: CircuitSolution | null;
  viewMode: ViewMode;
  theme: ThemeMode;
  quality: QualityLevel;
  selectedId?: string | null;
  selectedWireId?: string | null;
  wiringFrom?: { componentId: string; terminalId: string } | null;
  hoverTerminal?: { componentId: string; terminalId: string } | null;
  highlightIds?: string[];
  showGrid?: boolean;
  labels?: Record<string, string>;
  reduceMotion?: boolean;
}

interface Flow {
  points: Point[];
  segments: number[];
  total: number;
  magnitude: number;
  direction: number;
  phase: number;
  count: number;
}

const FONT = "'Inter', 'Helvetica Neue', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'SF Mono', ui-monospace, 'Cascadia Mono', 'Roboto Mono', monospace";

function pointAt(flow: Flow, distance: number): Point {
  let remaining = distance;
  for (let i = 0; i < flow.points.length - 1; i += 1) {
    const length = flow.segments[i];
    if (remaining <= length || i === flow.points.length - 2) {
      const a = flow.points[i];
      const b = flow.points[i + 1];
      const t = length > 0 ? Math.min(1, remaining / length) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return flow.points[flow.points.length - 1];
}

export class CircuitRenderer {
  private app: Application | null = null;
  private world = new Container();
  private grid = new Graphics();
  private wires = new Graphics();
  private componentRoot = new Container();
  private overlay = new Graphics();
  private particleLayer = new Graphics();
  private labelRoot = new Container();
  private tickerHandler: ((ticker: Ticker) => void) | null = null;
  private state: RenderState | null = null;
  private palette: Palette = paletteFor('dark');
  private view = { x: 0, y: 0, zoom: 1 };
  private width = 800;
  private height = 600;
  private flows: Flow[] = [];
  private previewPoint: Point | null = null;
  private destroyed = false;

  get ready(): boolean {
    return Boolean(this.app);
  }

  async init(canvas: HTMLCanvasElement, width: number, height: number, quality: QualityLevel): Promise<void> {
    if (this.app) return;
    const app = new Application();
    await app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      antialias: quality !== 'low',
      resolution: quality === 'high' ? Math.min(2, window.devicePixelRatio || 1) : 1,
      autoDensity: true,
      preference: 'webgl',
    });
    this.app = app;
    this.width = width;
    this.height = height;
    this.world.addChild(this.grid, this.wires, this.componentRoot, this.overlay, this.particleLayer, this.labelRoot);
    app.stage.addChild(this.world);
    this.tickerHandler = (ticker: Ticker) => this.onTick(ticker.deltaMS / 1000);
    app.ticker.add(this.tickerHandler);
    app.ticker.maxFPS = quality === 'low' ? 30 : 60;
    this.applyView();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.app) {
      if (this.tickerHandler) this.app.ticker.remove(this.tickerHandler);
      this.app.destroy(false, { children: true });
      this.app = null;
    }
  }

  setQuality(quality: QualityLevel): void {
    if (!this.app) return;
    this.app.ticker.maxFPS = quality === 'low' ? 30 : 60;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (this.app) this.app.renderer.resize(this.width, this.height);
    if (this.state) this.drawGrid();
  }

  setView(view: { x: number; y: number; zoom: number }): void {
    this.view = view;
    this.applyView();
    if (this.state) this.drawGrid();
  }

  private applyView(): void {
    this.world.position.set(this.view.x, this.view.y);
    this.world.scale.set(this.view.zoom);
  }

  screenToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.view.x) / this.view.zoom,
      y: (screenY - this.view.y) / this.view.zoom,
    };
  }

  setState(state: RenderState): void {
    const themeChanged = this.state?.theme !== state.theme;
    this.state = state;
    if (themeChanged) this.palette = paletteFor(state.theme);
    this.rebuild();
  }

  setPointer(point: Point | null): void {
    this.previewPoint = point;
    this.drawOverlay();
  }

  setHoverTerminal(endpoint: { componentId: string; terminalId: string } | null): void {
    if (!this.state) return;
    this.state.hoverTerminal = endpoint;
    this.drawOverlay();
  }

  setCursorActive(active: boolean): void {
    if (!this.state) return;
    this.state.wiringFrom = active ? this.state.wiringFrom : null;
    this.drawOverlay();
  }

  private rebuild(): void {
    if (!this.state) return;
    const state = this.state;
    this.palette = paletteFor(state.theme);
    this.drawWires();
    this.drawComponents();
    this.drawOverlay();
    this.drawGrid();
    this.buildFlows();
  }

  private drawGrid(): void {
    if (!this.state) return;
    this.grid.clear();
    if (this.state.showGrid === false) return;
    const zoom = this.view.zoom;
    let spacing = 20;
    if (spacing * zoom < 14) spacing = 40;
    if (spacing * zoom < 10) spacing = 100;
    if (spacing * zoom < 8) spacing = 200;
    const left = -this.view.x / zoom;
    const top = -this.view.y / zoom;
    const right = (this.width - this.view.x) / zoom;
    const bottom = (this.height - this.view.y) / zoom;
    const startX = Math.floor(left / spacing) * spacing;
    const startY = Math.floor(top / spacing) * spacing;
    const color = this.palette.grid;
    const strong = this.palette.gridStrong;
    for (let x = startX; x <= right; x += spacing) {
      const major = Math.round(x / spacing) % 5 === 0;
      this.grid.moveTo(x, top).lineTo(x, bottom).stroke({ width: 1 / zoom, color: major ? strong : color, alpha: major ? 0.55 : 0.35 });
    }
    for (let y = startY; y <= bottom; y += spacing) {
      const major = Math.round(y / spacing) % 5 === 0;
      this.grid.moveTo(left, y).lineTo(right, y).stroke({ width: 1 / zoom, color: major ? strong : color, alpha: major ? 0.55 : 0.35 });
    }
  }

  private drawWires(): void {
    if (!this.state) return;
    const { doc } = this.state;
    this.wires.clear();
    for (const wire of doc.wires) {
      const points = wirePolyline(doc, wire);
      if (points.length < 2) continue;
      const selected = wire.id === this.state.selectedWireId;
      const trace = () => {
        this.wires.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) this.wires.lineTo(points[i].x, points[i].y);
      };
      if (selected) {
        trace();
        this.wires.stroke({ width: 16, color: this.palette.select, alpha: 0.2, cap: 'round', join: 'round' });
      }
      trace();
      this.wires.stroke({ width: 9, color: this.palette.wireGlow, alpha: 0.16, cap: 'round', join: 'round' });
      trace();
      this.wires.stroke({ width: 4.6, color: this.palette.background, alpha: 0.85, cap: 'round', join: 'round' });
      trace();
      this.wires.stroke({
        width: selected ? 3.4 : 2.4,
        color: selected ? this.palette.select : this.palette.wire,
        alpha: 0.98,
        cap: 'round',
        join: 'round',
      });
      // junction dots at both ends
      for (const point of [points[0], points[points.length - 1]]) {
        this.wires.circle(point.x, point.y, 3.1).fill({ color: this.palette.wire });
      }
    }
  }

  private drawComponents(): void {
    if (!this.state) return;
    const state = this.state;
    for (const child of [...this.componentRoot.children]) child.destroy({ children: true });
    this.componentRoot.removeChildren();
    for (const child of [...this.labelRoot.children]) child.destroy({ children: true });
    this.labelRoot.removeChildren();

    const sorted = [...state.doc.components].sort((a, b) => a.y - b.y);
    for (const comp of sorted) {
      const container = new Container();
      container.position.set(comp.x, comp.y);
      container.rotation = (comp.rotation * Math.PI) / 180;
      const g = new Graphics();
      const reading = state.solution?.components[comp.id];
      if (state.viewMode === 'realistic') {
        const intensity = reading ? Math.min(1, Math.abs(reading.power) / 2.6) : 0;
        drawRealisticBody(g, comp, this.palette, intensity);
      } else {
        drawSchematicBody(g, comp, this.palette);
      }
      container.addChild(g);

      if (
        (comp.kind === 'cell' || comp.kind === 'battery') &&
        (comp.params.internalResistance ?? 0) > 0
      ) {
        const r = comp.params.internalResistance ?? 0;
        const annotation = new Text({
          text: `r = ${r < 1 ? r.toFixed(2) : r.toFixed(1)} Ω`,
          style: { fontFamily: MONO, fontSize: 8.5, fontWeight: '600', fill: this.palette.highlight },
        });
        annotation.anchor.set(0.5);
        annotation.position.set(0, -36);
        container.addChild(annotation);
      }

      if (comp.kind === 'ammeter' || comp.kind === 'voltmeter') {
        const value = reading
          ? comp.kind === 'ammeter'
            ? formatQuantity(reading.currentMagnitude, 'current')
            : formatQuantity(reading.voltageMagnitude, 'voltage')
          : '—';
        const display = new Text({
          text: value,
          style: {
            fontFamily: MONO,
            fontSize: state.viewMode === 'realistic' ? 11 : 12,
            fontWeight: '600',
            fill: this.palette.displayText,
          },
        });
        display.anchor.set(0.5);
        display.position.set(0, state.viewMode === 'realistic' ? 2 : 0);
        container.addChild(display);
        if (state.viewMode === 'schematic') {
          const letter = new Text({
            text: comp.kind === 'ammeter' ? 'A' : 'V',
            style: { fontFamily: FONT, fontSize: 13, fontWeight: '700', fill: this.palette.accent },
          });
          letter.anchor.set(0.5);
          letter.position.set(0, -14);
          container.addChild(letter);
        }
      }

      this.componentRoot.addChild(container);

      const labelText = state.labels?.[comp.id] ?? comp.label ?? getComponentDef(comp.kind).name;
      const showValue = comp.kind === 'resistor' || comp.kind === 'variable-resistor' || comp.kind === 'ldr' || comp.kind === 'thermistor' || comp.kind === 'capacitor' || comp.kind === 'cell' || comp.kind === 'battery';
      const text = new Text({
        text: labelText,
        style: {
          fontFamily: FONT,
          fontSize: 10.5,
          fontWeight: '600',
          fill: this.palette.muted,
          letterSpacing: 0.4,
        },
      });
      text.anchor.set(0.5, 0);
      const bounds = componentBounds(comp);
      text.position.set(comp.x, bounds.y + bounds.height + 6);
      this.labelRoot.addChild(text);
      if (showValue) {
        const value = this.valueLabel(comp);
        if (value) {
          const valueText = new Text({
            text: value,
            style: { fontFamily: MONO, fontSize: 9.5, fontWeight: '500', fill: this.palette.muted },
          });
          valueText.anchor.set(0.5, 0);
          valueText.position.set(comp.x, bounds.y + bounds.height + 19);
          this.labelRoot.addChild(valueText);
        }
      }
    }
  }

  private valueLabel(comp: CircuitDocument['components'][number]): string {
    switch (comp.kind) {
      case 'cell':
      case 'battery':
        return formatQuantity(comp.params.emf ?? 0, 'voltage');
      case 'resistor':
      case 'variable-resistor':
        return formatQuantity(comp.params.resistance ?? 0, 'resistance');
      case 'ldr':
        return `${formatQuantity(this.ldrOhms(comp), 'resistance')}`;
      case 'thermistor':
        return `${formatQuantity(this.thOhms(comp), 'resistance')}`;
      case 'capacitor':
        return formatQuantity(comp.params.capacitance ?? 0, 'capacitance');
      default:
        return '';
    }
  }

  private ldrOhms(comp: CircuitDocument['components'][number]): number {
    const reference = comp.params.referenceResistance ?? 100;
    const gamma = comp.params.gamma ?? 0.7;
    const lux = Math.max(0.05, comp.params.illuminance ?? 300);
    return reference * Math.pow(10 / lux, gamma);
  }

  private thOhms(comp: CircuitDocument['components'][number]): number {
    const reference = comp.params.referenceResistance ?? 1000;
    const beta = comp.params.beta ?? 3500;
    const kelvin = Math.max(1, (comp.params.temperatureC ?? 25) + 273.15);
    return reference * Math.exp(beta * (1 / kelvin - 1 / 298.15));
  }

  private drawOverlay(): void {
    if (!this.state) return;
    const state = this.state;
    this.overlay.clear();
    const selected = state.doc.components.find((c) => c.id === state.selectedId);
    if (selected) {
      const b = componentBounds(selected);
      this.overlay
        .roundRect(b.x - 6, b.y - 6, b.width + 12, b.height + 12, 10)
        .stroke({ width: 1.6, color: this.palette.select, alpha: 0.85 });
      this.overlay
        .roundRect(b.x - 10, b.y - 10, b.width + 20, b.height + 20, 13)
        .stroke({ width: 1, color: this.palette.select, alpha: 0.18 });
    }

    for (const id of state.highlightIds ?? []) {
      const comp = state.doc.components.find((c) => c.id === id);
      if (!comp) continue;
      const b = componentBounds(comp);
      this.overlay
        .roundRect(b.x - 8, b.y - 8, b.width + 16, b.height + 16, 12)
        .fill({ color: this.palette.highlight, alpha: 0.08 });
      this.overlay
        .roundRect(b.x - 8, b.y - 8, b.width + 16, b.height + 16, 12)
        .stroke({ width: 2, color: this.palette.highlight, alpha: 0.9 });
    }

    const using = Boolean(state.wiringFrom);
    for (const comp of state.doc.components) {
      for (const terminal of componentTerminals(comp)) {
        const isFrom =
          state.wiringFrom?.componentId === comp.id && state.wiringFrom.terminalId === terminal.id;
        const isHover =
          state.hoverTerminal?.componentId === comp.id && state.hoverTerminal.terminalId === terminal.id;
        if (state.viewMode === 'schematic' || using || isHover || isFrom) {
          const radius = isFrom ? 5.4 : isHover ? 5 : 3.4;
          this.overlay.circle(terminal.x, terminal.y, radius + 2).fill({ color: this.palette.wire, alpha: 0.14 });
          this.overlay.circle(terminal.x, terminal.y, radius).fill({ color: isFrom ? this.palette.select : this.palette.wire, alpha: 0.95 });
          if (isFrom || isHover) {
            this.overlay.circle(terminal.x, terminal.y, 9).stroke({ width: 1.4, color: this.palette.select, alpha: 0.7 });
          }
        }
      }
    }

    if (state.wiringFrom && this.previewPoint) {
      const comp = state.doc.components.find((c) => c.id === state.wiringFrom?.componentId);
      const terminal = comp ? componentTerminals(comp).find((t) => t.id === state.wiringFrom?.terminalId) : undefined;
      if (terminal) this.drawDashed(terminal, this.previewPoint);
    }
  }

  private drawDashed(from: Point, to: Point): void {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const dash = 9;
    const gap = 7;
    const steps = Math.max(1, Math.floor(distance / (dash + gap)));
    for (let i = 0; i < steps; i += 1) {
      const t0 = (i * (dash + gap)) / distance;
      const t1 = Math.min(1, t0 + dash / distance);
      this.overlay
        .moveTo(from.x + (to.x - from.x) * t0, from.y + (to.y - from.y) * t0)
        .lineTo(from.x + (to.x - from.x) * t1, from.y + (to.y - from.y) * t1)
        .stroke({ width: 2, color: this.palette.select, alpha: 0.85 });
    }
  }

  private buildFlows(): void {
    if (!this.state) return;
    const { doc, solution, quality } = this.state;
    this.flows = [];
    if (!solution?.ok) {
      this.particleLayer.clear();
      return;
    }
    const density = quality === 'high' ? 1 : quality === 'medium' ? 0.7 : 0.4;
    for (const wire of doc.wires) {
      const points = wirePolyline(doc, wire);
      if (points.length < 2) continue;
      const segments: number[] = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
        segments.push(length);
        total += length;
      }
      const fromReading = solution.components[wire.from.componentId];
      const toReading = solution.components[wire.to.componentId];
      const fromComp = doc.components.find((c) => c.id === wire.from.componentId);
      const toComp = doc.components.find((c) => c.id === wire.to.componentId);
      const fromIndex = fromComp
        ? getComponentDef(fromComp.kind).terminals.findIndex((t) => t.id === wire.from.terminalId)
        : 0;
      const toIndex = toComp
        ? getComponentDef(toComp.kind).terminals.findIndex((t) => t.id === wire.to.terminalId)
        : 0;
      const inwardFrom = fromReading ? (fromIndex === 0 ? fromReading.current : -fromReading.current) : 0;
      const inwardTo = toReading ? (toIndex === 0 ? toReading.current : -toReading.current) : 0;
      const useFrom = Math.abs(inwardFrom) >= Math.abs(inwardTo);
      const inward = useFrom ? inwardFrom : inwardTo;
      const magnitude = Math.abs(inward);
      if (magnitude < 1e-7) continue;
      const count = Math.max(2, Math.round((total / 85) * density));
      this.flows.push({
        points,
        segments,
        total,
        magnitude,
        direction: inward > 0 ? -1 : 1,
        phase: Math.random() * total,
        count,
      });
    }
  }

  private onTick(dt: number): void {
    if (!this.state || this.flows.length === 0) {
      if (this.particleLayer) this.particleLayer.clear();
      return;
    }
    const g = this.particleLayer;
    g.clear();
    const speedScale = this.state.reduceMotion ? 0.35 : 1;
    for (const flow of this.flows) {
      const speed = (26 + Math.min(1, flow.magnitude / 2) * 90) * speedScale;
      flow.phase = (flow.phase + speed * dt * flow.direction + flow.total * 2) % flow.total;
      const gap = flow.total / flow.count;
      for (let i = 0; i < flow.count; i += 1) {
        const distance = (flow.phase + i * gap + flow.total) % flow.total;
        const point = pointAt(flow, distance);
        g.circle(point.x, point.y, 4.2).fill({ color: this.palette.accent, alpha: 0.14 });
        g.circle(point.x, point.y, 2.1).fill({ color: this.palette.accent, alpha: 0.95 });
      }
    }
  }
}
