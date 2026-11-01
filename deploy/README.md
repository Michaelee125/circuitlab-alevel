# Deployment notes

The preferred deployment is GitHub Actions → GitHub Pages using
[`github-actions-deploy.yml`](github-actions-deploy.yml). Copy it to the
workflow folder and push:

```bash
mkdir -p .github/workflows
cp deploy/github-actions-deploy.yml .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "ci: deploy to GitHub Pages"
git push
```

> **Why it is not already active:** the GitHub token used for this build has
> the `repo`, `read:org` and `gist` scopes but **not** `workflow`. GitHub
> rejects any push or API write of `.github/workflows/*` with that token
> (`401/404`). The workflow file itself is complete and tracked here.

To activate Actions, grant the scope once with an interactive login:

```bash
gh auth refresh -s workflow
```

Then run the three commands above (or `pnpm deploy:actions`), enable Pages with
`build_type=workflow`, and push. The site is currently published from the
`gh-pages` branch using the same production build:

```bash
pnpm deploy:pages        # builds with the /circuitlab-alevel/ base path
```

Both routes publish the identical `apps/web/dist` output.
