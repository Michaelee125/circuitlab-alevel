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
    // A small plated post reads as a real terminal in both visual modes.
    g.circle(t.x, t.y, 4.6).fill({ color: shade(palette.metalDark, -0.35), alpha: 0.85 });
    g.circle(t.x, t.y, 3.8).fill({
      color: palette.metalDark,
      alpha: 0.9,
    });
    g.circle(t.x - 1, t.y - 1.2, 1.5).fill({ color: 0xffffff, alpha: 0.55 });
    g.circle(t.x, t.y, 1.15).fill({ color: palette.background, alpha: 0.75 });
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
// Realistic mode — layered gradients, metals, glass and specular detail
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

function linearFill(stops: [number, number][], vertical = true): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: vertical ? { x: 0, y: 1 } : { x: 1, y: 0 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}

function radialFill(stops: [number, number][], cx = 0.38, cy = 0.28): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: cx, y: cy },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.66,
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
}

function softShadow(g: Graphics, palette: Palette, width = 78, height = 18): void {
  g.ellipse(0, 27, width / 2 + 7, height / 2 + 6).fill({ color: palette.shadow, alpha: 0.1 });
  g.ellipse(0, 25.5, width / 2, height / 2).fill({ color: palette.shadow, alpha: 0.22 });
}

function metalLead(g: Graphics, fromX: number, toX: number, palette: Palette): void {
  const x = Math.min(fromX, toX);
  const width = Math.abs(toX - fromX);
  if (width <= 0) return;
  g.roundRect(x, -2.6, width, 5.2, 2.6).fill(
    linearFill([
      [0, shade(palette.metalDark, -0.2)],
      [0.22, palette.metal],
      [0.38, shade(palette.metal, 0.65)],
      [0.6, palette.metal],
      [1, shade(palette.metalDark, -0.3)],
    ]),
  );
  g.moveTo(x + 1, -2.1).lineTo(x + width - 1, -2.1).stroke({ width: 0.7, color: 0xffffff, alpha: 0.55 });
}

function screwPost(g: Graphics, x: number, y: number, palette: Palette, radius = 4.4): void {
  g.circle(x, y, radius + 0.8).fill({ color: shade(palette.metalDark, -0.35), alpha: 0.9 });
  g.circle(x, y, radius).fill(
    radialFill(
      [
        [0, shade(palette.metal, 0.55)],
        [0.55, palette.metal],
        [1, shade(palette.metal, -0.35)],
      ],
      0.35,
      0.3,
    ),
  );
  g.circle(x - radius * 0.3, y - radius * 0.35, radius * 0.32).fill({ color: 0xffffff, alpha: 0.65 });
  g.moveTo(x - radius * 0.55, y + radius * 0.1)
    .lineTo(x + radius * 0.55, y + radius * 0.1)
    .stroke({ width: 0.8, color: shade(palette.metalDark, -0.5), alpha: 0.55 });
}

function rimHighlight(g: Graphics, x: number, y: number, w: number, h: number, r: number): void {
  g.roundRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, r)
    .stroke({ width: 0.8, color: 0xffffff, alpha: 0.22 });
  g.moveTo(x + r * 0.6, y + 1.4).lineTo(x + w - r * 0.6, y + 1.4).stroke({ width: 1, color: 0xffffff, alpha: 0.3 });
}

function glossStreak(g: Graphics, x: number, y: number, w: number, h = 3): void {
  g.roundRect(x, y, w, h, h / 2).fill({ color: 0xffffff, alpha: 0.2 });
}

