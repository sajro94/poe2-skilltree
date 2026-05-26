// Maps decoded PoB data onto the app's ParsedBuild / PlannerDoc shapes.
import { reach } from "./allocation";
import type { ParsedTree } from "../types";
import type { ParsedBuild } from "./buildFile";
import type { PlannerDoc, BuildSkill, BuildInventorySlot } from "./buildFile";
import type { Tag } from "./buildState";
import { decodePob, extractPobData } from "./pobDecode";
import type { PobSkillGroup, PobGem, PobItem } from "./pobDecode";

// ---------------------------------------------------------------------------
// Class / ascendancy lookup
// ---------------------------------------------------------------------------

function classIndexByName(tree: ParsedTree, name: string): number | null {
  const lower = name.toLowerCase();
  const idx = tree.classes.findIndex((c) => c.name.toLowerCase() === lower);
  return idx >= 0 ? idx : null;
}

function ascIdByName(tree: ParsedTree, classIdx: number, ascName: string): string | null {
  if (!ascName || ascName === "None") return null;
  const lower = ascName.toLowerCase();
  const cls = tree.classes[classIdx];
  if (!cls) return null;
  const found = cls.ascendancies.find((a) => a && a.name && a.name.toLowerCase() === lower);
  return found?.id ?? null;
}

// ---------------------------------------------------------------------------
// Passive tree URL decode
// ---------------------------------------------------------------------------

function skillNumToKeyMap(tree: ParsedTree): Map<number, string> {
  const m = new Map<number, string>();
  for (const n of tree.nodeList) {
    const num = parseInt(n.key, 10);
    if (!isNaN(num)) m.set(num, n.key);
  }
  return m;
}

// Maps node semantic ID ("attack35") → tree key
function nodeIdToKeyMap(tree: ParsedTree): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of tree.nodeList) if (n.id) m.set(n.id, n.key);
  return m;
}

