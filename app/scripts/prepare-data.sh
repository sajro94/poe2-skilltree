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

# poe2db gem/item names for the planner's Skills/Inventory autocomplete.
# Fetched server-side (poe2db's CDN has no CORS for third-party origins, so the
# browser can't read it at runtime). Bundled once; the app loads it same-origin.
# Hashed URL changes on poe2db updates — bump AC_URL if the fetch 404s.
PODB="$PUB/data/poe2db.json"
AC_URL="${AC_URL:-https://cdn.poe2db.tw/json/autocompletecb_us.00e8df2683036f13.json}"
if [ ! -f "$PODB" ]; then
  TMP="$(mktemp)"
  if curl -sfL --max-time 30 \
      -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36" \
      -H "Referer: https://poe2db.tw/" "$AC_URL" -o "$TMP" \
      && python3 - "$TMP" "$PODB" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
names = lambda descs: sorted({e["label"] for e in d if e.get("desc") in descs})
out = {
    "uniques": names({"Unique"}),
    "skillGems": names({"Skill Gems", "Meta Skill Gem"}),
    "supportGems": names({"Support Gems"}),
}
json.dump(out, open(sys.argv[2], "w"))
print("poe2db: %d uniques, %d skills, %d supports"
      % (len(out["uniques"]), len(out["skillGems"]), len(out["supportGems"])))
PY
  then :; else
    echo "poe2db fetch failed — writing empty stub (planner autocomplete disabled)"
    echo '{"uniques":[],"skillGems":[],"supportGems":[]}' > "$PODB"
  fi
  rm -f "$TMP"
fi

echo "prepared: $(du -sh "$PUB" | cut -f1) in app/public"
