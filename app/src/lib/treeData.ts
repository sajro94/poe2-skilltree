import type {
  RawData,
  RawNode,
  ParsedTree,
  TreeNode,
  TreeEdge,
  NodeKind,
  NodeOverride,
  SkillOverride,
} from "../types";

const ARC_TOL = 0.14; // radius mismatch tolerance for treating an edge as an arc

export function classifyKind(n: RawNode): NodeKind {
  if (n.ascendancyId) {
    if (n.isAscendancyStart) return "ascStart";
    if (n.isNotable || n.isKeystone) return "ascNotable";
    return "ascNormal";
  }
  if (n.isKeystone) return "keystone";
  if (n.isNotable) return "notable";
  if (n.isMastery) return "mastery";
  if (n.isJewelSocket) return "jewel";
  return "small";
}

export type ProgressFn = (loaded: number, total: number) => void;

async function fetchJsonWithProgress<T>(url: string, onProgress?: ProgressFn): Promise<T> {
  const res = await fetch(url);
  const total = Number(res.headers.get("content-length") || 0);
  if (!res.body || !total) {
    const text = await res.text();
    onProgress?.(text.length, text.length);
    return JSON.parse(text) as T;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const all = new Uint8Array(received);
  let pos = 0;
  for (const c of chunks) {
    all.set(c, pos);
    pos += c.length;
  }
  return JSON.parse(new TextDecoder().decode(all)) as T;
}

export async function loadTree(version: string, onProgress?: ProgressFn): Promise<ParsedTree> {
  const raw = await fetchJsonWithProgress<RawData>(
    `${import.meta.env.BASE_URL}data/data-${version}.json`,
    onProgress
  );

  const nodes = new Map<string, TreeNode>();
  const nodeList: TreeNode[] = [];
  const classStart = new Map<number, TreeNode>();
  const ascStart = new Map<string, TreeNode>();

  for (const [key, n] of Object.entries(raw.nodes)) {
    if (typeof n.x !== "number" || typeof n.y !== "number") continue; // skip "root"
    const tn: TreeNode = {
      key,
      id: n.id,
      name: n.name ?? "",
      icon: n.icon,
      kind: classifyKind(n),
      ascendancyId: n.ascendancyId,
      classStartIndex: n.classStartIndex,
      stats: n.stats ?? [],
      flavourText: n.flavourText ?? [],
      group: n.group,
      orbit: n.orbit ?? 0,
      x: n.x,
      y: n.y,
      grantedPassivePoints: n.grantedPassivePoints,
    };
    nodes.set(key, tn);
    nodeList.push(tn);

    if (n.classStartIndex) for (const ci of n.classStartIndex) classStart.set(ci, tn);
    if (n.isAscendancyStart && n.ascendancyId && !ascStart.has(n.ascendancyId)) {
      ascStart.set(n.ascendancyId, tn);
    }
  }

  // Build edges with arc geometry where the connection follows an orbit.
  const edges: TreeEdge[] = [];
  const seen = new Set<string>();
  for (const e of raw.edges) {
    const fromKey = String(e.from);
    const toKey = String(e.to);
    const a = nodes.get(fromKey);
    const b = nodes.get(toKey);
    if (!a || !b) continue;
    const sig = fromKey < toKey ? `${fromKey}-${toKey}` : `${toKey}-${fromKey}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    const edge: TreeEdge = { fromKey, toKey, fx: a.x, fy: a.y, tx: b.x, ty: b.y };
    // Hide ascendancy-start spokes and any edge crossing between an ascendancy
    // and the rest of the tree (e.g. Pathfinder's "Path of the X" connectors).
    // Kept in adjacency for pathing; just not drawn.
    if (a.kind === "ascStart" || b.kind === "ascStart" || a.ascendancyId !== b.ascendancyId)
      edge.hidden = true;
    // tag intra-ascendancy edges so they can be offset to centre when selected
    if (a.ascendancyId && a.ascendancyId === b.ascendancyId) edge.asc = a.ascendancyId;

    if (e.orbit && typeof e.orbitX === "number" && typeof e.orbitY === "number") {
      const cx = e.orbitX;
      const cy = e.orbitY;
      const r = Math.hypot(a.x - cx, a.y - cy);
      const r2 = Math.hypot(b.x - cx, b.y - cy);
      if (r > 1 && Math.abs(r2 - r) / r < ARC_TOL) {
        const a0 = Math.atan2(a.y - cy, a.x - cx);
        const a1 = Math.atan2(b.y - cy, b.x - cx);
        let d = a1 - a0;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (Math.abs(d) > 0.001) {
          edge.arc = { cx, cy, r, a0, a1: a0 + d, ccw: d < 0 };
        }
      }
    }
    edges.push(edge);
  }

  // Undirected adjacency for pathfinding.
  const adjacency = new Map<string, string[]>();
  const addAdj = (a: string, b: string) => {
    let l = adjacency.get(a);
    if (!l) adjacency.set(a, (l = []));
    l.push(b);
  };
  for (const e of edges) {
    addAdj(e.fromKey, e.toKey);
    addAdj(e.toKey, e.fromKey);
  }

  // Per-class start-node overrides (e.g. Huntress/Witch/Druid reshape some
  // shared start nodes). overridePairs maps node id -> skillOverrides id.
  const skillOverrides = raw.skillOverrides ?? {};
  const classOverrides = new Map<number, Map<string, NodeOverride>>();
  raw.classes.forEach((c, i) => {
    if (!c.overridePairs) return;
    const m = new Map<string, NodeOverride>();
    for (const [nodeId, ovId] of Object.entries(c.overridePairs)) {
      const ov = skillOverrides[String(ovId)];
      const pick: SkillOverride | undefined = Array.isArray(ov)
        ? ov.find((e) => (e.id ?? "").toLowerCase().startsWith(c.name.toLowerCase())) ?? ov[0]
        : ov;
      if (pick) m.set(String(nodeId), { name: pick.name, stats: pick.stats ?? [], icon: pick.icon });
    }
    if (m.size) classOverrides.set(i, m);
  });

  return {
    version,
    nodes,
    nodeList,
    edges,
    classes: raw.classes,
    bounds: { minX: raw.min_x, minY: raw.min_y, maxX: raw.max_x, maxY: raw.max_y },
    classStart,
    ascStart,
    classOverrides,
    adjacency,
  };
}
