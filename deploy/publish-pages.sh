#!/usr/bin/env bash
# Publish the built CircuitLab web app to the gh-pages branch.
#
# This is the fallback deployment path used when the authenticated GitHub token
# cannot create GitHub Actions workflow files (the `workflow` OAuth scope is
# missing). It publishes exactly the same production build that the workflow
# would upload.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_URL="${REPO_URL:-$(git -C "$ROOT" remote get-url origin)}"
REPO_NAME="$(basename "$REMOTE_URL" .git)"
OWNER="$(dirname "$REMOTE_URL" | sed 's#.*[:/]##')"
BASE_PATH="${BASE_PATH:-/$REPO_NAME/}"
WORKDIR="${WORKDIR:-$(mktemp -d)}"

echo "Repository : $OWNER/$REPO_NAME"
echo "Base path  : $BASE_PATH"
echo "Workdir    : $WORKDIR"

cd "$ROOT"
VITE_BASE_PATH="$BASE_PATH" pnpm build

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cp -R apps/web/dist/. "$WORKDIR/"
touch "$WORKDIR/.nojekyll"
cat > "$WORKDIR/README.md" <<HTML
Deployment branch for CircuitLab Physics.

The source of truth is the \`main\` branch. This branch contains only the
production build of \`apps/web\`, published to GitHub Pages.
HTML

cd "$WORKDIR"
git init -q -b gh-pages
git add -A
git -c user.name="CircuitLab Deploy" -c user.email="deploy@users.noreply.github.com" \
  commit -q -m "deploy: publish site $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git remote add origin "$REMOTE_URL"
git push origin gh-pages

echo
echo "Published. Pages URL: https://$OWNER.github.io/$REPO_NAME/"
