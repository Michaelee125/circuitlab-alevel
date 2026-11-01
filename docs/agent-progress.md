# Agent progress

Last updated: 2026-11-01 (Phase 1 build + review fixes)

## Status

| Area | State |
| --- | --- |
| Monorepo scaffold | ✅ complete |
| `circuit-core` (model, topology, geometry, validation, serialisation) | ✅ complete |
| `physics-engine` (MNA, non-linear, transient, sweeps) | ✅ complete, 25 tests |
| `reasoning-engine` (structural rules + verified chains, en/zh) | ✅ complete, 10 tests |
| `teaching-engine` (11 experiments, guided, exam, dataset) | ✅ complete, 12 tests |
| `i18n`, `ui`, `platform-adapters` (web + WeChat) | ✅ complete |
| `circuit-renderer` (schematic + realistic, particles, meters) | ✅ complete |
| `apps/web` (editor, modes, panels, responsive, persistence) | ✅ complete |
| GitHub Actions workflow | 🟡 template ready, activation blocked by missing OAuth `workflow` scope |
| GitHub Pages deployment | ✅ live from `gh-pages`, verified |
| WeChat mini-program | 🟡 scaffold + adapter layer only (Phase 2, not published) |

- Unit/physics/reasoning/teaching/routing tests: **52 passed**
- Desktop e2e: **15 passed** (`desktop-chromium`, includes the smoke test)
- Mobile e2e: iPhone 13 **7 passed**, Pixel 7 **7 passed**, iPad **7 passed**
- Total Playwright: **36 passed**, 48 intentionally skipped
- TypeScript: strict, no errors
- Production build: passing (Pixi + ECharts split into chunks)
- Live site verified: HTTP 200, assets 200, WebGL + LDR reasoning, 0 console errors

## Review fixes (after first live delivery)

- Language switching is always reachable: three explicit options (EN / 中文 / EN/中) on desktop and a native select on phones; chart axes, component descriptions, meter notes and toast messages were localized too.
- The Explain panel can be pinned so it stays visible under Properties (disabled in Exam mode so answers stay hidden).
- Cells and batteries with `r > 0` now draw an internal resistor and an `r = … Ω` annotation in both visual modes, with terminal p.d. / lost-volts cards in the inspector.
- Wire logic: connections between pins that are already on the same node are refused with a localized message; overlapping routes are pushed into parallel lanes; wires can be selected and deleted.

## Known limitations

- Exam marking is software-authored keyword practice marking (English only).
- RC transients support exactly one capacitor.
- Ideal meters are modelled as 1 µΩ / 1 GΩ.
- Reasoning rules cover LDR/thermistor series and parallel, fixed-resistor
  series dividers and supply EMF changes; other topologies show measurements
  with an explicit “no verified explanation” message.
- WeChat release is blocked on a registered appid and an owned HTTPS business
  domain (external credentials, not available in this environment).

## Git

- Branch: `main`
- Remote: `https://github.com/Michaelee125/circuitlab-alevel.git`
- Commit SHA and deployment status are recorded in the final delivery report
  and in the GitHub Actions run.

## Next steps

1. The only manual deployment step: `gh auth refresh -s workflow`, then
   `pnpm deploy:actions`, commit and push — this activates the tracked workflow
   and switches Pages to GitHub Actions. Until then the same build is served
   from `gh-pages`.
2. Phase 2: register the WeChat appid and an owned HTTPS business domain, then
   either ship the `web-view` shell or port the renderer for the native route.