function b64UrlToBytes(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function decodeTreeUrl(
  url: string,
  skillToKey: Map<number, string>,
  tree: ParsedTree,
): { alloc: Map<string, Tag>; ascAlloc: Set<string> } {
  const empty = { alloc: new Map<string, Tag>(), ascAlloc: new Set<string>() };

  // Extract the encoded blob from the tree URL path segment
  const m = url.match(/passive-skill-tree\/[^/]+\/([A-Za-z0-9_=+/-]+)/);
  if (!m) return empty;

  const bytes = b64UrlToBytes(m[1]);
  if (!bytes || bytes.length < 8) return empty;

  // Binary format (PoE1 tree URL, version >= 4):
  //   byte 0:  version
  //   bytes 1-3: unknown / flags
  //   byte 4:  character class index
  //   byte 5:  ascendancy class index
  //   byte 6:  0
  //   then 2-byte big-endian node IDs until end
  const headerSize = 7;

  const alloc = new Map<string, Tag>();
  const ascAlloc = new Set<string>();

  for (let i = headerSize; i + 1 < bytes.length; i += 2) {
    const nodeId = (bytes[i] << 8) | bytes[i + 1];
    if (nodeId === 0) continue;
    const key = skillToKey.get(nodeId);
    if (!key) continue;
    const node = tree.nodes.get(key);
    if (!node) continue;
    if (node.ascendancyId) ascAlloc.add(key);
    else alloc.set(key, 0 as Tag);
  }

  return { alloc, ascAlloc };
}

// ---------------------------------------------------------------------------
// Weapon-set node override (PoB2 weaponSet1Nodes / weaponSet2Nodes attributes)
// ---------------------------------------------------------------------------

/**
 * Marks nodes that belong to a specific weapon set (tag 1 or 2).
 * The node list may contain numeric IDs (same encoding as the nodes attribute)
 * or semantic string IDs (e.g. "attack35"). Both are tried.
 */
function applyWeaponSetNodes(
  nodesStr: string,
  tag: 1 | 2,
  skillToKey: Map<number, string>,
  idToKey: Map<string, string>,
  alloc: Map<string, Tag>,
): void {
  for (const part of nodesStr.trim().split(/[\s,]+/).filter(Boolean)) {
    const num = parseInt(part, 10);
    const key = !isNaN(num) ? skillToKey.get(num) : idToKey.get(part);
    if (key) alloc.set(key, tag);
  }
}

// ---------------------------------------------------------------------------
// Direct node ID list parsing (PoB2 exports nodes="12345 67890 …")
// ---------------------------------------------------------------------------

function parseTreeNodes(
  nodesStr: string,
  skillToKey: Map<number, string>,
  tree: ParsedTree,
): { alloc: Map<string, Tag>; ascAlloc: Set<string> } {
  const alloc = new Map<string, Tag>();
  const ascAlloc = new Set<string>();

  for (const part of nodesStr.trim().split(/[\s,]+/)) {
    const nodeId = parseInt(part, 10);
    if (isNaN(nodeId) || nodeId === 0) continue;
    const key = skillToKey.get(nodeId);
    if (!key) continue;
    const node = tree.nodes.get(key);
    if (!node) continue;
    if (node.ascendancyId) ascAlloc.add(key);
    else alloc.set(key, 0 as Tag);
  }

  return { alloc, ascAlloc };
}

// ---------------------------------------------------------------------------
// Class inference from allocation (fallback)
// ---------------------------------------------------------------------------

function inferClassFromAlloc(tree: ParsedTree, alloc: Map<string, Tag>): number | null {
  if (alloc.size === 0) return null;
  let best: number | null = null;
  let bestHits = -1;
  for (const [idx, start] of tree.classStart) {
    const reachable = reach(tree.adjacency, start.key, (k) => alloc.has(k));
    let hits = 0;
    alloc.forEach((_t, k) => reachable.has(k) && hits++);
    if (hits > bestHits) {
      bestHits = hits;
      best = idx;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Skill group → BuildSkill[]
// ---------------------------------------------------------------------------

function isSupport(gem: PobGem): boolean {
  // PoE2: skillId starts with "support" (e.g. "support_fork", "SupportFork")
  if (gem.skillId) return /^support/i.test(gem.skillId);
  // PoE1 fallback: display name contains the word "support"
  return /\bsupport\b/i.test(gem.nameSpec);
}

function mapSkillGroups(groups: PobSkillGroup[]): BuildSkill[] {
  const out: BuildSkill[] = [];

  for (const grp of groups) {
    if (!grp.enabled) continue;

    const allEnabled = grp.gems.filter((g) => g.enabled && g.nameSpec);
    if (allEnabled.length === 0) continue;

    // Determine if we have reliable classification data
    const hasClassification =
      allEnabled.some((g) => !!g.skillId) || allEnabled.some((g) => /\bsupport\b/i.test(g.nameSpec));

    let active: PobGem[];
    let supports: PobGem[];

    if (hasClassification) {
      active = allEnabled.filter((g) => !isSupport(g));
      supports = allEnabled.filter((g) => isSupport(g));
      // If every gem was classified as support, treat the first as active
      if (active.length === 0) {
        active = [allEnabled[0]];
        supports = allEnabled.slice(1);
      }
    } else {
      // No classification data available: first gem is active, rest are supports
      active = [allEnabled[0]];
      supports = allEnabled.slice(1);
    }

    for (const gem of active) {
      out.push({
        id: gem.nameSpec,
        level_interval: gem.level,
        supports: supports.map((s) => ({ id: s.nameSpec, level_interval: s.level })),
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Item text → inventory slots
// ---------------------------------------------------------------------------

// PoB item text format:
//   Rarity: UNIQUE\nName\nBase Type\n...\nSlot: Belt\n
const ITEM_SLOT_KEYWORDS: [RegExp, string][] = [
  [/helmet|helm|crown|mask/i, "Helmet"],
  [/gloves|gauntlets/i, "Gloves"],
  [/boots|greaves|slippers/i, "Boots"],
  [/body\s*armou?r|chest|plate|vest|tunic/i, "BodyArmour"],
  [/amulet|talisman|torc/i, "Amulet"],
  [/\bring\b/i, "Ring1"],
  [/belt|sash/i, "Belt"],
  [/shield|buckler|focus|quiver/i, "Weapon2"],
  [/bow|wand|staff|sword|axe|mace|dagger|claw|sceptre|spear|crossbow|flail|quarter/i, "Weapon1"],
];

// Normalise PoB2 slot names to our inventory_id values:
// "Ring 1" → "Ring1", "Body Armour" → "BodyArmour", "Weapon 1 Swap" → "Weapon1Swap"
function normaliseSlot(s: string): string {
  return s.replace(/\s+/g, "");
}

function guessSlotFromText(lines: string[]): string | null {
  // Prefer explicit "Slot:" line (PoB2 always includes this)
  const slotLine = lines.find((l) => /^Slot:/i.test(l));
  if (slotLine) return normaliseSlot(slotLine.replace(/^Slot:/i, "").trim());

  // Fallback: infer from base type (line 2 after rarity + name)
  const baseType = lines[2] ?? "";
  for (const [re, slot] of ITEM_SLOT_KEYWORDS) {
    if (re.test(baseType)) return slot;
  }
  return null;
}

function mapItems(items: PobItem[]): BuildInventorySlot[] {
  const slotOccupied = new Set<string>();
  const out: BuildInventorySlot[] = [];

  for (const item of items) {
    const lines = item.text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) continue;

    // PoB2 exports "Rarity: UNIQUE" — compare case-insensitively
    const rarityLine = lines.find((l) => /^Rarity:/i.test(l)) ?? "";
    const rarity = rarityLine.replace(/^Rarity:/i, "").trim().toLowerCase();
    const name = lines.find((l) => !/^(Rarity:|Slot:|Item Level:|Crafted:|Implicits:|Explicits:|Corrupted|Mirrored|--------)/i.test(l) && l.trim())
      ?? lines[1];

    // Prefer slot from ItemSet XML; fall back to Slot: line / base type
    const slot = item.slot
      ? normaliseSlot(item.slot)
      : guessSlotFromText(lines);

    if (!slot || !name?.trim()) continue;

    // Ring1/Ring2/Ring3 deduplication
    let finalSlot = slot;
    if (slot === "Ring1" && slotOccupied.has("Ring1")) finalSlot = "Ring2";
    if (slot === "Ring1" && slotOccupied.has("Ring2")) finalSlot = "Ring3";

    if (slotOccupied.has(finalSlot)) continue;
    slotOccupied.add(finalSlot);

    out.push({
      inventory_id: finalSlot,
      unique: rarity === "unique" ? name.trim() : undefined,
      hint: rarity !== "unique" ? name.trim() : undefined,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface PobImportResult extends ParsedBuild {
  warnings: string[];
}

export async function importPobString(pobString: string, tree: ParsedTree): Promise<PobImportResult> {
  const warnings: string[] = [];

  const xmlDoc = await decodePob(pobString);
  const data = extractPobData(xmlDoc);

  // --- Class ---
  let selectedClass = classIndexByName(tree, data.build.className);

  // --- Passive tree ---
  const skillToKey = skillNumToKeyMap(tree);
  const idToKey = nodeIdToKeyMap(tree);
  let alloc = new Map<string, Tag>();
  let ascAlloc = new Set<string>();

  // PoB2 exports a space-separated node list on <Spec nodes="…">; prefer it
  // over URL binary parsing which can fail for PoE2 tree versions.
  if (data.treeSpec?.nodes) {
    const decoded = parseTreeNodes(data.treeSpec.nodes, skillToKey, tree);
    alloc = decoded.alloc;
    ascAlloc = decoded.ascAlloc;
  }

  // Fall back to URL binary decode when node list is absent or yielded nothing
  if (alloc.size === 0 && ascAlloc.size === 0 && data.treeSpec?.url) {
    const decoded = decodeTreeUrl(data.treeSpec.url, skillToKey, tree);
    alloc = decoded.alloc;
    ascAlloc = decoded.ascAlloc;
  }

  if (!data.treeSpec) {
    warnings.push("No passive tree found in the PoB export.");
  } else if (alloc.size === 0 && ascAlloc.size === 0) {
    warnings.push("Passive tree decoded but no matching nodes found — node IDs may not align with the current PoE2 tree version.");
  }

  // Override weapon-set tags so swap passives don't count against the shared budget
  if (data.treeSpec?.weaponSet1Nodes) {
    applyWeaponSetNodes(data.treeSpec.weaponSet1Nodes, 1, skillToKey, idToKey, alloc);
  }
  if (data.treeSpec?.weaponSet2Nodes) {
    applyWeaponSetNodes(data.treeSpec.weaponSet2Nodes, 2, skillToKey, idToKey, alloc);
  }

  // Fallback: infer class from passive allocations
  if (selectedClass === null) {
    selectedClass = inferClassFromAlloc(tree, alloc);
    if (selectedClass !== null) {
      warnings.push(`Class "${data.build.className}" not found in tree — inferred from passive allocation.`);
    }
  }

  // --- Ascendancy ---
  let selectedAsc: string | null = null;
  if (selectedClass !== null) {
    selectedAsc = ascIdByName(tree, selectedClass, data.build.ascendClassName);
    if (!selectedAsc && data.build.ascendClassName && data.build.ascendClassName !== "None") {
      warnings.push(`Ascendancy "${data.build.ascendClassName}" not found — may not exist in the current tree version.`);
    }
  }

  // --- Skills ---
  const skills = mapSkillGroups(data.skillGroups);

  // --- Inventory ---
  const inventory = mapItems(data.items);

  // --- Doc ---
  const doc: PlannerDoc = {
    name: data.build.mainSkill ? `${data.build.className} — ${data.build.mainSkill}` : data.build.className,
    author: "",
    description: data.notes.slice(0, 1000),
    inventory,
    skills,
    notes: {},
  };

  return { selectedClass, selectedAsc, alloc, ascAlloc, doc, warnings };
}
