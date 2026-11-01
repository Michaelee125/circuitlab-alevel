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
    case 'cell':
      lead(g, -52, -9, palette, 2);
      lead(g, 9, 52, palette, 2);
      line(g, [[-9, -9], [-9, 9]], stroke, 2.4);
      line(g, [[9, -16], [9, 16]], stroke, 2.4);
      break;
    case 'battery':
      lead(g, -52, -21, palette, 2);
      lead(g, 21, 52, palette, 2);
      line(g, [[-21, -9], [-21, 9]], stroke, 2.2);
      line(g, [[-11, -16], [-11, 16]], stroke, 2.2);
      line(g, [[1, -9], [1, 9]], stroke, 2.2);
      line(g, [[11, -16], [11, 16]], stroke, 2.2);
      break;
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
// Realistic mode
// ---------------------------------------------------------------------------

function shadow(g: Graphics, palette: Palette, width = 74, height = 16): void {
  g.ellipse(0, 26, width / 2, height / 2).fill({ color: palette.shadow, alpha: 0.28 });
}

function metalLead(g: Graphics, fromX: number, toX: number, palette: Palette): void {
  g.roundRect(Math.min(fromX, toX), -2.2, Math.abs(toX - fromX), 4.4, 2).fill({ color: palette.metalDark });
  g.roundRect(Math.min(fromX, toX) + 1, -1.2, Math.abs(toX - fromX) - 2, 2.4, 1.2).fill({ color: palette.metal, alpha: 0.9 });
}

function gloss(g: Graphics, x: number, y: number, w: number, h: number, palette: Palette): void {
  g.roundRect(x, y, w, h, h / 2).fill({ color: 0xffffff, alpha: 0.16 });
}

