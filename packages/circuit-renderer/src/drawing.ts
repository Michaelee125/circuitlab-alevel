import { FillGradient } from 'pixi.js';
import type { Graphics } from 'pixi.js';
import type { ComponentInstance } from '@circuitlab/circuit-core';
import { getComponentDef } from '@circuitlab/circuit-core';
import type { Palette } from './palette';

type P = [number, number];

function line(g: Graphics, points: P[], color: number, width: number, alpha = 1): void {
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

function curve(
  g: Graphics,
  from: P,
  control: P,
  to: P,
  color: number,
  width: number,
  alpha = 1,
): void {
  g.moveTo(from[0], from[1]);
  g.quadraticCurveTo(control[0], control[1], to[0], to[1]);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

function circle(g: Graphics, x: number, y: number, r: number, color: number, alpha = 1): void {
  g.circle(x, y, r).fill({ color, alpha });
}

function rect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: number,
  alpha = 1,
  strokeColor?: number,
  strokeWidth = 1.5,
): void {
  g.roundRect(x, y, w, h, r).fill({ color, alpha });
  if (strokeColor !== undefined) g.stroke({ width: strokeWidth, color: strokeColor, alpha: 1 });
}

function arrowHead(g: Graphics, tip: P, from: P, color: number, size = 7): void {
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const left: P = [tip[0] - Math.cos(angle - 0.42) * size, tip[1] - Math.sin(angle - 0.42) * size];
  const right: P = [tip[0] - Math.cos(angle + 0.42) * size, tip[1] - Math.sin(angle + 0.42) * size];
  g.poly([tip[0], tip[1], left[0], left[1], right[0], right[1]]).fill({ color });
}

function lead(g: Graphics, fromX: number, toX: number, palette: Palette, width: number, y = 0): void {
  line(g, [[fromX, y], [toX, y]], palette.metalDark, width + 2.4, 0.55);
  line(g, [[fromX, y], [toX, y]], palette.metal, width, 0.95);
}

function terminalPins(g: Graphics, comp: ComponentInstance, palette: Palette): void {
  const def = getComponentDef(comp.kind);
  for (const t of def.terminals) {
    g.circle(t.x, t.y, 3.6).fill({ color: palette.terminal, alpha: 1 });
    g.circle(t.x, t.y, 1.6).fill({ color: palette.background, alpha: 0.9 });
  }
}

function zigzag(g: Graphics, x0: number, x1: number, palette: Palette, amplitude = 9): void {
  const points: P[] = [[x0, 0]];
  const steps = 7;
  for (let i = 1; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = i === steps ? 0 : (i % 2 === 0 ? 1 : -1) * amplitude;
    points.push([x, y]);
  }
  line(g, points, palette.accent, 2.2);
}

// ---------------------------------------------------------------------------
// Schematic mode
// ---------------------------------------------------------------------------

export function drawSchematicBody(g: Graphics, comp: ComponentInstance, palette: Palette): void {
  const stroke = palette.accent;
  switch (comp.kind) {
    case 'resistor':
      lead(g, -52, -28, palette, 2);
      lead(g, 28, 52, palette, 2);
      rect(g, -28, -11, 56, 22, 2, palette.body, 0.85, stroke, 2);
      break;
    case 'variable-resistor':
      lead(g, -52, -28, palette, 2);
      lead(g, 28, 52, palette, 2);
      rect(g, -28, -11, 56, 22, 2, palette.body, 0.85, stroke, 2);
      line(g, [[-20, 20], [20, -20]], stroke, 2);
      arrowHead(g, [22, -22], [-20, 20], stroke, 8);
      break;
    case 'lamp':
      lead(g, -52, -20, palette, 2);
      lead(g, 20, 52, palette, 2);
      g.circle(0, 0, 20).fill({ color: palette.body, alpha: 0.7 }).stroke({ width: 2, color: stroke });
      line(g, [[-11, -11], [11, 11]], stroke, 2);
      line(g, [[11, -11], [-11, 11]], stroke, 2);
      break;
    case 'cell': {
      const internalR = comp.params.internalResistance ?? 0;
      lead(g, -52, -9, palette, 2);
      lead(g, internalR > 0 ? 9 : 9, internalR > 0 ? 31 : 52, palette, 2);
      lead(g, 49, 52, palette, 2);
      line(g, [[-9, -9], [-9, 9]], stroke, 2.4);
      line(g, [[9, -16], [9, 16]], stroke, 2.4);
      if (internalR > 0) {
        // internal resistance shown in series with the EMF, inside the cell lead
        g.roundRect(31, -6, 18, 12, 2).fill({ color: palette.body, alpha: 0.96 }).stroke({ width: 1.5, color: palette.highlight });
        line(g, [[34, 0], [37, -3], [40, 3], [43, -3], [46, 3]], palette.highlight, 1.3);
      }
      break;
    }
    case 'battery': {
      const internalR = comp.params.internalResistance ?? 0;
      lead(g, -52, -21, palette, 2);
      lead(g, 21, internalR > 0 ? 31 : 52, palette, 2);
      lead(g, 49, 52, palette, 2);
      line(g, [[-21, -9], [-21, 9]], stroke, 2.2);
      line(g, [[-11, -16], [-11, 16]], stroke, 2.2);
      line(g, [[1, -9], [1, 9]], stroke, 2.2);
      line(g, [[11, -16], [11, 16]], stroke, 2.2);
      if (internalR > 0) {
        g.roundRect(31, -6, 18, 12, 2).fill({ color: palette.body, alpha: 0.96 }).stroke({ width: 1.5, color: palette.highlight });
        line(g, [[34, 0], [37, -3], [40, 3], [43, -3], [46, 3]], palette.highlight, 1.3);
      }
      break;
    }
    case 'switch': {
      lead(g, -52, -24, palette, 2);
      lead(g, 24, 52, palette, 2);
      const closed = comp.params.closed !== false;
      g.circle(-24, 0, 4).fill({ color: stroke });
      g.circle(24, 0, 4).fill({ color: stroke });
      line(g, [[-24, 0], [closed ? 24 : 18, closed ? 0 : -20]], stroke, 2.4);
      break;
    }
    case 'ammeter':
    case 'voltmeter':
      lead(g, -52, -22, palette, 2);
      lead(g, 22, 52, palette, 2);
      g.circle(0, 0, 23).fill({ color: palette.body, alpha: 0.9 }).stroke({ width: 2, color: stroke });
      break;
    case 'ldr':
      lead(g, -52, -28, palette, 2);
      lead(g, 28, 52, palette, 2);
      rect(g, -28, -14, 56, 28, 3, palette.body, 0.8, stroke, 2);
      line(g, [[-46, 26], [-24, 14]], palette.highlight, 1.8);
      arrowHead(g, [-24, 14], [-46, 26], palette.highlight, 5);
      line(g, [[-38, 36], [-16, 24]], palette.highlight, 1.8);
      arrowHead(g, [-16, 24], [-38, 36], palette.highlight, 5);
      break;
    case 'thermistor':
      lead(g, -52, -28, palette, 2);
      lead(g, 28, 52, palette, 2);
      rect(g, -28, -13, 56, 26, 3, palette.body, 0.8, stroke, 2);
      line(g, [[-22, 22], [12, -22]], stroke, 2);
      line(g, [[12, -22], [24, -22]], stroke, 2);
      break;
    case 'capacitor':
      lead(g, -52, -10, palette, 2);
      lead(g, 10, 52, palette, 2);
      line(g, [[-10, -22], [-10, 22]], stroke, 2.8);
      line(g, [[10, -22], [10, 22]], stroke, 2.8);
      break;
    case 'diode':
      lead(g, -52, -16, palette, 2);
      lead(g, 16, 52, palette, 2);
      g.poly([-16, -16, -16, 16, 16, 0]).fill({ color: palette.body, alpha: 0.9 }).stroke({ width: 2, color: stroke });
      line(g, [[16, -18], [16, 18]], stroke, 2.4);
      break;
    default:
      break;
  }
  terminalPins(g, comp, palette);
}

// ---------------------------------------------------------------------------
// Realistic mode — layered gradients, soft metals and glass
// ---------------------------------------------------------------------------

export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const shade = (color: number, amount: number): number =>
  amount >= 0 ? mixColor(color, 0xffffff, amount) : mixColor(color, 0x000000, -amount);

function linearFill(
  stops: [number, number][],
  vertical = true,
): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: vertical ? { x: 0, y: 0 } : { x: 0, y: 0 },
    end: vertical ? { x: 0, y: 1 } : { x: 1, y: 0 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}

function radialFill(stops: [number, number][], cx = 0.42, cy = 0.35): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: cx, y: cy },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.62,
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}

