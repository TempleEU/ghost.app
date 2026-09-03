#!/usr/bin/env bash
# Sync this GhostChat project to GitHub (https://github.com/TempleEU/ghostchat-android)
# Run from the project root:  bash sync-github.sh
set -euo pipefail

REMOTE="${1:-github}"
BRANCH="${2:-main}"

echo "==> Syncing to $REMOTE/$BRANCH"

# 1. Safety: secret files must never enter the repo (stay on disk, leave the index)
for secret in .env .env.local ghostly-release-key.jks; do
  if git ls-files --error-unmatch "$secret" >/dev/null 2>&1; then
    echo "==> Untracking $secret (file stays on disk)..."
    git rm --cached "$secret"
    git commit -m "Stop tracking $secret" || true
  fi
done

# 2. Commit any pending changes (including new files)
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "Sync GhostChat project state $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

# 3. Bring in any remote commits, keeping local work (merge preserves both histories)
git pull --no-rebase --no-edit "$REMOTE" "$BRANCH"

# 4. Push
git push "$REMOTE" "$BRANCH"

echo "✅ Synced: $REMOTE/$BRANCH is now up to date with this project."