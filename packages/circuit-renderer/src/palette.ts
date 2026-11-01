import type { ThemeMode } from '@circuitlab/circuit-core';

export interface Palette {
  background: number;
  grid: number;
  gridStrong: number;
  wire: number;
  wireGlow: number;
  metal: number;
  metalDark: number;
  label: number;
  muted: number;
  accent: number;
  accentSoft: number;
  body: number;
  bodyLight: number;
  ceramic: number;
  ceramicDark: number;
  glass: number;
  glow: number;
  danger: number;
  displayBg: number;
  displayText: number;
  shadow: number;
  copper: number;
  terminal: number;
  terminalHover: number;
  select: number;
  highlight: number;
  panel: number;
}

const DARK: Palette = {
  background: 0x050b16,
  grid: 0x0e2236,
  gridStrong: 0x143349,
  wire: 0x39d8f5,
  wireGlow: 0x0e7f96,
  metal: 0xc9d9e6,
  metalDark: 0x6d8296,
  label: 0xd8ecff,
  muted: 0x7f9bb5,
  accent: 0x38e8ff,
  accentSoft: 0x1a94ad,
  body: 0x0f2035,
  bodyLight: 0x18344f,
  ceramic: 0xd9c9a3,
  ceramicDark: 0x9a8a68,
  glass: 0xbfefff,
  glow: 0xffd479,
  danger: 0xff6b6b,
  displayBg: 0x03121b,
  displayText: 0x64ffd2,
  shadow: 0x000000,
  copper: 0xd08a4a,
  terminal: 0x8fb4cc,
  terminalHover: 0x38e8ff,
  select: 0x38e8ff,
  highlight: 0xffb454,
  panel: 0x0b1a2a,
};

const LIGHT: Palette = {
  background: 0xf4f9ff,
  grid: 0xd7e6f3,
  gridStrong: 0xbdd4e6,
  wire: 0x0b7c9c,
  wireGlow: 0x89d7e8,
  metal: 0x7d8fa1,
  metalDark: 0x4e5f70,
  label: 0x10283f,
  muted: 0x5a7386,
  accent: 0x0284c7,
  accentSoft: 0x71c6e8,
  body: 0xe7f1fa,
  bodyLight: 0xffffff,
  ceramic: 0xf3e6c8,
  ceramicDark: 0xb9a67f,
  glass: 0xd9f4ff,
  glow: 0xffb020,
  danger: 0xd93b3b,
  displayBg: 0xeaf6ff,
  displayText: 0x0369a1,
  shadow: 0x33566f,
  copper: 0xa9642a,
  terminal: 0x527086,
  terminalHover: 0x0284c7,
  select: 0x0284c7,
  highlight: 0xd97706,
  panel: 0xffffff,
};

export function paletteFor(theme: ThemeMode): Palette {
  return theme === 'light' ? LIGHT : DARK;
}
