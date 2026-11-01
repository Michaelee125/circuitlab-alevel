# Deployment verification

Target URL: **https://michaelee125.github.io/circuitlab-alevel/**
Verified: 2026-11-01, against the public site (not localhost).

## HTTP and assets

| Check | Result |
| --- | --- |
| `GET /circuitlab-alevel/` | `200` |
| `assets/index-*.js` | `200` |
| `assets/react-*.js` | `200` |
| `assets/pixi-*.js` | `200` |
| `assets/charts-*.js` | `200` |
| `assets/index-*.css` | `200` |
| `favicon.svg` | `200` |
| `manifest.webmanifest` | `200` |
| Pages build status | `built` |
| Pages source | `gh-pages` (branch) |
| HTTPS enforced | `true` |

Every asset URL in the deployed `index.html` is prefixed with
`/circuitlab-alevel/`, confirming the Vite base path is correct for a project
site.

## Browser checks (Chromium, desktop 1440×900)

| Check | Result |
| --- | --- |
| Page boots, brand renders | ✅ |
| WebGL canvas visible | ✅ |
| Experiment library → LDR circuit | ✅ 5 components, status `ok` |
| Increase light action | ✅ total resistance 12 Ω → 6 Ω |
| Explain panel | ✅ “LDR in series with a fixed resistor”, chain contains 8.00 Ω → 2.00 Ω |
| Realistic mode | ✅ renders, same circuit and resistance |
| Three language options always visible | ✅ EN / 中文 / EN/中 |
| Bilingual mode | ✅ tab labels show both languages |
| Pinned explanation | ✅ stays visible below Properties |
| Internal resistance | ✅ r annotation in circuit, “Lost volts” card, localized |
| Redundant wire attempt | ✅ “These terminals are already connected.”, wire count unchanged |
| Wire selection + delete | ✅ selected corridor highlighted, Delete removes it |
| Liquid Glass UI | ✅ pure-black dark body (`rgb(0, 0, 0)`), frosted panels, iOS controls |
| Live component values | ✅ labelled Values switch in the toolbar (plus settings/help switches), persisted |
| Value card placement | ✅ 8 candidate positions; refuses any overlap with components, labels, cards or wires |
| Value card material | ✅ DOM cards with computed `backdrop-filter: blur(20px) saturate(1.9)`; circuit visibly blurs behind them |
| Phone toolbar | ✅ every control visible at 320–412 px, nothing clipped by the stage |
| Phone top bar | ✅ grouped icon cluster, styled language picker, theme toggle, no page overflow |
| Phone value cards | ✅ 80 × 44 compact cards fit three in a row; desktop keeps the larger cards |
| Voltmeter legibility | ✅ reading auto-scales to its display; return lane routed below meters |
| Apple-style settings menu | ✅ frosted popover with switches and segmented controls |
| Lamp brightness feedback | ✅ glow scales from a faint halo at 2 V to a wide warm halo at 12 V |
| Current animation | ✅ additive comet particles visible at default and high zoom |
| Theme toggle | ✅ one-tap sun/moon button in the desktop and mobile top bars |
| Chart dock clearance | ✅ canvas shrinks above the dock; voltmeter stays visible |
| Liquid press | ✅ `is-liquid-pressed` + `.liquid-ripple` appear on pointerdown and clean up after the animation |
| Wire routing after drag | ✅ every preset is orthogonal and overlap-free; dragged layouts get parallel lanes |
| Charge animation | ✅ comet trails follow the polyline, clamped at wire ends (no stray chords) |
| Wires vs components | ✅ presets and dragged layouts never route through another component; a blocking part forces a detour |
| General reasoning | ✅ rheostat + lamp, parallel rheostat/lamp, internal resistance, switch open/closed, capacitor, EMF + lamp, LDR + lamp, meters |
| Glass bottom dock | ✅ computed backdrop-filter `blur(50px) saturate(2) brightness(1.05)` on desktop |
| Glass phone tab bar | ✅ floating capsule, 24 px radius, `blur(46px) saturate(2)`, sheets share the treatment |
| Console errors | 0 |
| Failed network requests | 0 |

## Browser checks (Chromium, iPhone 13 emulation 390×664)

| Check | Result |
| --- | --- |
| Horizontal overflow | none (scrollWidth = innerWidth = 390) |
| Mobile tab bar | visible |
| Components sheet → add resistor | ✅ component count 1 |
| Console errors | 0 |

## Local automated suites

| Suite | Result |
| --- | --- |
| Vitest (physics, transients, reasoning, teaching, routing) | 65 / 65 passed |
| Playwright desktop project | 18 / 18 passed |
| Playwright iPhone 13 | 7 / 7 passed |
| Playwright Pixel 7 | 7 / 7 passed |
| Playwright iPad (gen 7) | 7 / 7 passed |
| Total e2e | 39 passed, 57 intentionally skipped (viewport-specific) |

Run the live smoke test any time with:

```bash
BASE_URL=https://michaelee125.github.io/circuitlab-alevel/ \
  pnpm exec playwright test e2e/smoke.spec.ts --project=desktop-chromium
```

(It requires the local preview server entry in `playwright.config.ts`; the
verification above used a standalone Playwright script against the public URL.)
