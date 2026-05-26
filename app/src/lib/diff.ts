import type { ParsedTree, VersionDiff, DiffEntry } from "../types";

const isReal = (name: string) => !!name && !name.startsWith("[DNT");
const sameStats = (a: string[], b: string[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);

/**
 * Diff two parsed trees keyed by numeric skill id (the stable dict key).
 * Produces per-node status used to highlight what changed in `next` vs `prev`.
 */
export function computeDiff(prev: ParsedTree, next: ParsedTree): VersionDiff {
  const byKey = new Map<string, DiffEntry>();
  const removed: DiffEntry[] = [];
  const counts = { added: 0, removed: 0, stats: 0, renamed: 0 };

  // added + modified (iterate the newer tree)
  for (const [key, n] of next.nodes) {
    const o = prev.nodes.get(key);
    if (!o) {
      if (isReal(n.name) || n.stats.length) {
        byKey.set(key, { status: "added", newName: n.name, newStats: n.stats });
        counts.added++;
      }
      continue;
    }
    const statsChanged = !sameStats(o.stats, n.stats);
    const nameChanged = o.name !== n.name && isReal(o.name) && isReal(n.name);

    if (statsChanged && (isReal(o.name) || isReal(n.name)) && (o.stats.length || n.stats.length)) {
      byKey.set(key, {
        status: "stats",
        oldName: o.name,
        newName: n.name,
        oldStats: o.stats,
        newStats: n.stats,
      });
      counts.stats++;
    } else if (nameChanged) {
      byKey.set(key, { status: "renamed", oldName: o.name, newName: n.name });
      counts.renamed++;
    }
  }

  // removed (in prev, gone from next) — keep meaningful ones for ghosting
  for (const [key, o] of prev.nodes) {
    if (next.nodes.has(key)) continue;
    if (!isReal(o.name)) continue;
    const entry: DiffEntry = {
      status: "removed",
      oldName: o.name,
      oldStats: o.stats,
      ghost: { x: o.x, y: o.y, name: o.name, kind: o.kind },
    };
    byKey.set(key, entry);
    removed.push(entry);
    counts.removed++;
  }

  return { byKey, removed, counts };
}

export const DIFF_COLORS: Record<string, string> = {
  added: "#4ad6a0",
  removed: "#ef5d5d",
  stats: "#f5b740",
  renamed: "#5fd6cd",
};