function softShadow(g: Graphics, palette: Palette, width = 78, height = 18): void {
  g.ellipse(0, 27, width / 2 + 6, height / 2 + 5).fill({ color: palette.shadow, alpha: 0.12 });
  g.ellipse(0, 26, width / 2, height / 2).fill({ color: palette.shadow, alpha: 0.24 });
}

function metalLead(g: Graphics, fromX: number, toX: number, palette: Palette): void {
  const x = Math.min(fromX, toX);
  const width = Math.abs(toX - fromX);
  if (width <= 0) return;
  const grad = linearFill([
    [0, shade(palette.metalDark, -0.15)],
    [0.24, palette.metal],
    [0.4, shade(palette.metal, 0.6)],
    [0.62, palette.metal],
    [1, shade(palette.metalDark, -0.25)],
  ]);
  g.roundRect(x, -2.5, width, 5, 2.5).fill(grad).stroke({ width: 0.5, color: 0x000000, alpha: 0.28 });
}

function gloss(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.roundRect(x, y, w, h, Math.min(h / 2, 3)).fill({ color: 0xffffff, alpha: 0.18 });
}

function drawLampGlow(g: Graphics, palette: Palette, intensity: number): void {
  if (intensity <= 0.01) return;
  const alpha = Math.min(0.6, 0.12 + intensity * 0.55);
  for (let i = 4; i >= 1; i -= 1) {
    circle(g, 0, 0, 18 + i * 7, palette.glow, (alpha * 0.16) / i);
  }
}

