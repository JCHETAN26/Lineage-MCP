#!/usr/bin/env bash
#
# release.sh — one-shot, guarded npm release for @cjitendr/lineage-mcp
#
# Runs preflight checks, tests, and a clean build, then publishes to npm and
# tags the release in git. Safe to re-run: it refuses to publish a version that
# already exists on the registry and refuses to run with a dirty working tree.
#
# Usage:
#   npm run release            # publish the current package.json version
#
# Requirements: you must be logged in (`npm login`) before running.

set -euo pipefail

cd "$(dirname "$0")/.."

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

say "Releasing ${NAME}@${VERSION}"

# 1. Must be logged in to npm.
npm whoami >/dev/null 2>&1 || die "Not logged in to npm. Run: npm login"

# 2. Working tree must be clean (so the git tag matches what ships).
[ -z "$(git status --porcelain)" ] || die "Working tree is dirty. Commit or stash first."

# 3. Version must not already be published.
if npm view "${NAME}@${VERSION}" version >/dev/null 2>&1; then
  die "${NAME}@${VERSION} is already published. Bump the version first: npm version <patch|minor|major>"
fi

# 4. Git tag must not already exist.
if git rev-parse "${TAG}" >/dev/null 2>&1; then
  die "Git tag ${TAG} already exists."
fi

# 5. Test + clean build (prepublishOnly also builds, but fail fast here).
say "Running test suite"
npm test

say "Clean build"
rm -rf dist
npm run build

# 6. Show exactly what will ship.
say "Package contents"
npm pack --dry-run

# 7. Confirm before the irreversible step.
printf '\n\033[1;33mPublish %s and push tag %s? [y/N] \033[0m' "${NAME}@${VERSION}" "${TAG}"
read -r REPLY
case "$REPLY" in
  [yY]*) ;;
  *) die "Aborted by user." ;;
esac

# 8. Publish (publishConfig.access=public handles the scoped-package flag).
say "Publishing to npm"
npm publish

# 9. Tag and push.
say "Tagging ${TAG} and pushing"
git tag "${TAG}"
git push origin HEAD
git push origin "${TAG}"

say "Done — ${NAME}@${VERSION} published and tagged ${TAG}"
