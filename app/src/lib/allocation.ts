// Graph helpers for passive-tree allocation.

type Adj = Map<string, string[]>;

/** All nodes reachable from `start` over edges where `allowed(neighbour)` holds. */
export function reach(adj: Adj, start: string, allowed: (key: string) => boolean): Set<string> {
  const seen = new Set<string>([start]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    for (const nb of adj.get(q[i]) ?? []) {
      if (!seen.has(nb) && allowed(nb)) {
        seen.add(nb);
        q.push(nb);
      }
    }
  }
  return seen;
}

/**
 * Shortest path from any of `sources` to `target`, traversing only nodes for
 * which `canTraverse(key)` is true. Returns the path nodes NOT already in
 * `sources` (target last), or null if unreachable.
 */
export function pathFrom(
  adj: Adj,
  sources: Set<string>,
  target: string,
  canTraverse: (key: string) => boolean
): string[] | null {
  if (sources.has(target)) return [];
  const parent = new Map<string, string | null>();
  const q: string[] = [];
  for (const s of sources) {
    parent.set(s, null);
    q.push(s);
  }
  let head = 0;
  let found = false;
  while (head < q.length) {
    const cur = q[head++];
    if (cur === target) {
      found = true;
      break;
    }
    for (const nb of adj.get(cur) ?? []) {
      if (parent.has(nb)) continue;
      if (nb !== target && !canTraverse(nb)) continue;
      parent.set(nb, cur);
      q.push(nb);
    }
  }
  if (!found && !parent.has(target)) return null;
  const path: string[] = [];
  let cur: string | null = target;
  while (cur != null && !sources.has(cur)) {
    path.push(cur);
    cur = parent.get(cur) ?? null;
  }
  path.reverse();
  return path;
}

/** Single-layer connectivity prune (used for ascendancy): keep only members
 *  of `set` still reachable from `start` through `set`. */
export function prunedSet(adj: Adj, set: Set<string>, start: string): Set<string> {
  const r = reach(adj, start, (k) => set.has(k));
  const out = new Set<string>();
  for (const k of set) if (r.has(k)) out.add(k);
  return out;
}
