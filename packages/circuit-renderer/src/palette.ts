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
  chipBg: number;
  chipLine: number;
  valueV: number;
  valueI: number;
  valueR: number;
}

const DARK: Palette = {
  background: 0x000000,
  grid: 0x101014,
  gridStrong: 0x1d1d24,
  wire: 0x5ac8fa,
  wireGlow: 0x123c52,
  metal: 0xd8dde5,
  metalDark: 0x6b7280,
  label: 0xf5f5f7,
  muted: 0x8e8e93,
  accent: 0x6cc4ff,
  accentSoft: 0x2a6f9e,
  body: 0x18181c,
  bodyLight: 0x2e2e36,
  ceramic: 0xe7ddc5,
  ceramicDark: 0xa2947a,
  glass: 0xbfe9ff,
  glow: 0xffb547,
  danger: 0xff453a,
  displayBg: 0x05080b,
  displayText: 0x64ffd2,
  shadow: 0x000000,
  copper: 0xd08a4a,
  terminal: 0x9aa6b2,
  terminalHover: 0x6cc4ff,
  select: 0x0a84ff,
  highlight: 0xff9f0a,
  panel: 0x141416,
  chipBg: 0x0b0b0e,
  chipLine: 0x3a3a40,
  valueV: 0x6cc4ff,
  valueI: 0x30d158,
  valueR: 0xff9f0a,
};

const LIGHT: Palette = {
  background: 0xf2f2f7,
  grid: 0xe4e4ea,
  gridStrong: 0xd2d2da,
  wire: 0x007aff,
  wireGlow: 0x9ccbf5,
  metal: 0x8d98a5,
  metalDark: 0x4e5967,
  label: 0x1c1c1e,
  muted: 0x6b7280,
  accent: 0x007aff,
  accentSoft: 0x7ab8f0,
  body: 0xe9edf3,
  bodyLight: 0xffffff,
  ceramic: 0xf4e8cf,
  ceramicDark: 0xb5a27e,
  glass: 0xd3efff,
  glow: 0xffa726,
  danger: 0xd70015,
  displayBg: 0xeef7ff,
  displayText: 0x0479a8,
  shadow: 0x274766,
  copper: 0xa9642a,
  terminal: 0x5b6b7c,
  terminalHover: 0x007aff,
  select: 0x007aff,
  highlight: 0xff9500,
  panel: 0xffffff,
  chipBg: 0xffffff,
  chipLine: 0xd4d4da,
  valueV: 0x007aff,
  valueI: 0x248a3d,
  valueR: 0xc93400,
};

export function paletteFor(theme: ThemeMode): Palette {
  return theme === 'light' ? LIGHT : DARK;
}