function drawLampGlow(g: Graphics, palette: Palette, intensity: number): void {
  if (intensity <= 0.01) return;
  const alpha = Math.min(0.58, 0.1 + intensity * 0.5);
  for (let i = 4; i >= 1; i -= 1) {
    circle(g, 0, 0, 18 + i * 7, palette.glow, (alpha * 0.15) / i);
  }
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
      metalLead(g, -52, -31, palette);
      metalLead(g, 31, 52, palette);
      // metal end caps
      [-31, 25].forEach((x) => {
        g.roundRect(x, -12.5, 6, 25, 2).fill(
          linearFill([
            [0, shade(palette.metal, 0.2)],
            [0.45, palette.metal],
            [1, shade(palette.metalDark, -0.1)],
          ]),
        );
      });
      // ceramic body
      g.roundRect(-26, -13, 52, 26, 8)
        .fill(
          linearFill([
            [0, shade(palette.ceramic, 0.5)],
            [0.18, shade(palette.ceramic, 0.2)],
            [0.62, palette.ceramic],
            [0.9, shade(palette.ceramic, -0.16)],
            [1, shade(palette.ceramic, -0.32)],
          ]),
        )
        .stroke({ width: 0.9, color: shade(palette.ceramicDark, -0.15), alpha: 0.9 });
      // colour bands with bevelled edges
      const bands = [0x4a2f16, 0x141414, 0xb02a2a, 0xd4a72c];
      bands.forEach((color, index) => {
        const x = -17 + index * 9;
        g.rect(x, -13, 5.2, 26).fill(
          linearFill([
            [0, shade(color, 0.25)],
            [0.45, color],
            [1, shade(color, -0.35)],
          ]),
        );
        g.rect(x, -13, 1, 26).fill({ color: 0xffffff, alpha: 0.16 });
        g.rect(x + 4.2, -13, 1, 26).fill({ color: 0x000000, alpha: 0.18 });
      });
      glossStreak(g, -22, -10, 42, 3.4);
      g.roundRect(-22, 8.6, 42, 2.6, 1.3).fill({ color: 0x000000, alpha: 0.1 });
      rimHighlight(g, -26, -13, 52, 26, 8);
      break;
    }
    case 'variable-resistor': {
      softShadow(g, palette);
      metalLead(g, -52, -31, palette);
      metalLead(g, 31, 52, palette);
      g.roundRect(-26, -13, 52, 26, 8)
        .fill(
          linearFill([
            [0, shade(palette.ceramic, 0.5)],
            [0.5, palette.ceramic],
            [1, shade(palette.ceramic, -0.3)],
          ]),
        )
        .stroke({ width: 0.9, color: shade(palette.ceramicDark, -0.15), alpha: 0.9 });
      [0x4a2f16, 0x141414, 0xb02a2a].forEach((color, index) => {
        g.rect(-16 + index * 12, -13, 5, 26).fill(color);
      });
      // wiper assembly
      g.roundRect(-7, -26, 14, 14, 4).fill(
        linearFill([
          [0, shade(palette.metal, 0.4)],
          [1, shade(palette.metalDark, -0.2)],
        ]),
      );
      g.circle(0, -25, 9).fill(
        radialFill(
          [
            [0, shade(palette.metal, 0.7)],
            [0.6, palette.metal],
            [1, shade(palette.metal, -0.45)],
          ],
          0.35,
          0.28,
        ),
      );
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        g.moveTo(Math.cos(angle) * 7.2, -25 + Math.sin(angle) * 7.2)
          .lineTo(Math.cos(angle) * 8.8, -25 + Math.sin(angle) * 8.8)
          .stroke({ width: 0.8, color: shade(palette.metalDark, -0.3), alpha: 0.7 });
      }
      g.circle(-2.4, -27, 1.8).fill({ color: 0xffffff, alpha: 0.6 });
      glossStreak(g, -22, -10, 42, 3.2);
      rimHighlight(g, -26, -13, 52, 26, 8);
      break;
    }
    case 'lamp': {
      drawLampGlow(g, palette, intensity);
      softShadow(g, palette, 56, 14);
      metalLead(g, -52, -16, palette);
      metalLead(g, 16, 52, palette);
      // screw base
      g.roundRect(-11, 14, 22, 18, 4).fill(
        linearFill(
          [
            [0, shade(palette.metalDark, 0.1)],
            [0.3, palette.metal],
            [0.55, shade(palette.metal, 0.45)],
            [1, shade(palette.metalDark, -0.3)],
          ],
          false,
        ),
      );
      for (let i = 0; i < 3; i += 1) {
        g.moveTo(-11, 17 + i * 4.6).lineTo(11, 19 + i * 4.6).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
      }
      g.ellipse(0, 32, 10, 3).fill({ color: shade(palette.metalDark, -0.2) });
      g.ellipse(0, 31, 7, 2).fill({ color: shade(palette.metal, 0.1) });
      // neck
      g.poly([-9, 6, 9, 6, 7, 15, -7, 15]).fill(
        linearFill([
          [0, shade(palette.glass, 0.2)],
          [1, shade(palette.glass, -0.3)],
        ]),
      );
      // glass envelope
      g.circle(0, -3, 22)
        .fill(
          radialFill(
            [
              [0, shade(palette.glass, 0.5)],
              [0.38, shade(palette.glass, 0.16)],
              [0.75, palette.glass],
              [1, shade(palette.glass, -0.28)],
            ],
            0.36,
            0.26,
          ),
        )
        .stroke({ width: 1.3, color: shade(palette.glass, 0.15), alpha: 0.6 });
      g.circle(0, -3, 22).fill({ color: palette.glass, alpha: 0.1 });
      // inner glass rim
      g.circle(0, -3, 18.5).stroke({ width: 0.8, color: 0xffffff, alpha: 0.2 });
      // filament supports
      g.moveTo(-4, 13).lineTo(-3, 1).stroke({ width: 0.9, color: shade(palette.metalDark, 0.1), alpha: 0.8 });
      g.moveTo(4, 13).lineTo(3, 1).stroke({ width: 0.9, color: shade(palette.metalDark, 0.1), alpha: 0.8 });
      // filament
      line(g, [[-3, 1], [-1.5, -7], [0.5, 1], [2.5, -7], [4, 1]], palette.glow, 1.9, 0.8);
      g.poly([-3, 1, -1.5, -7, 0.5, 1, 2.5, -7, 4, 1]).stroke({
        width: 4.5,
        color: palette.glow,
        alpha: 0.14 + intensity * 0.22,
        cap: 'round',
        join: 'round',
      });
      circle(g, 0, -3, 6 + intensity * 7, palette.glow, 0.1 + intensity * 0.25);
      // specular
      g.moveTo(-14, -9).quadraticCurveTo(-6, -18, 2, -19).stroke({ width: 2.4, color: 0xffffff, alpha: 0.4, cap: 'round' });
      g.circle(-11, -12, 1.7).fill({ color: 0xffffff, alpha: 0.7 });
      break;
    }
    case 'cell': {
      softShadow(g, palette);
      metalLead(g, -52, -38, palette);
      metalLead(g, 38, 52, palette);
      g.roundRect(-38, -22, 76, 44, 10)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.45)],
            [0.14, palette.bodyLight],
            [0.42, mixColor(palette.bodyLight, palette.body, 0.5)],
            [0.72, palette.body],
            [1, shade(palette.body, -0.5)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.body, -0.6), alpha: 0.9 });
      // wrapper
      g.roundRect(-27, -16, 54, 32, 5)
        .fill(
          linearFill([
            [0, shade(palette.accent, 0.28)],
            [0.3, palette.accent],
            [0.62, shade(palette.accent, -0.2)],
            [1, shade(palette.accent, -0.55)],
          ]),
        )
        .stroke({ width: 0.7, color: shade(palette.accent, -0.6), alpha: 0.8 });
      g.rect(-27, -9, 54, 2).fill({ color: 0xffffff, alpha: 0.25 });
      g.rect(-27, 7, 54, 1.2).fill({ color: 0x000000, alpha: 0.18 });
      // plus sign
      g.moveTo(18, 0).lineTo(26, 0).stroke({ width: 2, color: 0xffffff, alpha: 0.75 });
      g.moveTo(22, -4).lineTo(22, 4).stroke({ width: 2, color: 0xffffff, alpha: 0.75 });
      // copper cap
      g.roundRect(30, -10, 9, 20, 3).fill(
        linearFill([
          [0, shade(palette.copper, 0.55)],
          [0.5, palette.copper],
          [1, shade(palette.copper, -0.5)],
        ]),
      );
      g.roundRect(35, -15, 5, 9, 2).fill({ color: shade(palette.metal, 0.25) });
      glossStreak(g, -33, -19, 22, 3.4);
      g.roundRect(-34, 16, 66, 2.6, 1.3).fill({ color: 0x000000, alpha: 0.14 });
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
        g.rect(47.4, -6, 2.6, 12).fill({ color: 0x141414, alpha: 0.95 });
        g.moveTo(39, -5.4).lineTo(51, -5.4).stroke({ width: 0.7, color: 0xffffff, alpha: 0.35 });
      }
      break;
    }
    case 'battery': {
      softShadow(g, palette, 86, 20);
      metalLead(g, -52, -42, palette);
      metalLead(g, 42, 52, palette);
      g.roundRect(-42, -24, 84, 48, 11)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.5)],
            [0.14, palette.bodyLight],
            [0.42, mixColor(palette.bodyLight, palette.body, 0.55)],
            [0.75, palette.body],
            [1, shade(palette.body, -0.52)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.body, -0.6), alpha: 0.9 });
      g.roundRect(-33, -18, 66, 36, 6)
        .fill(
          linearFill([
            [0, shade(palette.accent, 0.35)],
            [0.25, palette.accent],
            [0.6, shade(palette.accent, -0.22)],
            [1, shade(palette.accent, -0.58)],
          ]),
        )
        .stroke({ width: 0.7, color: shade(palette.accent, -0.6), alpha: 0.8 });
      g.rect(-33, -10, 66, 2).fill({ color: 0xffffff, alpha: 0.22 });
      g.rect(-1, -18, 1.4, 36).fill({ color: 0x000000, alpha: 0.22 });
      g.rect(6, -18, 1, 36).fill({ color: 0xffffff, alpha: 0.14 });
      g.moveTo(18, 0).lineTo(27, 0).stroke({ width: 2.2, color: 0xffffff, alpha: 0.8 });
      g.moveTo(22.5, -4.6).lineTo(22.5, 4.6).stroke({ width: 2.2, color: 0xffffff, alpha: 0.8 });
      g.roundRect(34, -11, 9, 22, 3).fill(
        linearFill([
          [0, shade(palette.copper, 0.55)],
          [0.5, palette.copper],
          [1, shade(palette.copper, -0.5)],
        ]),
      );
      g.roundRect(39, -16, 5, 10, 2).fill({ color: shade(palette.metal, 0.25) });
      glossStreak(g, -37, -21, 26, 3.4);
      g.roundRect(-38, 18, 74, 2.6, 1.3).fill({ color: 0x000000, alpha: 0.14 });
      break;
    }
    case 'switch': {
      softShadow(g, palette, 72, 16);
      metalLead(g, -52, -25, palette);
      metalLead(g, 25, 52, palette);
      // base plate
      g.roundRect(-36, 6, 72, 15, 5)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.35)],
            [0.5, shade(palette.body, 0.15)],
            [1, shade(palette.body, -0.4)],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.body, -0.55), alpha: 0.85 });
      for (let i = 0; i < 6; i += 1) {
        g.moveTo(-33, 8.5 + i * 2).lineTo(33, 8.5 + i * 2).stroke({ width: 0.6, color: 0xffffff, alpha: 0.05 });
      }
      // posts
      [-24, 24].forEach((x) => {
        g.circle(x, 0, 7).fill(
          radialFill(
            [
              [0, shade(palette.metal, 0.55)],
              [0.6, palette.metal],
              [1, shade(palette.metalDark, -0.3)],
            ],
            0.35,
            0.3,
          ),
        );
        g.circle(x, 0, 2.6).fill({ color: shade(palette.metalDark, -0.2) });
      });
      const closed = comp.params.closed !== false;
      if (closed) {
        g.roundRect(-24, -4.6, 48, 7.2, 3.6).fill(
          linearFill([
            [0, shade(palette.metal, 0.65)],
            [0.4, palette.metal],
            [1, shade(palette.metal, -0.3)],
          ]),
        );
        g.roundRect(-22, -3.6, 44, 2, 1).fill({ color: 0xffffff, alpha: 0.4 });
        g.circle(24, -1, 4.4).fill(
          radialFill([
            [0, shade(palette.metal, 0.7)],
            [1, shade(palette.metal, -0.4)],
          ]),
        );
      } else {
        g.moveTo(-24, -2).lineTo(16, -24).stroke({ width: 7, color: shade(palette.metal, -0.2), cap: 'round' });
        g.moveTo(-24, -3.2).lineTo(16, -25.2).stroke({ width: 2.6, color: shade(palette.metal, 0.55), cap: 'round' });
        g.circle(16, -25, 4.4).fill(
          radialFill([
            [0, 0xffffff],
            [1, shade(palette.metal, -0.25)],
          ]),
        );
      }
      break;
    }
    case 'ammeter':
    case 'voltmeter': {
      softShadow(g, palette, 80, 16);
      metalLead(g, -52, -35, palette);
      metalLead(g, 35, 52, palette);
      // case
      g.roundRect(-34, -28, 68, 56, 12)
        .fill(
          linearFill([
            [0, shade(palette.bodyLight, 0.45)],
            [0.16, palette.bodyLight],
            [0.55, palette.body],
            [1, shade(palette.body, -0.45)],
          ]),
        )
        .stroke({ width: 1, color: shade(palette.body, -0.65), alpha: 0.9 });
      rimHighlight(g, -34, -28, 68, 56, 12);
      // recessed bezel
      g.roundRect(-28, -12, 56, 28, 6).fill({ color: shade(palette.body, -0.55) });
      // screen
      g.roundRect(-26, -10, 52, 24, 4)
        .fill(
          linearFill([
            [0, shade(palette.displayBg, 0.28)],
            [0.5, palette.displayBg],
            [1, shade(palette.displayBg, -0.3)],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.body, -0.7), alpha: 0.9 });
      g.roundRect(-26, -10, 52, 11, 4).fill({ color: 0xffffff, alpha: 0.05 });
      // scanlines
      for (let i = 0; i < 4; i += 1) {
        g.moveTo(-24, -6 + i * 5).lineTo(24, -6 + i * 5).stroke({ width: 0.5, color: palette.displayText, alpha: 0.05 });
      }
      // glass reflection
      g.poly([-24, -9, -8, -9, -18, 12, -24, 12]).fill({ color: 0xffffff, alpha: 0.045 });
      // screws
      screwPost(g, -27, 23, palette, 2.6);
      screwPost(g, 27, 23, palette, 2.6);
      // status LED
      g.circle(27, -22, 2).fill({ color: palette.good, alpha: 0.9 });
      g.circle(27, -22, 3.6).fill({ color: palette.good, alpha: 0.16 });
      break;
    }
    case 'ldr': {
      softShadow(g, palette, 64, 16);
      metalLead(g, -52, -23, palette);
      metalLead(g, 23, 52, palette);
      g.circle(0, -2, 25)
        .fill(
          radialFill(
            [
              [0, shade(palette.ceramic, 0.55)],
              [0.5, palette.ceramic],
              [1, shade(palette.ceramic, -0.32)],
            ],
            0.35,
            0.25,
          ),
        )
        .stroke({ width: 1.4, color: shade(palette.ceramicDark, -0.15), alpha: 0.9 });
      g.circle(0, -2, 25).stroke({ width: 0.8, color: 0xffffff, alpha: 0.2 });
      g.circle(0, -2, 19.5).fill({ color: shade(palette.ceramicDark, -0.28), alpha: 0.45 });
      g.circle(0, -2, 19.5).stroke({ width: 0.8, color: 0x000000, alpha: 0.15 });
      // gold serpentine
      const gold = palette.highlight;
      line(g, [[-12, -13], [12, -13], [-12, 9], [12, 9]], shade(gold, -0.15), 2.8);
      line(g, [[-12, -14], [12, -14], [-12, 8], [12, 8]], shade(gold, 0.25), 0.8, 0.7);
      g.circle(-12, -13, 1.4).fill({ color: shade(gold, 0.4) });
      g.circle(12, 9, 1.4).fill({ color: shade(gold, 0.4) });
      // light arrows
      line(g, [[-38, 23], [-16, 9]], palette.highlight, 2.2);
      arrowHead(g, [-16, 9], [-38, 23], palette.highlight, 5.5);
      line(g, [[-30, 33], [-8, 19]], palette.highlight, 2.2);
      arrowHead(g, [-8, 19], [-30, 33], palette.highlight, 5.5);
      // glass highlight
      g.ellipse(-8, -15, 7.5, 4.5).fill({ color: 0xffffff, alpha: 0.3 });
      g.circle(-11, -17, 1.6).fill({ color: 0xffffff, alpha: 0.6 });
      break;
    }
    case 'thermistor': {
      softShadow(g, palette, 52, 14);
      metalLead(g, -52, -17, palette);
      metalLead(g, 17, 52, palette);
      g.circle(0, -2, 17.5)
        .fill(
          radialFill(
            [
              [0, shade(palette.bodyLight, 0.55)],
              [0.45, shade(palette.bodyLight, 0.1)],
              [1, shade(palette.body, -0.4)],
            ],
            0.35,
            0.28,
          ),
        )
        .stroke({ width: 1.2, color: shade(palette.body, -0.55), alpha: 0.9 });
      g.circle(0, -2, 12.5).fill(
        radialFill(
          [
            [0, shade(palette.danger, 0.25)],
            [0.7, palette.danger],
            [1, shade(palette.danger, -0.5)],
          ],
          0.4,
          0.3,
        ),
      );
      g.circle(0, -2, 12.5).fill({ color: palette.danger, alpha: 0.25 });
      g.circle(0, -2, 12.5).stroke({ width: 0.8, color: shade(palette.danger, -0.2), alpha: 0.6 });
      line(g, [[-8, 7], [8, -9]], shade(palette.danger, -0.45), 1.6);
      g.ellipse(-6, -10, 4.5, 3).fill({ color: 0xffffff, alpha: 0.4 });
      break;
    }
    case 'capacitor': {
      softShadow(g, palette, 58, 14);
      metalLead(g, -52, -17, palette);
      metalLead(g, 17, 52, palette);
      // can
      g.roundRect(-22, -30, 44, 60, 11)
        .fill(
          linearFill(
            [
              [0, shade(palette.metal, 0.55)],
              [0.14, shade(palette.metal, 0.25)],
              [0.42, palette.metalDark],
              [0.66, shade(palette.metal, 0.2)],
              [1, shade(palette.metalDark, -0.35)],
            ],
            false,
          ),
        )
        .stroke({ width: 1, color: shade(palette.metalDark, -0.45), alpha: 0.9 });
      // sleeve
      g.roundRect(-22, -18, 44, 36, 4)
        .fill(
          linearFill(
            [
              [0, shade(palette.accent, 0.1)],
              [0.25, palette.accent],
              [0.62, shade(palette.accent, -0.3)],
              [1, shade(palette.accent, -0.55)],
            ],
            false,
          ),
        );
      g.rect(-4, -18, 6, 36).fill({ color: 0xffffff, alpha: 0.18 });
      g.moveTo(-4, -6).lineTo(2, -6).stroke({ width: 1.6, color: 0xffffff, alpha: 0.6 });
      g.ellipse(0, -30, 22, 5.5)
        .fill(
          linearFill([
            [0, shade(palette.metal, 0.65)],
            [0.6, palette.metal],
            [1, shade(palette.metal, -0.2)],
          ]),
        )
        .stroke({ width: 0.8, color: shade(palette.metalDark, -0.2), alpha: 0.8 });
      // vent cross
      g.moveTo(-8, -30).lineTo(8, -30).stroke({ width: 1, color: shade(palette.metalDark, -0.2), alpha: 0.6 });
      g.moveTo(0, -34).lineTo(0, -26).stroke({ width: 1, color: shade(palette.metalDark, -0.2), alpha: 0.6 });
      g.rect(10, -28, 2.4, 56).fill({ color: 0xffffff, alpha: 0.12 });
      g.ellipse(0, 30, 22, 5).fill({ color: shade(palette.metalDark, -0.25), alpha: 0.8 });
      break;
    }
    case 'diode': {
      softShadow(g, palette, 64, 14);
      metalLead(g, -52, -24, palette);
      metalLead(g, 24, 52, palette);
      g.roundRect(-24, -13, 48, 26, 7)
        .fill(
          linearFill([
            [0, shade(0x3a404a, 0.55)],
            [0.18, 0x2a2f38],
            [0.6, 0x15181d],
            [1, 0x07080a],
          ]),
        )
        .stroke({ width: 1, color: 0x000000, alpha: 0.9 });
      rimHighlight(g, -24, -13, 48, 26, 7);
      // cathode band
      g.rect(13, -13, 7, 26).fill(
        linearFill([
          [0, shade(palette.metal, 0.55)],
          [0.45, palette.metal],
          [1, shade(palette.metal, -0.3)],
        ]),
      );
      g.rect(13, -13, 1, 26).fill({ color: 0xffffff, alpha: 0.3 });
      // printed symbol
      g.poly([-12, -7, -12, 7, 2, 0]).fill({ color: palette.metal, alpha: 0.5 });
      g.moveTo(4, -6).lineTo(4, 6).stroke({ width: 1.6, color: palette.metal, alpha: 0.5 });
      glossStreak(g, -20, -10, 32, 2.8);
      break;
    }
    default:
      break;
  }
  terminalPins(g, comp, palette);
}
