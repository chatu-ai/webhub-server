#!/bin/sh
# scripts/tag-release.sh
#
# Auto-increment vYYYY.MM.DD.N tag and push to origin.
# Usage:
#   ./scripts/tag-release.sh           # create + push next tag
#   ./scripts/tag-release.sh --dry-run # print tag only, do not push

set -e

DRY_RUN=0
if [ "$1" = "--dry-run" ] || [ "$1" = "-n" ]; then
  DRY_RUN=1
fi

# Fetch all remote tags first
git fetch --tags --quiet

TODAY=$(date -u +%Y.%m.%d)
PREFIX="v${TODAY}."

# Find the highest sequence number used today (local + remote)
LAST=$(git tag --list "${PREFIX}*" \
  | sed "s/${PREFIX}//" \
  | grep -E '^[0-9]+$' \
  | sort -n \
  | tail -1)

if [ -z "$LAST" ]; then
  NEXT=1
else
  NEXT=$((LAST + 1))
fi

TAG="${PREFIX}${NEXT}"

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN — next tag would be: $TAG"
  exit 0
fi

echo "Creating tag: $TAG"
git tag "$TAG"
git push origin "$TAG"
echo "Pushed $TAG — publish workflow will start automatically."
