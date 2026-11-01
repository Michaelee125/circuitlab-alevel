# GitHub deployment

The Phase 1 acceptance criterion is a **public GitHub Pages site**, not a local
build. This document records exactly how that is achieved and verified.

- Repository: `https://github.com/Michaelee125/circuitlab-alevel`
- Live site: `https://michaelee125.github.io/circuitlab-alevel/`
- Workflow: `.github/workflows/deploy.yml`

## How the pipeline works

`deploy.yml` runs on every push to `main` and can be triggered manually:

1. `actions/checkout@v4`
2. `pnpm/action-setup@v4` (reads `packageManager: pnpm@11.28.5`)
3. `actions/setup-node@v4` with Node 22 and the pnpm store cache
4. `pnpm install --frozen-lockfile`
5. `pnpm typecheck` — strict TypeScript across every package
6. `pnpm test` — Vitest physics, reasoning, teaching and transient suites
7. `pnpm build` with `VITE_BASE_PATH=/${{ github.event.repository.name }}/`
8. `actions/configure-pages@v5`
9. `actions/upload-pages-artifact@v3` with `apps/web/dist`
10. `actions/deploy-pages@v4` in the `github-pages` environment

Permissions are the minimum required by the official Pages flow:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

## Base path

A project site is served from `https://<user>.github.io/<repo>/`, so the Vite
`base` must match the sub-path. `apps/web/vite.config.ts` uses:

```ts
const base = process.env.VITE_BASE_PATH || '/';
```

The workflow derives it from the repository name, so forks and renames keep
working. Nothing in the app hard-codes `github.io`; asset URLs come from Vite's
base and `%BASE_URL%` in `index.html`.

To move to a custom domain (for example `https://lab.example.com/`), build with
`VITE_BASE_PATH=/` and add the domain in the repository Pages settings.

## Enabling Pages

The Pages site must use **GitHub Actions** as its source (not “Deploy from a
branch”). This is a one-time repository setting and can be applied through the
API:

```bash
gh api -X POST repos/Michaelee125/circuitlab-alevel/pages \
  -f build_type=workflow
```

If the Pages site already exists, update it instead:

```bash
gh api -X PUT repos/Michaelee125/circuitlab-alevel/pages -f build_type=workflow
```

The workflow's `deploy` job publishes to the `github-pages` environment and
exposes the resulting URL as `steps.deployment.outputs.page_url`.

## Verification checklist

```bash
# 1. Workflow status
gh run list --workflow=deploy.yml --limit 3
gh run watch <run-id>

# 2. Pages status
gh api repos/Michaelee125/circuitlab-alevel/pages

# 3. HTTP response
curl -sI https://michaelee125.github.io/circuitlab-alevel/ | head -5

# 4. Assets referenced by the sub-path
curl -s https://michaelee125.github.io/circuitlab-alevel/ | grep -o 'assets/[^"]*'

# 5. Browser smoke test (the deployed URL, not localhost)
BASE_URL=https://michaelee125.github.io/circuitlab-alevel/ pnpm exec playwright test e2e/smoke.spec.ts
```

`e2e/smoke.spec.ts` checks that the page boots, the WebGL canvas is present,
the physics solves an experiment, and the reasoning engine has a baseline.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| 404 for `/assets/*.js` | base path mismatch | rebuild with the correct `VITE_BASE_PATH` |
| `Resource not accessible by integration` on deploying | Pages source is a branch, not Actions | set `build_type=workflow` |
| `Get Pages site failed` | Pages not enabled | `POST /repos/.../pages` |
| Push rejected for `.github/workflows` | OAuth token lacks the `workflow` scope | push code first, then add the workflow with a token that has `workflow`, or enable Pages and deploy from a branch as a fallback |
| Old site after a successful run | browser/CDN cache | hard refresh; check the run's `page_url` |
| Build passes locally, fails in CI | local base `/` vs CI base `/<repo>/` | run `VITE_BASE_PATH=/circuitlab-alevel/ pnpm build` locally |

## Repository hygiene

- `node_modules/`, `dist/`, Playwright output and local env files are ignored.
- No tokens, keys or passwords are committed. The GitHub token is only used by
  the local `gh` CLI and is never written into the repository.
- The e2e suite is not part of the Pages workflow (it needs a browser); unit and
  physics tests gate the deployment.
