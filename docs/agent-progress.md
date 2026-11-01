# Agent progress

Last updated: 2026-11-01 (Phase 1 build)

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
| GitHub Actions + Pages deployment | ⏳ in progress |
| WeChat mini-program | 🟡 scaffold + adapter layer only (Phase 2, not published) |

- Unit/physics/reasoning/teaching tests: **47 passed**
- Desktop e2e: **10 passed** (`desktop-chromium`)
- Mobile e2e: iPhone 13, Pixel 7 and iPad projects (see latest run)
- TypeScript: strict, no errors
- Production build: passing (Pixi + ECharts split into chunks)

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

1. Run the mobile Playwright projects and fix any layout findings.
2. Commit and push to `main`.
3. Enable Pages with `build_type=workflow`, watch the workflow, verify the live
   URL and assets, run the smoke test against the public URL.
4. Phase 2: register the WeChat business domain and port the renderer for the
   native route.
