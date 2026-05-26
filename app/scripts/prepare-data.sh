#!/usr/bin/env bash
# Populates app/public with the tree data + sprite atlases the viewer fetches
# at runtime. Kept out of git (see app/.gitignore) and regenerated on dev/build.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)" # repo root
PUB="$SCRIPT_DIR/../public"

# Commit holding the 0.4.0 export (for the version-diff feature).
V04_COMMIT="${V04_COMMIT:-859f2b1}"

mkdir -p "$PUB/data" "$PUB/assets"

cp "$ROOT"/assets/* "$PUB/assets/"
cp "$ROOT/data.json" "$PUB/data/data-0.5.json"
git -C "$ROOT" show "$V04_COMMIT:data.json" > "$PUB/data/data-0.4.json"

echo "prepared: $(du -sh "$PUB" | cut -f1) in app/public"
