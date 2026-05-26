// PoE2 `.build` file (pathofexile.com/developer/docs/game). JSON authored here
// and dropped into the game's Preferences/BuildPlanner folder.
import { reach } from "./allocation";
import type { ParsedTree } from "../types";
import type { Tag } from "./buildState";

export type LevelInterval = number | number[]; // e.g. 12 or [0, 100]

export interface BuildInventorySlot {
  inventory_id: string;
  unique?: string;
  hint?: string;
  level_interval?: LevelInterval;
}

// Internal (planner) skill/support shape — supports are always objects here;
// export simplifies a support with no level to a bare id string.
export interface BuildSupport {
  id: string;
  level_interval?: LevelInterval;
  additional_text?: string;
}
export interface BuildSkill {
  id: string;
  level_interval?: LevelInterval;
  supports?: BuildSupport[];
  additional_text?: string;
}

/** split a level_interval into [start, end] strings for the two inputs */
export function levelParts(li?: LevelInterval): [string, string] {
  if (li == null) return ["", ""];
  if (Array.isArray(li)) return [li[0] != null ? String(li[0]) : "", li[1] != null ? String(li[1]) : ""];
  return [String(li), ""];
}

/** build a level_interval from start/end fields: [a,b], a single uint, or undefined */
export function makeLevel(startStr: string, endStr: string): LevelInterval | undefined {
  const a = startStr.trim() === "" ? undefined : parseInt(startStr, 10);
  const b = endStr.trim() === "" ? undefined : parseInt(endStr, 10);
  const av = a != null && !isNaN(a) ? a : undefined;
  const bv = b != null && !isNaN(b) ? b : undefined;
  if (av != null && bv != null) return [av, bv];
  if (av != null) return av;
  if (bv != null) return bv;
  return undefined;
}

export type BuildPassiveEntry = string | { id: string; weapon_set?: number; additional_text?: string };

// File shapes (supports may be bare ids or objects in a real .build).
type RawSupport = string | { id: string; level_interval?: LevelInterval; additional_text?: string };
interface RawSkill {
  id: string;
  level_interval?: LevelInterval;
  supports?: RawSupport[];
  additional_text?: string;
}

export interface BuildBody {
  name: string;
  author?: string;
  description?: string;
  ascendancy?: string;
  passives?: BuildPassiveEntry[];
  skills?: RawSkill[];
  inventory_slots?: BuildInventorySlot[];
}

// The docs describe a root object named `Build`; we emit { Build: {...} } and
// accept either that or a bare body on import.
export interface BuildFile {
  Build: BuildBody;
}

/** Editable metadata + gear/skills the wizard collects (passives live in the tree). */
export interface PlannerDoc {
  name: string;
  author: string;
  description: string;
  inventory: BuildInventorySlot[];
  skills: BuildSkill[];
  notes: Record<string, string>; // node key -> additional_text
}

export const emptyDoc = (): PlannerDoc => ({
  name: "",
  author: "",
  description: "",
  inventory: [],
  skills: [],
  notes: {},
});

function idToKeyMap(tree: ParsedTree): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of tree.nodeList) if (n.id) m.set(n.id, n.key);
  return m;
}