function drawLampGlow(g: Graphics, palette: Palette, intensity: number): void {
  if (intensity <= 0.01) return;
  const alpha = Math.min(0.55, 0.12 + intensity * 0.5);
  for (let i = 4; i >= 1; i -= 1) {
    circle(g, 0, 0, 18 + i * 7, palette.glow, (alpha * 0.16) / i);
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
      shadow(g, palette);
      metalLead(g, -52, -28, palette);
      metalLead(g, 28, 52, palette);
      rect(g, -28, -13, 56, 26, 7, palette.ceramic, 1, palette.ceramicDark, 1.2);
      const bands = [0x5a3b1e, 0x111111, 0xb02a2a, 0xd4a72c];
      bands.forEach((color, index) => {
        g.rect(-16 + index * 9, -13, 5, 26).fill({ color, alpha: 0.95 });
      });
      gloss(g, -24, -10, 44, 4, palette);
      break;
    }
    case 'variable-resistor': {
      shadow(g, palette);
      metalLead(g, -52, -28, palette);
      metalLead(g, 28, 52, palette);
      rect(g, -28, -13, 56, 26, 7, palette.ceramic, 1, palette.ceramicDark, 1.2);
      g.rect(-16, -13, 5, 26).fill({ color: 0x5a3b1e });
      g.rect(-4, -13, 5, 26).fill({ color: 0x111111 });
      g.rect(8, -13, 5, 26).fill({ color: 0xb02a2a });
      circle(g, 0, -18, 9, palette.bodyLight);
      circle(g, 0, -18, 5.5, palette.metalDark);
      circle(g, 0, -18, 2, palette.accent);
      line(g, [[0, -18], [14, -6]], palette.metal, 2.4);
      gloss(g, -24, -10, 44, 4, palette);
      break;
    }
    case 'lamp': {
      drawLampGlow(g, palette, intensity);
      shadow(g, palette, 60, 12);
      metalLead(g, -52, -14, palette);
      metalLead(g, 14, 52, palette);
      rect(g, -9, 16, 18, 12, 3, palette.metalDark, 1);
      rect(g, -7, 8, 14, 10, 2, palette.metal, 1);
      g.circle(0, -2, 21).fill({ color: palette.glass, alpha: 0.26 }).stroke({ width: 1.6, color: palette.glass, alpha: 0.65 });
      line(g, [[-6, 12], [-3, 0], [0, 8], [3, -2], [6, 8]], palette.glow, 1.8, 0.75 + intensity * 0.25);
      circle(g, 0, -2, 6 + intensity * 4, palette.glow, 0.15 + intensity * 0.25);
      g.circle(-7, -12, 6).fill({ color: 0xffffff, alpha: 0.18 });
      break;
    }
    case 'cell': {
      shadow(g, palette);
      metalLead(g, -52, -38, palette);
      metalLead(g, 38, 52, palette);
      rect(g, -38, -22, 76, 44, 7, palette.bodyLight, 1, palette.metalDark, 1.2);
      rect(g, -38, -22, 76, 10, 5, palette.metal, 0.75);
      rect(g, 24, -26, 12, 8, 2, palette.copper, 1);
      rect(g, 28, -30, 5, 6, 1.5, palette.metal, 1);
      g.rect(-38, 4, 76, 2).fill({ color: palette.metalDark, alpha: 0.5 });
      break;
    }
    case 'battery': {
      shadow(g, palette, 82, 18);
      metalLead(g, -52, -42, palette);
      metalLead(g, 42, 52, palette);
      rect(g, -42, -24, 84, 48, 8, palette.body, 1, palette.metalDark, 1.4);
      rect(g, -42, -24, 84, 12, 6, palette.bodyLight, 0.75);
      rect(g, -30, -18, 60, 36, 4, palette.bodyLight, 0.55, palette.metalDark, 1);
      rect(g, 28, -30, 10, 8, 2, palette.copper, 1);
      rect(g, 31, -34, 4, 5, 1.5, palette.metal, 1);
      break;
    }
    case 'switch': {
      shadow(g, palette, 70, 14);
      metalLead(g, -52, -24, palette);
      metalLead(g, 24, 52, palette);
      rect(g, -34, 8, 68, 12, 3, palette.bodyLight, 1, palette.metalDark, 1);
      circle(g, -24, 0, 6, palette.metalDark);
      circle(g, 24, 0, 6, palette.metalDark);
      const closed = comp.params.closed !== false;
      if (closed) {
        rect(g, -24, -4, 48, 6, 3, palette.metal, 1);
      } else {
        g.roundRect(-24, -4, 48, 6, 3).fill({ color: palette.metal, alpha: 0.9 });
        g.rotation = 0;
        line(g, [[-24, -2], [18, -22]], palette.metal, 5);
        line(g, [[-24, -2], [18, -22]], palette.metalDark, 1.4, 0.4);
      }
      circle(g, -24, 0, 2.4, palette.accent);
      break;
    }
    case 'ammeter':
    case 'voltmeter': {
      shadow(g, palette, 74, 14);
      metalLead(g, -52, -34, palette);
      metalLead(g, 34, 52, palette);
      rect(g, -34, -28, 68, 56, 9, palette.body, 1, palette.metalDark, 1.6);
      rect(g, -34, -28, 68, 14, 7, palette.bodyLight, 0.8);
      rect(g, -27, -10, 54, 24, 4, palette.displayBg, 1, palette.metalDark, 1);
      gloss(g, -30, -24, 60, 3, palette);
      break;
    }
    case 'ldr': {
      shadow(g, palette, 62, 14);
      metalLead(g, -52, -22, palette);
      metalLead(g, 22, 52, palette);
      g.circle(0, -2, 24).fill({ color: palette.ceramic, alpha: 1 }).stroke({ width: 2, color: palette.ceramicDark });
      g.circle(0, -2, 19).fill({ color: palette.ceramicDark, alpha: 0.28 });
      line(g, [[-11, -12], [11, -12], [-11, 8], [11, 8]], palette.metalDark, 2.4);
      line(g, [[-36, 24], [-14, 10]], palette.highlight, 2);
      arrowHead(g, [-14, 10], [-36, 24], palette.highlight, 5);
      line(g, [[-28, 34], [-6, 20]], palette.highlight, 2);
      arrowHead(g, [-6, 20], [-28, 34], palette.highlight, 5);
      g.circle(-9, -16, 5).fill({ color: 0xffffff, alpha: 0.22 });
      break;
    }
    case 'thermistor': {
      shadow(g, palette, 52, 12);
      metalLead(g, -52, -18, palette);
      metalLead(g, 18, 52, palette);
      g.circle(0, -2, 20).fill({ color: palette.bodyLight, alpha: 1 }).stroke({ width: 2, color: palette.metalDark });
      g.circle(0, -2, 13).fill({ color: palette.danger, alpha: 0.35 });
      line(g, [[-10, 6], [10, -10]], palette.metalDark, 2);
      break;
    }
    case 'capacitor': {
      shadow(g, palette, 56, 12);
      metalLead(g, -52, -18, palette);
      metalLead(g, 18, 52, palette);
      rect(g, -22, -30, 44, 60, 12, palette.body, 1, palette.metalDark, 1.4);
      rect(g, -22, -30, 12, 60, 6, palette.bodyLight, 0.35);
      g.ellipse(0, -30, 22, 6).fill({ color: palette.metal, alpha: 0.8 });
      g.rect(6, -26, 12, 52).fill({ color: palette.accent, alpha: 0.28 });
      g.rect(6, -26, 3, 52).fill({ color: palette.accent, alpha: 0.6 });
      break;
    }
    case 'diode': {
      shadow(g, palette, 62, 12);
      metalLead(g, -52, -24, palette);
      metalLead(g, 24, 52, palette);
      rect(g, -24, -13, 48, 26, 5, 0x15181d, 1, 0x000000, 1.2);
      rect(g, 13, -13, 7, 26, 2, palette.metal, 0.9);
      g.poly([-12, -7, -12, 7, 2, 0]).fill({ color: palette.metal, alpha: 0.6 });
      gloss(g, -20, -10, 34, 3, palette);
      break;
    }
    default:
      break;
  }
  terminalPins(g, comp, palette);
}
