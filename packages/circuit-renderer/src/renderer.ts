import { Application, Container, FillGradient, Graphics, Text } from 'pixi.js';
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
import { drawRealisticBody, drawSchematicBody, mixColor } from './drawing';

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
  showValues?: boolean;
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
  private glowLayer = new Graphics();
  private fxLayer = new Graphics();
  private chipRoot = new Container();
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
  private time = 0;
  private previousCurrents = new Map<string, number>();
  private flashes = new Map<string, number>();

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
    this.world.addChild(
      this.grid,
      this.wires,
      this.componentRoot,
      this.glowLayer,
      this.fxLayer,
      this.overlay,
      this.particleLayer,
      this.labelRoot,
    );
    this.glowLayer.blendMode = 'add';
    this.particleLayer.blendMode = 'add';
    app.stage.addChild(this.world);
    // Value chips are drawn in screen space so they stay legible at any zoom.
    app.stage.addChild(this.chipRoot);
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
    if (this.state) {
      this.drawGrid();
      this.drawValueChips();
      this.drawOverlay();
    }
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
    this.detectValueChanges();
    this.rebuild();
  }

  /** Pulse a component when its current visibly changes after an edit. */
  private detectValueChanges(): void {
    const solution = this.state?.solution;
    if (!solution) return;
    const now = performance.now();
    for (const [id, reading] of Object.entries(solution.components)) {
      const next = reading.currentMagnitude;
      const previous = this.previousCurrents.get(id);
      if (previous !== undefined) {
        const delta = Math.abs(next - previous);
        if (reading.valid && delta > Math.max(5e-4, previous * 0.04) && delta > 5e-4) {
          this.flashes.set(id, now);
        }
      }
      this.previousCurrents.set(id, next);
    }
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
    this.drawValueChips();
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
            fontSize: state.viewMode === 'realistic' ? 11 : 13.5,
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
            style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: this.palette.accent },
          });
          letter.anchor.set(0.5);
          letter.position.set(0, -14);
          container.addChild(letter);
        }
      }

      this.componentRoot.addChild(container);

      const labelText = state.labels?.[comp.id] ?? comp.label ?? getComponentDef(comp.kind).name;
      const showValue =
        !state.showValues &&
        (comp.kind === 'resistor' ||
          comp.kind === 'variable-resistor' ||
          comp.kind === 'ldr' ||
          comp.kind === 'thermistor' ||
          comp.kind === 'capacitor' ||
          comp.kind === 'cell' ||
          comp.kind === 'battery');
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

  /**
   * Live V / I / R chips for every component in schematic mode. Placement is
   * collision-aware: above, below, right or left of the symbol, avoiding other
   * components, their designators and previously placed chips.
   */
  private drawValueChips(): void {
    for (const child of [...this.chipRoot.children]) child.destroy({ children: true });
    this.chipRoot.removeChildren();
    const state = this.state;
    if (!state?.showValues || !state.solution) return;

    const zoom = this.view.zoom;
    // Narrow canvases (phones) get compact cards so several can sit side by side.
    const compact = this.width < 560;
    const W = compact ? 80 : 108;
    const H = compact ? 44 : 52;
    const GAP = 12;
    const toScreen = (p: Point) => ({ x: p.x * zoom + this.view.x, y: p.y * zoom + this.view.y });

    const screenBounds = state.doc.components.map((comp) => {
      const b = componentBounds(comp);
      return {
        x: b.x * zoom + this.view.x,
        y: b.y * zoom + this.view.y,
        width: b.width * zoom,
        height: b.height * zoom,
      };
    });
    const occupied = [...screenBounds];
    // designator labels live just below each symbol
    state.doc.components.forEach((comp, index) => {
      const b = screenBounds[index];
      occupied.push({ x: b.x + b.width / 2 - 26, y: b.y + b.height + 2, width: 52, height: 24 });
    });

    const wireSegments: { a: Point; b: Point }[] = [];
    for (const wire of state.doc.wires) {
      const points = wirePolyline(state.doc, wire).map(toScreen);
      for (let i = 0; i < points.length - 1; i += 1) {
        wireSegments.push({ a: points[i], b: points[i + 1] });
      }
    }

    const segmentHitsRect = (a: Point, b: Point, rect: { x: number; y: number; width: number; height: number }): boolean => {
      const inside = (p: Point) =>
        p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height;
      if (inside(a) || inside(b)) return true;
      const edges: { a: Point; b: Point }[] = [
        { a: { x: rect.x, y: rect.y }, b: { x: rect.x + rect.width, y: rect.y } },
        { a: { x: rect.x + rect.width, y: rect.y }, b: { x: rect.x + rect.width, y: rect.y + rect.height } },
        { a: { x: rect.x + rect.width, y: rect.y + rect.height }, b: { x: rect.x, y: rect.y + rect.height } },
        { a: { x: rect.x, y: rect.y + rect.height }, b: { x: rect.x, y: rect.y } },
      ];
      const ccw = (p: Point, q: Point, r: Point) => (r.y - p.y) * (q.x - p.x) > (q.y - p.y) * (r.x - p.x);
      return edges.some((edge) => ccw(a, b, edge.a) !== ccw(a, b, edge.b) && ccw(edge.a, edge.b, a) !== ccw(edge.a, edge.b, b));
    };

    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
      pad = 6,
    ) =>
      a.x < b.x + b.width + pad &&
      a.x + a.width + pad > b.x &&
      a.y < b.y + b.height + pad &&
      a.y + a.height + pad > b.y;

    const ordered = [...state.doc.components].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const comp of ordered) {
      if (comp.kind === 'ammeter' || comp.kind === 'voltmeter') continue;
      const reading = state.solution.components[comp.id];
      if (!reading || !reading.valid) continue;
      const index = state.doc.components.indexOf(comp);
      const b = screenBounds[index];
      const focus = toScreen({ x: comp.x, y: comp.y });
      const gap = 14;
      const candidates = [
        { x: b.x + b.width / 2 - W / 2, y: b.y - H - gap },
        { x: b.x + b.width / 2 - W / 2, y: b.y + b.height + gap + 20 },
        { x: b.x + b.width + gap, y: b.y + b.height / 2 - H / 2 },
        { x: b.x - W - gap, y: b.y + b.height / 2 - H / 2 },
        { x: b.x + b.width / 2 - W / 2, y: b.y - H - gap - 24 },
        { x: b.x + b.width + gap + 22, y: b.y - H - gap },
        { x: b.x - W - gap - 22, y: b.y + b.height + gap },
        { x: b.x + b.width / 2 - W / 2, y: b.y + b.height + gap + 46 },
      ];
      const topInset = compact ? 8 : 64;
      const inCanvas = (rect: { x: number; y: number; width: number; height: number }) =>
        rect.x >= 8 &&
        rect.y >= topInset &&
        rect.x + rect.width <= this.width - 8 &&
        rect.y + rect.height <= this.height - 10;
      // Only place a chip where it overlaps nothing at all. If the area is too
      // crowded the chip is omitted rather than drawn on top of an element.
      let chosen: { x: number; y: number } | null = null;
      for (const candidate of candidates) {
        const rect = { ...candidate, width: W, height: H };
        if (!inCanvas(rect)) continue;
        if (occupied.some((other) => intersects(rect, other))) continue;
        if (wireSegments.some((segment) => segmentHitsRect(segment.a, segment.b, rect))) continue;
        chosen = candidate;
        break;
      }
      if (!chosen) continue;
      occupied.push({ ...chosen, width: W, height: H });
      const chip = new Container();
      const g = new Graphics();
      const cx = chosen.x + W / 2;
      const cy = chosen.y + H / 2;
      const dark = this.palette.chipBg !== 0xffffff;
      // leader line sits behind the glass
      const radius = compact ? 11 : 15;
      g.moveTo(cx, cy).lineTo(focus.x, focus.y).stroke({ width: 1, color: this.palette.chipLine, alpha: 0.7 });
      // soft contact shadow
      g.roundRect(chosen.x + 1, chosen.y + (compact ? 3 : 4), W, H, radius).fill({
        color: 0x000000,
        alpha: dark ? 0.34 : 0.16,
      });
      // frosted body
      const topColor = mixColor(this.palette.chipBg, 0xffffff, dark ? 0.1 : 0);
      const body = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: topColor },
          { offset: 1, color: this.palette.chipBg },
        ],
        textureSpace: 'local',
      });
      g.roundRect(chosen.x, chosen.y, W, H, radius).fill(body);
      g.roundRect(chosen.x, chosen.y, W, H, radius).fill({ color: this.palette.accent, alpha: 0.035 });
      // glass sheen + inner hairline
      g.roundRect(chosen.x + 1.5, chosen.y + 1.5, W - 3, H * 0.46, radius - 2).fill({
        color: 0xffffff,
        alpha: dark ? 0.08 : 0.5,
      });
      g.roundRect(chosen.x, chosen.y, W, H, radius).stroke({ width: 1, color: this.palette.chipLine, alpha: 0.95 });
      g.roundRect(chosen.x + 1, chosen.y + 1, W - 2, H - 2, radius - 1).stroke({
        width: 0.6,
        color: 0xffffff,
        alpha: dark ? 0.12 : 0.8,
      });
      // left accent rail
      g.roundRect(chosen.x + (compact ? 5 : 6.5), chosen.y + (compact ? 7 : 9), 2.2, H - (compact ? 14 : 18), 1.1).fill({
        color: this.palette.accent,
        alpha: 0.9,
      });
      chip.addChild(g);

      const isSource = comp.kind === 'cell' || comp.kind === 'battery';
      const third = isSource
        ? `r  ${(comp.params.internalResistance ?? 0).toFixed(2)} Ω`
        : `R  ${
            reading.resistance !== null && Number.isFinite(reading.resistance)
              ? formatQuantity(reading.resistance, 'resistance')
              : '—'
          }`;
      const rows: { text: string; color: number }[] = [
        { text: `V  ${formatQuantity(reading.voltageMagnitude, 'voltage')}`, color: this.palette.valueV },
        { text: `I  ${formatQuantity(reading.currentMagnitude, 'current')}`, color: this.palette.valueI },
        { text: third, color: this.palette.valueR },
      ];
      rows.forEach((row, rowIndex) => {
        const text = new Text({
          text: row.text,
          style: {
            fontFamily: MONO,
            fontSize: compact ? 7.7 : 10.5,
            fontWeight: '600',
            fill: row.color,
            letterSpacing: 0.15,
          },
        });
        text.position.set(
          chosen.x + (compact ? 10 : 14),
          chosen.y + (compact ? 5 : 7) + rowIndex * (compact ? 11.6 : 14.5),
        );
        chip.addChild(text);
      });
      this.chipRoot.addChild(chip);
    }
  }

  /** Live glow for lamps, a breathing selection ring and value-change pulses. */
  private drawAnimations(dt: number): void {
    const state = this.state;
    if (!state) return;
    this.time += dt;
    const palette = this.palette;
    const glow = this.glowLayer;
    const fx = this.fxLayer;
    glow.clear();
    fx.clear();
    const reduce = state.reduceMotion;

    for (const comp of state.doc.components) {
      if (comp.kind !== 'lamp') continue;
      const reading = state.solution?.components[comp.id];
      if (!reading) continue;
      const intensity = Math.max(0, Math.min(1, Math.abs(reading.power) / 2.4));
      if (intensity <= 0.005) continue;
      const pulse = reduce ? 1 : 1 + 0.055 * Math.sin(this.time * 2.3 + comp.x * 0.013);
      const schemaDamp = state.viewMode === 'schematic' ? 0.55 : 1;
      const base = (16 + intensity * 30) * pulse;
      const layers = 12;
      for (let i = 0; i < layers; i += 1) {
        const t = i / (layers - 1);
        glow.circle(comp.x, comp.y, base * (1 + t * 1.9)).fill({
          color: palette.glow,
          alpha: (0.012 + intensity * 0.032) * schemaDamp * (1 - t) * (1 - t) * (1 - t),
        });
      }
    }

    const selected = state.doc.components.find((comp) => comp.id === state.selectedId);
    if (selected && !reduce) {
      const b = componentBounds(selected);
      const alpha = 0.3 + 0.14 * Math.sin(this.time * 3.1);
      fx.roundRect(b.x - 7, b.y - 7, b.width + 14, b.height + 14, 13).stroke({
        width: 1.6,
        color: palette.select,
        alpha,
      });
    }

    const now = performance.now();
    for (const [id, started] of this.flashes) {
      const age = now - started;
      if (age > 900) {
        this.flashes.delete(id);
        continue;
      }
      const comp = state.doc.components.find((c) => c.id === id);
      if (!comp) continue;
      const progress = age / 900;
      fx.circle(comp.x, comp.y, 30 + progress * 48).stroke({
        width: 2,
        color: palette.accent,
        alpha: (1 - progress) * 0.42,
      });
    }
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
      const count = Math.max(3, Math.round((total / 70) * density));
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
    if (!this.state) return;
    this.drawAnimations(dt);
    if (this.flows.length === 0) {
      this.particleLayer.clear();
      return;
    }
    const g = this.particleLayer;
    g.clear();
    const speedScale = this.state.reduceMotion ? 0.35 : 1;
    const accent = this.palette.accent;
    const hot = this.palette.glow;
    // Keep the comets a consistent size on screen at any zoom.
    const k = Math.max(0.55, Math.min(1.8, 1 / this.view.zoom));
    for (const flow of this.flows) {
      const intensity = Math.min(1, flow.magnitude / 1.5);
      const speed = (40 + intensity * 120) * speedScale;
      flow.phase = (flow.phase + speed * dt * flow.direction + flow.total * 2) % flow.total;
      const gap = flow.total / flow.count;
      // energetic charge looks warmer
      const coreColor = intensity > 0.75 ? hot : 0xffffff;
      for (let i = 0; i < flow.count; i += 1) {
        const distance = (flow.phase + i * gap + flow.total) % flow.total;
        const point = pointAt(flow, distance);
        // comet trail behind the carrier
        const trail = pointAt(flow, (distance - 14 * flow.direction + flow.total * 2) % flow.total);
        g.moveTo(trail.x, trail.y)
          .lineTo(point.x, point.y)
          .stroke({ width: 2.6 * k, color: accent, alpha: 0.28 + intensity * 0.2, cap: 'round' });
        g.circle(point.x, point.y, (6.5 + intensity * 3) * k).fill({ color: accent, alpha: 0.1 + intensity * 0.06 });
        g.circle(point.x, point.y, 4.4 * k).fill({ color: accent, alpha: 0.35 + intensity * 0.2 });
        g.circle(point.x, point.y, 2.1 * k).fill({ color: coreColor, alpha: 0.95 });
      }
    }
  }
}
