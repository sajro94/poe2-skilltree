import { reach, pathFrom, prunedSet } from "./allocation";
import type { ParsedTree, TreeNode } from "../types";

export const ASC_BUDGET = 8;
export const SWAP_MAX = 25; // max swap passives PER weapon set (Set I and Set II each)

// Weapon-set tag on an allocated main-tree node: 0 = shared (gold),
// 1 = Set I (red), 2 = Set II (green).
export type Tag = 0 | 1 | 2;

export interface BuildState {
  selectedClass: number | null;
  selectedAsc: string | null;
  mode: Tag; // brush: which layer new allocations belong to
  alloc: Map<string, Tag>; // main-tree allocations -> weapon tag
  ascAlloc: Set<string>;
  baseBudget: number;
}

export const initialBuild: BuildState = {
  selectedClass: null,
  selectedAsc: null,
  mode: 0,
  alloc: new Map(),
  ascAlloc: new Set(),
  baseBudget: 123,
};

export type BuildAction =
  | { type: "selectClass"; idx: number | null }
  | { type: "selectAsc"; id: string | null }
  | { type: "clickNode"; node: TreeNode; tree: ParsedTree }
  | { type: "setMode"; mode: Tag }
  | { type: "setBudget"; n: number }
  | { type: "clear" };

const tagCount = (alloc: Map<string, Tag>, tag: Tag) => {
  let n = 0;
  alloc.forEach((t) => t === tag && n++);
  return n;
};

/**
 * Layer-aware connectivity: a node is kept only if it still connects to start
 * within its layer — shared through shared, Set I through shared+Set I, Set II
 * through shared+Set II (so the two sets never route through each other).
 */
function supported(adj: Map<string, string[]>, alloc: Map<string, Tag>, start: string): Map<string, Tag> {
  const tag = (k: string) => alloc.get(k);
  const shared = reach(adj, start, (k) => tag(k) === 0);
  const set1 = reach(adj, start, (k) => shared.has(k) || tag(k) === 1);
  const set2 = reach(adj, start, (k) => shared.has(k) || tag(k) === 2);
  const out = new Map<string, Tag>();
  for (const [k, t] of alloc) {
    if (t === 0 ? shared.has(k) : t === 1 ? set1.has(k) : set2.has(k)) out.set(k, t);
  }
  return out;
}

/**
 * The path that clicking `node` would newly allocate, with the tag it'd get.
 * Returns null when the click wouldn't allocate (already allocated, no class,
 * unreachable, or would exceed a cap). Used for the hover preview and reused
 * by the reducer to stay consistent.
 */
export function previewAllocation(
  tree: ParsedTree,
  st: Pick<BuildState, "selectedClass" | "selectedAsc" | "mode" | "alloc" | "ascAlloc">,
  node: TreeNode
): { keys: string[]; tag: Tag } | null {
  const adj = tree.adjacency;

  if (node.ascendancyId) {
    if (st.selectedAsc !== node.ascendancyId) return null;
    const start = tree.ascStart.get(node.ascendancyId);
    if (!start || node.key === start.key || st.ascAlloc.has(node.key)) return null;
    const sources = new Set<string>([start.key, ...st.ascAlloc]);
    const path = pathFrom(adj, sources, node.key, (k) => tree.nodes.get(k)?.ascendancyId === node.ascendancyId);
    if (!path || st.ascAlloc.size + path.length > ASC_BUDGET) return null;
    return { keys: path, tag: 0 };
  }

  const sk = st.selectedClass != null ? tree.classStart.get(st.selectedClass)?.key ?? null : null;
  if (!sk || node.key === sk || st.alloc.has(node.key)) return null;
  const m = st.mode;
  const sources = new Set<string>([sk]);
  st.alloc.forEach((t, k) => {
    if (t === 0 || t === m) sources.add(k);
  });
  const canTraverse = (k: string) => {
    const t = st.alloc.get(k);
    if (t === undefined) return !tree.nodes.get(k)?.ascendancyId;
    return t === 0 || t === m;
  };
  const path = pathFrom(adj, sources, node.key, canTraverse);
  if (!path) return null;
  if (m !== 0 && tagCount(st.alloc, m) + path.length > SWAP_MAX) return null;
  return { keys: path, tag: m };
}

export function buildReducer(s: BuildState, a: BuildAction): BuildState {
  switch (a.type) {
    case "selectClass":
      return { ...s, selectedClass: a.idx, selectedAsc: null, mode: 0, alloc: new Map(), ascAlloc: new Set() };
    case "selectAsc":
      return { ...s, selectedAsc: a.id, ascAlloc: new Set() };
    case "setMode":
      return { ...s, mode: a.mode };
    case "setBudget":
      return { ...s, baseBudget: a.n };
    case "clear":
      return { ...s, alloc: new Map(), ascAlloc: new Set() };
    case "clickNode": {
      const { node, tree } = a;
      const adj = tree.adjacency;

      // Ascendancy node → single-layer allocation within selected ascendancy.
      if (node.ascendancyId) {
        const ascId = node.ascendancyId;
        if (s.selectedAsc !== ascId) return { ...s, selectedAsc: ascId, ascAlloc: new Set() };
        const start = tree.ascStart.get(ascId);
        if (!start || node.key === start.key) return s;
        const cur = s.ascAlloc;
        if (cur.has(node.key)) {
          const next = new Set(cur);
          next.delete(node.key);
          return { ...s, ascAlloc: prunedSet(adj, next, start.key) };
        }
        const sources = new Set<string>([start.key, ...cur]);
        const path = pathFrom(adj, sources, node.key, (k) => tree.nodes.get(k)?.ascendancyId === ascId);
        if (!path || cur.size + path.length > ASC_BUDGET) return s;
        const next = new Set(cur);
        path.forEach((k) => next.add(k));
        return { ...s, ascAlloc: next };
      }

      // Main-tree node.
      const sk = s.selectedClass != null ? tree.classStart.get(s.selectedClass)?.key ?? null : null;
      if (!sk || node.key === sk) return s;

      if (s.alloc.has(node.key)) {
        const next = new Map(s.alloc);
        next.delete(node.key);
        return { ...s, alloc: supported(adj, next, sk) };
      }

      const m = s.mode;
      // frontier you may extend from: start + shared, plus same-set nodes
      const sources = new Set<string>([sk]);
      s.alloc.forEach((t, k) => {
        if (t === 0 || t === m) sources.add(k);
      });
      // traversal: unallocated main nodes, shared connectors, and same-set nodes
      const canTraverse = (k: string) => {
        const t = s.alloc.get(k);
        if (t === undefined) return !tree.nodes.get(k)?.ascendancyId;
        return t === 0 || t === m;
      };
      const path = pathFrom(adj, sources, node.key, canTraverse);
      if (!path) return s;
      if (m !== 0 && tagCount(s.alloc, m) + path.length > SWAP_MAX) return s;
      const next = new Map(s.alloc);
      path.forEach((k) => next.set(k, m));
      return { ...s, alloc: next };
    }
    default:
      return s;
  }
}
