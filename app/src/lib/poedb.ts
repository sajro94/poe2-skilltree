import { useEffect, useState } from "react";

// Gem/item name lists for the planner's autocomplete. Bundled at build time
// from poe2db (their CDN has no CORS for third-party origins, so the browser
// can't read it directly); we load the same-origin snapshot and session-cache it.
export interface PoeDb {
  uniques: string[];
  skillGems: string[];
  supportGems: string[];
}

const EMPTY: PoeDb = { uniques: [], skillGems: [], supportGems: [] };
let mem: PoeDb | null = null;
let inflight: Promise<PoeDb> | null = null;

// Loaded from a same-origin static file (browser HTTP-caches it), deduped
// in-memory for the session — no extra localStorage layer needed.
export function loadPoeDb(): Promise<PoeDb> {
  if (mem) return Promise.resolve(mem);
  if (!inflight) {
    inflight = fetch(`${import.meta.env.BASE_URL}data/poe2db.json`)
      .then((r) => (r.ok ? (r.json() as Promise<PoeDb>) : EMPTY))
      .then((d) => {
        mem = { uniques: d.uniques ?? [], skillGems: d.skillGems ?? [], supportGems: d.supportGems ?? [] };
        return mem;
      })
      .catch(() => EMPTY);
  }
  return inflight;
}

/** React hook: returns the lists (empty until loaded). */
export function usePoeDb(): PoeDb {
  const [db, setDb] = useState<PoeDb>(mem ?? EMPTY);
  useEffect(() => {
    let on = true;
    loadPoeDb().then((d) => on && setDb(d));
    return () => {
      on = false;
    };
  }, []);
  return db;
}
