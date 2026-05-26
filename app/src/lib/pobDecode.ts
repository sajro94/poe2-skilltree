// PoB export string decoder: Base64url → zlib inflate → UTF-8 XML

export function isPobExport(s: string): boolean {
  const trimmed = s.trim();
  // PoB exports start with eN (zlib magic after base64) and are long
  return /^eN[A-Za-z0-9+/=_-]{50,}$/.test(trimmed);
}

async function zlibInflate(bytes: Uint8Array): Promise<Uint8Array> {
  // "deflate" = zlib format (RFC 1950) — handles 78 9C / 78 DA / 78 01 headers
  const ds = new DecompressionStream("deflate");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  writer.close();

  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function b64UrlToBytes(s: string): Uint8Array {
  // PoB uses base64url (- and _ variants); convert to standard base64
  const b64 = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decode a PoB export string into a parsed XML Document. */
export async function decodePob(s: string): Promise<Document> {
  let bytes: Uint8Array;
  try {
    bytes = b64UrlToBytes(s);
  } catch {
    throw new Error("Invalid Base64 — not a PoB export string");
  }

  // Validate zlib magic (78 9C, 78 DA, or 78 01)
  if (bytes.length < 4 || bytes[0] !== 0x78) {
    throw new Error("Missing zlib header — decoded data is not a PoB payload");
  }

  let xml: Uint8Array;
  try {
    xml = await zlibInflate(bytes);
  } catch {
    throw new Error("zlib decompression failed — corrupt or truncated PoB string");
  }

  const text = new TextDecoder("utf-8").decode(xml);

  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");

  const parseErr = doc.querySelector("parsererror");
  if (parseErr) {
    throw new Error("XML parse error: " + (parseErr.textContent ?? "").slice(0, 120));
  }

  const rootTag = doc.documentElement.tagName;
  if (rootTag !== "PathOfBuilding" && rootTag !== "PathOfBuilding2") {
    throw new Error('Unexpected root element "' + rootTag + '" — expected PathOfBuilding or PathOfBuilding2');
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Raw section extraction
// ---------------------------------------------------------------------------

export interface PobBuildSection {
  className: string;
  ascendClassName: string;
  level: number;
  mainSkill?: string;
}

export interface PobGem {
  nameSpec: string;
  level: number;
  quality: number;
  enabled: boolean;
  skillEnabled: boolean;
  skillId: string; // "support_xxx" for PoE2 support gems; empty string if absent
}

export interface PobSkillGroup {
  enabled: boolean;
  slot: string;
  gems: PobGem[];
}

export interface PobTreeSpec {
  treeVersion: string;
  classId: number;
  ascendClassId: number;
  url: string;
  nodes: string;          // space-separated allocated node IDs (PoB2 direct format)
  weaponSet1Nodes: string; // nodes exclusive to weapon set 1 (tag = 1)
  weaponSet2Nodes: string; // nodes exclusive to weapon set 2 (tag = 2)
}

export interface PobItem {
  text: string;  // raw item text block
  slot: string;  // slot ID from ItemSet (e.g. "Ring1", "Belt"); empty if unknown
}

export interface PobData {
  build: PobBuildSection;
  treeSpec: PobTreeSpec | null;
  skillGroups: PobSkillGroup[];
  notes: string;
  items: PobItem[];
}

function attr(el: Element | null, name: string, fallback = ""): string {
  return el?.getAttribute(name) ?? fallback;
}

export function extractPobData(doc: Document): PobData {
  const root = doc.documentElement;

  // <Build>
  const buildEl = root.querySelector("Build");
  const build: PobBuildSection = {
    className: attr(buildEl, "className"),
    ascendClassName: attr(buildEl, "ascendClassName"),
    level: parseInt(attr(buildEl, "level", "1"), 10) || 1,
    mainSkill: attr(buildEl, "mainSkill") || undefined,
  };

  // <Tree> → active <Spec>
  const treeEl = root.querySelector("Tree");
  let treeSpec: PobTreeSpec | null = null;
  if (treeEl) {
    const activeIdx = Math.max(1, parseInt(attr(treeEl, "activeSpec", "1"), 10));
    const specs = Array.from(treeEl.querySelectorAll("Spec"));
    const spec = specs[activeIdx - 1] ?? specs[0] ?? null;
    if (spec) {
      const urlEl = spec.querySelector("URL");
      const url = (urlEl?.textContent ?? attr(spec, "URL")).trim();
      // Weapon set nodes live in <WeaponSet1 nodes="…"/> and <WeaponSet2 nodes="…"/>
      // child elements of <Spec> (comma-separated numeric IDs)
      const ws1El = spec.querySelector("WeaponSet1");
      const ws2El = spec.querySelector("WeaponSet2");
      treeSpec = {
        treeVersion: attr(spec, "treeVersion"),
        classId: parseInt(attr(spec, "classId", "0"), 10),
        ascendClassId: parseInt(attr(spec, "ascendClassId", "0"), 10),
        url,
        nodes: attr(spec, "nodes"),
        weaponSet1Nodes: ws1El ? attr(ws1El, "nodes") : "",
        weaponSet2Nodes: ws2El ? attr(ws2El, "nodes") : "",
      };
    }
  }

  // <Skills> — PoB2 may nest skills inside <SkillSet> elements
  const skillsEl = root.querySelector("Skills");
  const skillGroups: PobSkillGroup[] = [];
  if (skillsEl) {
    // Resolve which skill set to read (active set, or fall back to first)
    let searchRoot: Element = skillsEl;
    const skillSets = skillsEl.querySelectorAll("SkillSet");
    if (skillSets.length > 0) {
      const activeSetId = attr(skillsEl, "activeSkillSet", "1");
      let active: Element | null = null;
      for (const ss of skillSets) {
        if (attr(ss, "id") === activeSetId) { active = ss; break; }
      }
      searchRoot = active ?? skillSets[0];
    }

    for (const sg of searchRoot.querySelectorAll("Skill")) {
      const enabled = attr(sg, "enabled", "true") !== "false";
      const slot = attr(sg, "slot");
      const gems: PobGem[] = [];
      for (const g of sg.querySelectorAll("Gem")) {
        gems.push({
          nameSpec: attr(g, "nameSpec"),
          level: parseInt(attr(g, "level", "20"), 10) || 20,
          quality: parseInt(attr(g, "quality", "0"), 10),
          enabled: attr(g, "enabled", "true") !== "false",
          skillEnabled: attr(g, "skillEnabled", "true") !== "false",
          skillId: attr(g, "skillId"),
        });
      }
      if (gems.length > 0) skillGroups.push({ enabled, slot, gems });
    }
  }

  // <Notes>
  const notesEl = root.querySelector("Notes");
  const notes = notesEl?.textContent?.trim() ?? "";

  // <Items> — read active ItemSet to get slot assignments per item id
  const itemsEl = root.querySelector("Items");
  const items: PobItem[] = [];
  if (itemsEl) {
    // Build itemId → slot name map from the active ItemSet
    const activeSetId = attr(itemsEl, "activeItemSet", "1");
    const slotByItemId = new Map<string, string>();
    const itemSets = itemsEl.querySelectorAll("ItemSet");
    let activeSet: Element | null = null;
    for (const is of itemSets) {
      if (attr(is, "id") === activeSetId) { activeSet = is; break; }
    }
    if (!activeSet && itemSets.length > 0) activeSet = itemSets[0];
    if (activeSet) {
      for (const slotEl of activeSet.querySelectorAll("Slot")) {
        const itemId = attr(slotEl, "itemId");
        const slotName = attr(slotEl, "name");
        if (itemId && slotName) slotByItemId.set(itemId, slotName);
      }
    }

    for (const item of itemsEl.querySelectorAll("Item")) {
      const text = item.textContent?.trim();
      if (!text) continue;
      const id = attr(item, "id");
      items.push({ text, slot: slotByItemId.get(id) ?? "" });
    }
  }

  return { build, treeSpec, skillGroups, notes, items };
}