/** Assemble a `.build` file from current planner + tree state. */
export function exportBuild(
  tree: ParsedTree,
  alloc: Map<string, Tag>,
  ascAlloc: Set<string>,
  selectedAsc: string | null,
  doc: PlannerDoc
): BuildFile {
  const noteFor = (key: string) => doc.notes[key]?.trim();
  const passives: BuildPassiveEntry[] = [];
  for (const [key, tag] of alloc) {
    const id = tree.nodes.get(key)?.id;
    if (!id) continue;
    const note = noteFor(key);
    if (tag === 0 && !note) passives.push(id);
    else {
      const e: { id: string; weapon_set?: number; additional_text?: string } = { id };
      if (tag !== 0) e.weapon_set = tag;
      if (note) e.additional_text = note;
      passives.push(e);
    }
  }
  for (const key of ascAlloc) {
    const id = tree.nodes.get(key)?.id;
    if (!id) continue;
    const note = noteFor(key);
    passives.push(note ? { id, additional_text: note } : id);
  }

  const body: BuildBody = { name: doc.name.trim() || "Untitled Build" };
  if (doc.author.trim()) body.author = doc.author.trim();
  if (doc.description.trim()) body.description = doc.description.trim();
  if (selectedAsc) body.ascendancy = selectedAsc;
  if (passives.length) body.passives = passives;

  const skills: RawSkill[] = doc.skills
    .filter((s) => s.id.trim())
    .map((s) => {
      const out: RawSkill = { id: s.id.trim() };
      if (s.level_interval != null) out.level_interval = s.level_interval;
      const sup: RawSupport[] = (s.supports ?? [])
        .filter((x) => x.id.trim())
        .map((x) => {
          const o: { id: string; level_interval?: LevelInterval; additional_text?: string } = { id: x.id.trim() };
          if (x.level_interval != null) o.level_interval = x.level_interval;
          if (x.additional_text?.trim()) o.additional_text = x.additional_text.trim();
          return o.level_interval != null || o.additional_text ? o : o.id;
        });
      if (sup.length) out.supports = sup;
      if (s.additional_text?.trim()) out.additional_text = s.additional_text.trim();
      return out;
    });
  if (skills.length) body.skills = skills;

  const inv = doc.inventory.filter((s) => s.unique?.trim() || s.hint?.trim() || s.level_interval != null);
  if (inv.length) body.inventory_slots = inv;

  return { Build: body };
}

export interface ParsedBuild {
  selectedClass: number | null;
  selectedAsc: string | null;
  alloc: Map<string, Tag>;
  ascAlloc: Set<string>;
  doc: PlannerDoc;
}

/** Parse an imported `.build` into app state. Throws on malformed JSON. */
export function parseBuildFile(text: string, tree: ParsedTree): ParsedBuild {
  const json = JSON.parse(text);
  const body: BuildBody = json && json.Build ? json.Build : json;
  if (!body || typeof body !== "object") throw new Error("Not a build file");

  const idToKey = idToKeyMap(tree);
  const alloc = new Map<string, Tag>();
  const ascAlloc = new Set<string>();
  const notes: Record<string, string> = {};

  for (const entry of body.passives ?? []) {
    const id = typeof entry === "string" ? entry : entry.id;
    const ws = typeof entry === "string" ? 0 : entry.weapon_set ?? 0;
    const key = idToKey.get(id);
    if (!key) continue;
    if (tree.nodes.get(key)?.ascendancyId) ascAlloc.add(key);
    else alloc.set(key, (ws === 1 || ws === 2 ? ws : 0) as Tag);
    if (typeof entry !== "string" && entry.additional_text) notes[key] = entry.additional_text;
  }

  const selectedAsc = body.ascendancy ?? null;
  const selectedClass = inferClass(tree, selectedAsc, alloc);

  const doc: PlannerDoc = {
    name: body.name ?? "",
    author: body.author ?? "",
    description: body.description ?? "",
    inventory: Array.isArray(body.inventory_slots) ? body.inventory_slots : [],
    skills: (Array.isArray(body.skills) ? body.skills : []).map((s) => ({
      id: s.id,
      level_interval: s.level_interval,
      supports: (s.supports ?? []).map((x) =>
        typeof x === "string"
          ? { id: x }
          : { id: x.id, level_interval: x.level_interval, additional_text: x.additional_text }
      ),
      additional_text: s.additional_text,
    })),
    notes,
  };

  return { selectedClass, selectedAsc, alloc, ascAlloc, doc };
}

/** Class from the ascendancy prefix, else the class start that best reaches the allocation. */
function inferClass(tree: ParsedTree, asc: string | null, alloc: Map<string, Tag>): number | null {
  if (asc) {
    const m = asc.match(/^([A-Za-z]+)\d+$/);
    if (m) {
      const idx = tree.classes.findIndex((c) => c.name === m[1]);
      if (idx >= 0) return idx;
    }
  }
  if (alloc.size === 0) return null;
  let best: number | null = null;
  let bestHits = -1;
  for (const [idx, start] of tree.classStart) {
    const r = reach(tree.adjacency, start.key, (k) => alloc.has(k));
    let hits = 0;
    alloc.forEach((_t, k) => r.has(k) && hits++);
    if (hits > bestHits) {
      bestHits = hits;
      best = idx;
    }
  }
  return best;
}

/** Trigger a download of the build as `<name>.build`. */
export function downloadBuild(file: BuildFile): void {
  const name = (file.Build.name || "build").replace(/[^\w.-]+/g, "_");
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.build`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
