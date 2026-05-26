// Shapes mirrored from the exported data.json (only the fields we use).

export interface RawNode {
  id?: string;
  skill?: number;
  name?: string;
  icon?: string;
  isNotable?: boolean;
  isKeystone?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  isAscendancyStart?: boolean;
  ascendancyId?: string;
  classStartIndex?: number[];
  stats?: string[];
  flavourText?: string[];
  group?: number | string;
  orbit?: number;
  orbitIndex?: number;
  x?: number;
  y?: number;
  in?: string[];
  out?: string[];
  edges?: number[];
  grantedStrength?: number;
  grantedDexterity?: number;
  grantedIntelligence?: number;
  grantedPassivePoints?: number;
}

export interface RawGroup {
  x: number;
  y: number;
  orbits: number[];
  nodes: string[];
}

export interface RawEdge {
  from: number | string;
  to: number | string;
  orbit?: number;
  orbitX?: number;
  orbitY?: number;
}

export interface Ascendancy {
  id: string;
  name: string;
  image?: string;
  flavourText?: string;
}

export interface SkillOverride {
  id?: string;
  skill?: number;
  name: string;
  icon?: string;
  stats?: string[];
}

export interface ClassInfo {
  name: string;
  base_str: number;
  base_dex: number;
  base_int: number;
  image?: string;
  ascendancies: Ascendancy[];
  // Maps a shared start-area node id -> a skillOverrides id giving this class
  // its own variant of that node (e.g. Huntress turns a Projectile Damage
  // node into Attack Damage).
  overridePairs?: Record<string, number>;
}

export interface NodeOverride {
  name: string;
  stats: string[];
  icon?: string;
}

export interface RawData {
  tree: string;
  classes: ClassInfo[];
  groups: Record<string, RawGroup>;
  nodes: Record<string, RawNode>;
  edges: RawEdge[];
  jewelSlots: (number | string)[];
  skillOverrides?: Record<string, SkillOverride | SkillOverride[]>;
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export type NodeKind =
  | "keystone"
  | "notable"
  | "mastery"
  | "jewel"
  | "ascNotable"
  | "ascNormal"
  | "ascStart"
  | "small";

export interface TreeNode {
  key: string; // numeric skill id (dict key)
  id?: string;
  name: string;
  icon?: string;
  kind: NodeKind;
  ascendancyId?: string;
  classStartIndex?: number[];
  stats: string[];
  flavourText: string[];
  group?: number | string;
  orbit: number;
  x: number;
  y: number;
  grantedPassivePoints?: number;
}

export interface TreeEdge {
  fromKey: string;
  toKey: string;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  arc?: { cx: number; cy: number; r: number; a0: number; a1: number; ccw: boolean };
  hidden?: boolean; // spokes from an ascendancy start — not rendered
  asc?: string; // intra-ascendancy edge (for the centered-ascendancy offset)
}

export interface ParsedTree {
  version: string;
  nodes: Map<string, TreeNode>;
  nodeList: TreeNode[];
  edges: TreeEdge[];
  classes: ClassInfo[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  // skillId of the start node for each class index
  classStart: Map<number, TreeNode>;
  // first start node per ascendancyId
  ascStart: Map<string, TreeNode>;
  // per class index: node key -> class-specific override of that node
  classOverrides: Map<number, Map<string, NodeOverride>>;
  // undirected connectivity for pathfinding (node key -> neighbour keys)
  adjacency: Map<string, string[]>;
}

export type DiffStatus = "added" | "removed" | "stats" | "renamed";

export interface DiffEntry {
  status: DiffStatus;
  oldName?: string;
  newName?: string;
  oldStats?: string[];
  newStats?: string[];
  // present for removed nodes (taken from 0.4 so we can ghost-render them)
  ghost?: { x: number; y: number; name: string; kind: NodeKind };
}

export interface VersionDiff {
  byKey: Map<string, DiffEntry>;
  removed: DiffEntry[];
  counts: { added: number; removed: number; stats: number; renamed: number };
}
