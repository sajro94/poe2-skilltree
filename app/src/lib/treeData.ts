import type {
  RawData,
  RawNode,
  ParsedTree,
  TreeNode,
  TreeEdge,
  NodeKind,
  NodeOverride,
  SkillOverride,
  AscBackground,
} from "../types";

const ARC_TOL = 0.14; // radius mismatch tolerance for treating an edge as an arc

// Hand-placed ascendancy-wheel positions (the desired start-node coordinate for
// each ascendancy). The raw export stacks every wheel near the same spot, so we
// relocate each wheel by (desired - rawStart), shifting all of its nodes, edges
// and background art together. This fans the wheels out into the in-game ring.
// (Witch3b / Abyssal Lich is a 0.5 addition not in the reference table — given
// its own slot mirroring Lich across the Witch1↔Witch2 axis.)
const ASC_LAYOUT: Record<string, { x: number; y: number }> = {
  Sorceress1: { x: -195, y: -20029 }, Sorceress2: { x: 1364, y: -17329 }, Sorceress3: { x: -1754, y: -17329 },
  Witch1: { x: 9705, y: -17376 }, Witch2: { x: 9705, y: -14258 }, Witch3: { x: 7005, y: -15817 }, Witch3b: { x: 12405, y: -15817 },
  Shadow1: { x: 16952, y: -10129 }, Shadow2: { x: 15393, y: -7429 }, Shadow3: { x: 13834, y: -10129 },
  Monk1: { x: 19605, y: -229 }, Monk2: { x: 16905, y: 1330 }, Monk3: { x: 16905, y: -1788 },
  Huntress1: { x: 16952, y: 9671 }, Huntress2: { x: 13834, y: 9671 }, Huntress3: { x: 15393, y: 6971 },
  Ranger1: { x: 9705, y: 16919 }, Ranger2: { x: 7005, y: 15360 }, Ranger3: { x: 9705, y: 13801 },
  Duelist1: { x: -195, y: 19571 }, Duelist2: { x: -1754, y: 16871 }, Duelist3: { x: 1364, y: 16871 },
  Mercenary1: { x: -10095, y: 16919 }, Mercenary2: { x: -10095, y: 13801 }, Mercenary3: { x: -7395, y: 15360 },
  Marauder1: { x: -17343, y: 9671 }, Marauder2: { x: -15784, y: 6971 }, Marauder3: { x: -14225, y: 9671 },
  Warrior1: { x: -19995, y: -229 }, Warrior2: { x: -17295, y: -1788 }, Warrior3: { x: -17295, y: 1330 },
  Druid1: { x: -17343, y: -10129 }, Druid2: { x: -14225, y: -10129 }, Druid3: { x: -15784, y: -7429 },
  Templar1: { x: -10095, y: -17376 }, Templar2: { x: -7395, y: -15817 }, Templar3: { x: -10095, y: -14258 },
};

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
  // bounding box of each ascendancy's nodes → centre the background art on it
  const ascBox = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();

  // Per-ascendancy relocation offset = desired ring slot − raw start position.
  const ascShift = new Map<string, { dx: number; dy: number }>();
  for (const n of Object.values(raw.nodes)) {
    if (n.isAscendancyStart && n.ascendancyId && typeof n.x === "number" && typeof n.y === "number") {
      const dest = ASC_LAYOUT[n.ascendancyId];
      if (dest) ascShift.set(n.ascendancyId, { dx: dest.x - n.x, dy: dest.y - n.y });
    }
  }

  // tree extent (expanded to include the relocated ascendancy wheels)
  let minX = raw.min_x, minY = raw.min_y, maxX = raw.max_x, maxY = raw.max_y;

  for (const [key, n] of Object.entries(raw.nodes)) {
    if (typeof n.x !== "number" || typeof n.y !== "number") continue; // skip "root"
    const shift = n.ascendancyId ? ascShift.get(n.ascendancyId) : undefined;
    const x = n.x + (shift?.dx ?? 0);
    const y = n.y + (shift?.dy ?? 0);
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
      x,
      y,
      grantedPassivePoints: n.grantedPassivePoints,
      mcOption: !!n.isMultipleChoiceOption,
      mcParent: n.multipleChoiceParent != null ? String(n.multipleChoiceParent) : undefined,
    };
    nodes.set(key, tn);
    nodeList.push(tn);

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;

    if (n.classStartIndex) for (const ci of n.classStartIndex) classStart.set(ci, tn);
    if (n.isAscendancyStart && n.ascendancyId && !ascStart.has(n.ascendancyId)) {
      ascStart.set(n.ascendancyId, tn);
    }
    if (n.ascendancyId) {
      const b = ascBox.get(n.ascendancyId);
      if (!b) ascBox.set(n.ascendancyId, { minX: x, minY: y, maxX: x, maxY: y });
      else {
        if (x < b.minX) b.minX = x;
        if (y < b.minY) b.minY = y;
        if (x > b.maxX) b.maxX = x;
        if (y > b.maxY) b.maxY = y;
      }
    }
  }

  // Ascendancy background art: one tile per ascendancy, indexed by its position
  // within the class (class<Name>:Class<i> in the background-<name> atlas),
  // centred on the cluster's bounding box.
  const ascBackgrounds: AscBackground[] = [];
  raw.classes.forEach((c) => {
    c.ascendancies.forEach((a, i) => {
      if (!a || !a.id) return;
      const b = ascBox.get(a.id);
      if (!b) return;
      ascBackgrounds.push({
        ascId: a.id,
        cls: c.name.toLowerCase(),
        frame: `class${c.name}:Class${i}`,
        cx: (b.minX + b.maxX) / 2,
        cy: (b.minY + b.maxY) / 2,
      });
    });
  });

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
    // Hide ascendancy-start spokes, edges crossing between an ascendancy and
    // the rest of the tree (e.g. Pathfinder's "Path of the X" connectors), and
    // edges to mastery nodes (which are not rendered). Kept in adjacency for
    // pathing; just not drawn.
    if (
      a.kind === "ascStart" ||
      b.kind === "ascStart" ||
      a.kind === "mastery" ||
      b.kind === "mastery" ||
      a.ascendancyId !== b.ascendancyId
    )
      edge.hidden = true;
    // tag intra-ascendancy edges so they can be offset to centre when selected
    if (a.ascendancyId && a.ascendancyId === b.ascendancyId) edge.asc = a.ascendancyId;

    if (e.orbit && typeof e.orbitX === "number" && typeof e.orbitY === "number") {
      // shift the orbit centre with the wheel for relocated ascendancy edges
      const sh = a.ascendancyId && a.ascendancyId === b.ascendancyId ? ascShift.get(a.ascendancyId) : undefined;
      const cx = e.orbitX + (sh?.dx ?? 0);
      const cy = e.orbitY + (sh?.dy ?? 0);
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
    bounds: { minX, minY, maxX, maxY },
    ascBackgrounds,
    classStart,
    ascStart,
    classOverrides,
    adjacency,
  };
}