function bezel(g: Graphics, palette: Palette, x: number, y: number, w: number, h: number, r: number): void {
  g.roundRect(x, y, w, h, r)
    .fill(
      linearFill([
        [0, shade(palette.bodyLight, 0.3)],
        [0.14, palette.bodyLight],
        [0.6, palette.body],
        [1, shade(palette.body, -0.4)],
      ]),
    )
    .stroke({ width: 1.2, color: shade(palette.body, -0.55), alpha: 0.9 });
}

export function drawRealisticBody(
  g: Graphics,
  comp: ComponentInstance,
  palette: Palette,
  intensity = 0,
): void {
  switch (comp.kind) {
    case 'resistor': {
      softShadow(g, palette);
      metalLead(g, -52, -28, palette);
      metalLead(g, 28, 52, palette);
      g.roundRect(-28, -13, 56, 26, 7)
        .fill(
          linearFill([
            [0, shade(palette.ceramic, 0.4)],
            [0.45, palette.ceramic],
            [0.8, shade(palette.ceramic, -0.1)],
            [1, shade(palette.ceramic, -0.28)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.ceramicDark, -0.1), alpha: 0.85 });
      const bands = [0x5a3b1e, 0x141414, 0xb02a2a, 0xd4a72c];
      bands.forEach((color, index) => {
        g.rect(-16 + index * 9, -13, 5, 26).fill(
          linearFill([
            [0, shade(color, 0.18)],
            [0.5, color],
            [1, shade(color, -0.35)],
          ]),
        );
      });
      gloss(g, -24, -10, 44, 4);
      g.roundRect(-24, 8, 44, 3, 1.5).fill({ color: 0x000000, alpha: 0.1 });
      break;
    }
    case 'variable-resistor': {
      softShadow(g, palette);
      metalLead(g, -52, -28, palette);
      metalLead(g, 28, 52, palette);
      g.roundRect(-28, -13, 56, 26, 7)
        .fill(
          linearFill([
            [0, shade(palette.ceramic, 0.4)],
            [0.5, palette.ceramic],
            [1, shade(palette.ceramic, -0.3)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.ceramicDark, -0.1), alpha: 0.85 });
      [0x5a3b1e, 0x141414, 0xb02a2a].forEach((color, index) => {
        g.rect(-16 + index * 12, -13, 5, 26).fill(color);
      });
      g.circle(0, -19, 10).fill(
        linearFill([
          [0, shade(palette.metal, 0.5)],
          [0.5, palette.metal],
          [1, shade(palette.metalDark, -0.2)],
        ]),
      );
      g.circle(0, -19, 6).fill(
        radialFill([
          [0, shade(palette.metalDark, 0.15)],
          [1, shade(palette.metalDark, -0.55)],
        ]),
      );
      g.circle(-2.4, -21, 1.8).fill({ color: 0xffffff, alpha: 0.5 });
      gloss(g, -24, -10, 44, 4);
      break;
    }
    case 'lamp': {
      drawLampGlow(g, palette, intensity);
      softShadow(g, palette, 58, 14);
      metalLead(g, -52, -14, palette);
      metalLead(g, 14, 52, palette);
      // screw base
      g.roundRect(-10, 15, 20, 14, 3).fill(
        linearFill([
          [0, shade(palette.metalDark, 0.25)],
          [0.5, palette.metal],
          [1, shade(palette.metalDark, -0.35)],
        ]),
      );
      for (let i = 0; i < 3; i += 1) {
        g.rect(-10, 17 + i * 4, 20, 1.1).fill({ color: 0x000000, alpha: 0.25 });
      }
      g.roundRect(-7.5, 8, 15, 9, 2).fill({
        color: shade(palette.metal, 0.1),
      });
      // glass
      g.circle(0, -2, 21.5)
        .fill(
          radialFill([
            [0, shade(palette.glass, 0.55)],
            [0.55, palette.glass],
            [1, shade(palette.glass, -0.15)],
          ]),
        )
        .stroke({ width: 1.5, color: shade(palette.glass, 0.2), alpha: 0.55 });
      g.circle(0, -2, 21.5).fill({ color: palette.glass, alpha: 0.12 });
      // filament
      g.poly([-6, 12, -3, 0, 0, 8, 3, -2, 6, 8]).fill({
        color: palette.glow,
        alpha: 0.18 + intensity * 0.25,
      });
      line(g, [[-6, 12], [-3, 0], [0, 8], [3, -2], [6, 8]], palette.glow, 1.7, 0.7 + intensity * 0.3);
      circle(g, 0, 0, 5 + intensity * 6, palette.glow, 0.14 + intensity * 0.3);
      // specular highlights
      g.circle(-8, -13, 5.5).fill({ color: 0xffffff, alpha: 0.22 });
      g.circle(-10, -15, 2.2).fill({ color: 0xffffff, alpha: 0.5 });
      break;
    }
    case 'cell': {
      softShadow(g, palette);
      metalLead(g, -52, -38, palette);
      metalLead(g, 38, 52, palette);
      g.roundRect(-38, -22, 76, 44, 8)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.35)],
            [0.16, palette.bodyLight],
            [0.6, palette.body],
            [1, shade(palette.body, -0.45)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.body, -0.6), alpha: 0.9 });
      // sleeve
      g.roundRect(-27, -16, 54, 32, 4)
        .fill(
          linearFill([
            [0, shade(palette.accent, 0.1)],
            [0.35, palette.accent],
            [1, shade(palette.accent, -0.55)],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.accent, -0.6), alpha: 0.8 });
      g.rect(-27, -2, 54, 1.2).fill({ color: 0xffffff, alpha: 0.24 });
      // positive cap
      g.roundRect(30, -9, 9, 18, 3).fill(
        linearFill([
          [0, shade(palette.copper, 0.4)],
          [0.5, palette.copper],
          [1, shade(palette.copper, -0.45)],
        ]),
      );
      g.roundRect(35, -14, 5, 8, 2).fill({ color: shade(palette.metal, 0.2) });
      // highlight
      g.roundRect(-34, -19, 24, 4, 2).fill({ color: 0xffffff, alpha: 0.18 });
      g.roundRect(-34, 16, 68, 3, 1.5).fill({ color: 0x000000, alpha: 0.12 });
      if ((comp.params.internalResistance ?? 0) > 0) {
        g.roundRect(39, -6, 12, 12, 3)
          .fill(
            linearFill([
              [0, shade(palette.ceramic, 0.4)],
              [1, shade(palette.ceramic, -0.25)],
            ]),
          )
          .stroke({ width: 1, color: palette.ceramicDark });
        g.rect(43, -6, 3.4, 12).fill({ color: 0x7a3b1e, alpha: 0.95 });
        g.rect(47, -6, 2.6, 12).fill({ color: 0x141414, alpha: 0.95 });
      }
      break;
    }
    case 'battery': {
      softShadow(g, palette, 86, 20);
      metalLead(g, -52, -42, palette);
      metalLead(g, 42, 52, palette);
      g.roundRect(-42, -24, 84, 48, 9)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.4)],
            [0.18, palette.bodyLight],
            [0.62, palette.body],
            [1, shade(palette.body, -0.5)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.body, -0.6), alpha: 0.9 });
      g.roundRect(-32, -17, 64, 34, 5)
        .fill(
          linearFill([
            [0, shade(palette.body, 0.28)],
            [0.5, palette.body],
            [1, shade(palette.body, -0.35)],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.body, -0.55), alpha: 0.8 });
      // two cell segments
      g.rect(-2, -17, 1.4, 34).fill({ color: 0xffffff, alpha: 0.12 });
      g.roundRect(-34, -21, 30, 3, 1.5).fill({ color: 0xffffff, alpha: 0.16 });
      g.roundRect(32, -9, 9, 18, 3).fill(
        linearFill([
          [0, shade(palette.copper, 0.45)],
          [0.5, palette.copper],
          [1, shade(palette.copper, -0.5)],
        ]),
      );
      g.roundRect(37, -14, 5, 8, 2).fill({ color: shade(palette.metal, 0.25) });
      break;
    }
    case 'switch': {
      softShadow(g, palette, 72, 16);
      metalLead(g, -52, -24, palette);
      metalLead(g, 24, 52, palette);
      g.roundRect(-36, 7, 72, 13, 4)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.25)],
            [1, shade(palette.body, -0.35)],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.body, -0.55), alpha: 0.8 });
      g.circle(-24, 0, 6.5).fill(
        radialFill([
          [0, shade(palette.metal, 0.35)],
          [1, shade(palette.metalDark, -0.35)],
        ]),
      );
      g.circle(24, 0, 6.5).fill(
        radialFill([
          [0, shade(palette.metal, 0.35)],
          [1, shade(palette.metalDark, -0.35)],
        ]),
      );
      const closed = comp.params.closed !== false;
      if (closed) {
        g.roundRect(-24, -4.5, 48, 7, 3.5).fill(
          linearFill([
            [0, shade(palette.metal, 0.55)],
            [0.45, palette.metal],
            [1, shade(palette.metal, -0.25)],
          ]),
        );
      } else {
        g.moveTo(-25, -2).lineTo(17, -23).stroke({ width: 6, color: shade(palette.metal, -0.15), cap: 'round' });
        g.moveTo(-25, -3).lineTo(17, -24).stroke({ width: 2.4, color: shade(palette.metal, 0.5), cap: 'round' });
      }
      g.circle(-24, 0, 2.2).fill({ color: palette.accent, alpha: 0.9 });
      break;
    }
    case 'ammeter':
    case 'voltmeter': {
      softShadow(g, palette, 80, 16);
      metalLead(g, -52, -34, palette);
      metalLead(g, 34, 52, palette);
      bezel(g, palette, -34, -28, 68, 56, 10);
      g.roundRect(-27, -10, 54, 25, 4)
        .fill(
          linearFill([
            [0, shade(palette.displayBg, 0.16)],
            [0.6, palette.displayBg],
            [1, shade(palette.displayBg, -0.25)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.body, -0.6), alpha: 0.9 });
      g.roundRect(-27, -10, 54, 12, 4).fill({ color: 0xffffff, alpha: 0.05 });
      g.roundRect(-30, -25, 60, 3, 1.5).fill({ color: 0xffffff, alpha: 0.2 });
      g.roundRect(-31, 18, 62, 2.5, 1.25).fill({ color: 0x000000, alpha: 0.18 });
      break;
    }
    case 'ldr': {
      softShadow(g, palette, 64, 16);
      metalLead(g, -52, -22, palette);
      metalLead(g, 22, 52, palette);
      g.circle(0, -2, 24.5)
        .fill(
          radialFill([
            [0, shade(palette.ceramic, 0.45)],
            [0.55, palette.ceramic],
            [1, shade(palette.ceramic, -0.3)],
          ]),
        )
        .stroke({ width: 1.6, color: shade(palette.ceramicDark, -0.1), alpha: 0.9 });
      g.circle(0, -2, 19).fill({ color: shade(palette.ceramicDark, -0.15), alpha: 0.35 });
      // serpentine track
      line(g, [[-12, -12], [12, -12], [-12, 8], [12, 8]], shade(palette.ceramicDark, -0.2), 2.6);
      line(g, [[-12, -12], [12, -12], [-12, 8], [12, 8]], 0xffffff, 0.8, 0.18);
      // light arrows
      line(g, [[-36, 24], [-14, 10]], palette.highlight, 2);
      arrowHead(g, [-14, 10], [-36, 24], palette.highlight, 5);
      line(g, [[-28, 34], [-6, 20]], palette.highlight, 2);
      arrowHead(g, [-6, 20], [-28, 34], palette.highlight, 5);
      g.ellipse(-8, -14, 7, 4.5).fill({ color: 0xffffff, alpha: 0.25 });
      break;
    }
    case 'thermistor': {
      softShadow(g, palette, 52, 14);
      metalLead(g, -52, -18, palette);
      metalLead(g, 18, 52, palette);
      g.circle(0, -2, 20)
        .fill(
          radialFill([
            [0, shade(palette.bodyLight, 0.4)],
            [0.55, palette.bodyLight],
            [1, shade(palette.body, -0.35)],
          ]),
        )
        .stroke({ width: 1.4, color: shade(palette.body, -0.55), alpha: 0.9 });
      g.circle(0, -2, 13).fill({ color: palette.danger, alpha: 0.22 });
      g.circle(0, -2, 13).stroke({ width: 1, color: palette.danger, alpha: 0.35 });
      line(g, [[-9, 6], [9, -10]], shade(palette.body, -0.55), 1.8);
      g.ellipse(-6, -10, 5, 3.4).fill({ color: 0xffffff, alpha: 0.28 });
      break;
    }
    case 'capacitor': {
      softShadow(g, palette, 58, 14);
      metalLead(g, -52, -18, palette);
      metalLead(g, 18, 52, palette);
      g.roundRect(-22, -30, 44, 60, 12)
        .fill(
          linearFill([
            [0, shade(palette.metal, 0.45)],
            [0.18, palette.metal],
            [0.5, shade(palette.metalDark, 0.05)],
            [0.82, shade(palette.metalDark, -0.25)],
            [1, shade(palette.metal, 0.1)],
          ], false),
        )
        .stroke({ width: 1, color: shade(palette.metalDark, -0.4), alpha: 0.9 });
      g.rect(-14, -28, 28, 56).fill(
        linearFill([
          [0, shade(palette.accent, 0.2)],
          [0.5, palette.accent],
          [1, shade(palette.accent, -0.5)],
        ]),
      );
      g.rect(-14, -4, 28, 1.2).fill({ color: 0xffffff, alpha: 0.35 });
      g.ellipse(0, -30, 22, 5.5)
        .fill(
          linearFill([
            [0, shade(palette.metal, 0.6)],
            [1, palette.metal],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.metalDark, -0.2), alpha: 0.8 });
      g.rect(4, -30, 3, 60).fill({ color: 0xffffff, alpha: 0.14 });
      break;
    }
    case 'diode': {
      softShadow(g, palette, 64, 14);
      metalLead(g, -52, -24, palette);
      metalLead(g, 24, 52, palette);
      g.roundRect(-24, -13, 48, 26, 6)
        .fill(
          linearFill([
            [0, shade(0x2a2f38, 0.35)],
            [0.5, 0x1a1d23],
            [1, 0x07080a],
          ]),
        )
        .stroke({ width: 1, color: 0x000000, alpha: 0.9 });
      g.rect(13, -13, 7, 26)
        .fill(
          linearFill([
            [0, shade(palette.metal, 0.5)],
            [0.5, palette.metal],
            [1, shade(palette.metalDark, -0.2)],
          ], false),
        );
      g.poly([-12, -7, -12, 7, 2, 0]).fill({ color: palette.metal, alpha: 0.55 });
      gloss(g, -20, -10, 34, 3);
      break;
    }
    default:
      break;
  }
  terminalPins(g, comp, palette);
}
