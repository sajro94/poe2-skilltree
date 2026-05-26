import type { Camera } from "../lib/camera";
import type { AtlasSet } from "../lib/atlas";
import type { ParsedTree, TreeNode, NodeKind, VersionDiff, NodeOverride } from "../types";
import { DIFF_COLORS } from "../lib/diff";

const FRAME: Record<NodeKind, string | null> = {
  keystone: "frame:KeystoneFrameUnallocated",
  notable: "frame:NotableFrameUnallocated",
  ascNotable: "frame:AscendancyFrameNotableUnallocated",
  ascStart: "frame:AscendancyStartNode",
  jewel: "frame:JewelFrameUnallocated",
  ascNormal: "frame:AscendancyFrameNormalUnallocated",
  small: "frame:PSSkillFrame",
  mastery: null,
};

const FRAME_ALLOCATED: Record<NodeKind, string | null> = {
  keystone: "frame:KeystoneFrameAllocated",
  notable: "frame:NotableFrameAllocated",
  ascNotable: "frame:AscendancyFrameNotableAllocated",
  ascStart: "frame:AscendancyStartNode",
  jewel: "frame:JewelFrameAllocated",
  ascNormal: "frame:AscendancyFrameNormalAllocated",
  small: "frame:PSSkillFrameActive",
  mastery: null,
};

const ALLOC_EDGE = "#f1d6a0";
const ALLOC_DOT = "#f4dca6";
// weapon-set colours: Set I (red), Set II (green)
const SET_COLOR: Record<1 | 2, string> = { 1: "#ec5a52", 2: "#54c46a" };

const DOT: Record<NodeKind, { color: string; r: number }> = {
  keystone: { color: "#e0913f", r: 60 },
  notable: { color: "#d9c184", r: 44 },
  ascNotable: { color: "#c9a9e0", r: 44 },
  ascStart: { color: "#cbb27a", r: 40 },
  jewel: { color: "#5fd6cd", r: 38 },
  ascNormal: { color: "#8b86a8", r: 26 },
  small: { color: "#8f8a76", r: 24 },
  mastery: { color: "#c8a35a", r: 34 },
};

const ICON_PREFIX: Record<NodeKind, string[]> = {
  keystone: ["keystoneActive", "notableActive", "normalActive"],
  ascNotable: ["notableActive", "keystoneActive", "normalActive"],
  notable: ["notableActive", "normalActive", "keystoneActive"],
  jewel: ["normalActive", "notableActive"],
  ascNormal: ["normalActive", "notableActive"],
  ascStart: ["normalActive", "notableActive"],
  small: ["normalActive", "notableActive"],
  mastery: [],
};

// Resolved icon-atlas keys are stable per node; cache them across frames.
const iconCache = new WeakMap<TreeNode, string | null>();
function resolveIconKey(set: AtlasSet, n: TreeNode): string | null {
  const hit = iconCache.get(n);
  if (hit !== undefined) return hit;
  let key: string | null = null;
  if (n.icon) {
    for (const p of ICON_PREFIX[n.kind]) {
      const k = `${p}:${n.icon}`;
      if (set.skills.has(k)) {
        key = k;
        break;
      }
    }
  }
  iconCache.set(n, key);
  return key;
}

export interface RenderOpts {
  dpr: number;
  diff: VersionDiff | null;
  diffOn: boolean;
  searchHits: Set<string>;
  focusKey: string | null;
  hoverKey: string | null;
  selectedClass: number | null;
  selectedAsc: string | null;
  ascPrefixForClass: string | null;
  overrides: Map<string, NodeOverride> | null;
  allocated: Set<string>;
  weaponTag: Map<string, 1 | 2>;
  ascOffset: { dx: number; dy: number } | null; // shifts the selected ascendancy to centre
  previewKeys: Set<string>; // path a hovered node would allocate
  previewTag: 0 | 1 | 2;
  time: number;
}

const TAG_COLOR = (t: 0 | 1 | 2) => (t === 1 ? SET_COLOR[1] : t === 2 ? SET_COLOR[2] : ALLOC_EDGE);

export function nodeWorldRadius(n: TreeNode): number {
  return DOT[n.kind].r * 1.4;
}

export function renderTree(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  tree: ParsedTree,
  set: AtlasSet,
  opts: RenderOpts
) {
  const { dpr } = opts;
  const W = cam.vw;
  const H = cam.vh;
  const z = cam.zoom;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));

  const cssPx = (px: number) => px / z;

  // visible world rect (with margin) for culling
  const margin = 220 / z;
  const vx0 = cam.x - W / 2 / z - margin;
  const vx1 = cam.x + W / 2 / z + margin;
  const vy0 = cam.y - H / 2 / z - margin;
  const vy1 = cam.y + H / 2 / z + margin;
  const inView = (x: number, y: number) => x > vx0 && x < vx1 && y > vy0 && y < vy1;

  const dimAsc = !!opts.selectedAsc;
  const ascPrefix = opts.ascPrefixForClass;
  const alphaFor = (n: TreeNode): number => {
    if (dimAsc) {
      if (n.ascendancyId === opts.selectedAsc) return 1;
      return n.ascendancyId ? 0.08 : 0.22;
    }
    if (ascPrefix && n.ascendancyId && !n.ascendancyId.startsWith(ascPrefix)) return 0.12;
    return 1;
  };

  // The selected ascendancy is drawn shifted into the empty centre of the tree.
  const selAsc = opts.selectedAsc;
  const off = opts.ascOffset;
  const ax = (n: TreeNode) => (off && n.ascendancyId === selAsc ? n.x + off.dx : n.x);
  const ay = (n: TreeNode) => (off && n.ascendancyId === selAsc ? n.y + off.dy : n.y);

  // ---- connections: one Path2D per alpha bucket, stroked once ----------
  const hasAlloc = opts.allocated.size > 0;
  const hasPreview = opts.previewKeys.size > 0;
  const edgeBuckets = new Map<number, Path2D>();
  const allocPaths: [Path2D, Path2D, Path2D] = [new Path2D(), new Path2D(), new Path2D()];
  const previewPath = new Path2D();
  const previewNodePath = new Path2D();
  const addSeg = (
    p: Path2D,
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    arc: (typeof tree.edges)[number]["arc"],
    odx: number,
    ody: number
  ) => {
    if (arc) {
      const cx = arc.cx + odx;
      const cy = arc.cy + ody;
      p.moveTo(cx + arc.r * Math.cos(arc.a0), cy + arc.r * Math.sin(arc.a0));
      p.arc(cx, cy, arc.r, arc.a0, arc.a1, arc.ccw);
    } else {
      p.moveTo(fx, fy);
      p.lineTo(tx, ty);
    }
  };
  for (const e of tree.edges) {
    if (e.hidden) continue; // ascendancy-start spokes
    const offEdge = off && e.asc === selAsc;
    const odx = offEdge ? off!.dx : 0;
    const ody = offEdge ? off!.dy : 0;
    const fx = e.fx + odx;
    const fy = e.fy + ody;
    const tx = e.tx + odx;
    const ty = e.ty + ody;
    if (!inView(fx, fy) && !inView(tx, ty)) continue;
    if (hasAlloc && opts.allocated.has(e.fromKey) && opts.allocated.has(e.toKey)) {
      const t = opts.weaponTag.get(e.toKey) ?? opts.weaponTag.get(e.fromKey) ?? 0;
      addSeg(allocPaths[t], fx, fy, tx, ty, e.arc, odx, ody);
      continue;
    }
    if (hasPreview) {
      const fp = opts.previewKeys.has(e.fromKey);
      const tp = opts.previewKeys.has(e.toKey);
      if ((fp || tp) && (fp || opts.allocated.has(e.fromKey)) && (tp || opts.allocated.has(e.toKey))) {
        addSeg(previewPath, fx, fy, tx, ty, e.arc, odx, ody);
        continue;
      }
    }
    const a = tree.nodes.get(e.fromKey)!;
    const b = tree.nodes.get(e.toKey)!;
    const al = Math.min(alphaFor(a), alphaFor(b));
    if (al < 0.02) continue;
    const bk = Math.round(al * 20) / 20;
    let p = edgeBuckets.get(bk);
    if (!p) edgeBuckets.set(bk, (p = new Path2D()));
    addSeg(p, fx, fy, tx, ty, e.arc, odx, ody);
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(150,124,72,0.55)";
  ctx.lineWidth = cssPx(1.4);
  for (const [al, path] of edgeBuckets) {
    ctx.globalAlpha = al * 0.5;
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
  if (hasAlloc) {
    ctx.lineWidth = cssPx(3);
    ctx.strokeStyle = ALLOC_EDGE;
    ctx.stroke(allocPaths[0]);
    ctx.strokeStyle = SET_COLOR[1];
    ctx.stroke(allocPaths[1]);
    ctx.strokeStyle = SET_COLOR[2];
    ctx.stroke(allocPaths[2]);
  }
  if (hasPreview) {
    ctx.save();
    ctx.strokeStyle = TAG_COLOR(opts.previewTag);
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = cssPx(2.5);
    ctx.setLineDash([cssPx(7), cssPx(6)]);
    ctx.stroke(previewPath);
    ctx.restore();
  }

  // ---- removed ghosts (diff overlay) — single batched path -------------
  if (opts.diffOn && opts.diff && opts.diff.removed.length) {
    const p = new Path2D();
    for (const r of opts.diff.removed) {
      const g = r.ghost!;
      if (!inView(g.x, g.y)) continue;
      const rad = DOT[g.kind].r;
      p.moveTo(g.x + rad, g.y);
      p.arc(g.x, g.y, rad, 0, Math.PI * 2);
      p.moveTo(g.x - rad * 0.6, g.y - rad * 0.6);
      p.lineTo(g.x + rad * 0.6, g.y + rad * 0.6);
    }
    ctx.strokeStyle = DIFF_COLORS.removed;
    ctx.lineWidth = cssPx(2);
    ctx.globalAlpha = 0.85;
    ctx.stroke(p);
    ctx.globalAlpha = 1;
  }

  // ---- nodes -----------------------------------------------------------
  const lodCutoff = 7; // css px
  const dotBuckets = new Map<string, { color: string; alpha: number; path: Path2D }>();
  const ringBuckets = new Map<string, Path2D>(); // diff/search rings by color
  type Single = { x: number; y: number; r: number };
  let focusRing: Single | null = null;
  let hoverRing: Single | null = null;

  const frameW = (key: string) => (set.frame.frames[key]?.w ?? 100) / set.frame.scale;

  for (const n of tree.nodeList) {
    if (n.kind === "mastery") continue; // masteries hidden per request
    const px = ax(n);
    const py = ay(n);
    if (!inView(px, py)) continue;
    const allocated = hasAlloc && opts.allocated.has(n.key);
    const al = allocated ? 1 : alphaFor(n);
    if (al < 0.02) continue;

    const frameKey = FRAME[n.kind];
    const natural = frameKey ? frameW(frameKey) : 80;
    const screenSize = natural * z;

    if (screenSize < lodCutoff) {
      const d = DOT[n.kind];
      if (allocated) {
        const wt = opts.weaponTag.get(n.key);
        const color = wt ? SET_COLOR[wt] : ALLOC_DOT;
        const bk = `alloc-${color}`;
        let b = dotBuckets.get(bk);
        if (!b) dotBuckets.set(bk, (b = { color, alpha: 1, path: new Path2D() }));
        const r = d.r * 1.25;
        b.path.moveTo(px + r, py);
        b.path.arc(px, py, r, 0, Math.PI * 2);
      } else {
        // Sub-pixel minor passives are visual noise when zoomed out — skip them.
        const dotPx = d.r * 2 * z;
        const minor = n.kind === "small" || n.kind === "ascNormal";
        if (!(minor && dotPx < 2)) {
          const bk = `${d.color}|${al}`;
          let b = dotBuckets.get(bk);
          if (!b) dotBuckets.set(bk, (b = { color: d.color, alpha: al, path: new Path2D() }));
          b.path.moveTo(px + d.r, py);
          b.path.arc(px, py, d.r, 0, Math.PI * 2);
        }
      }
    } else {
      ctx.globalAlpha = al;
      const ov = opts.overrides?.get(n.key);
      const ik =
        ov?.icon && set.skills.has(`normalActive:${ov.icon}`)
          ? `normalActive:${ov.icon}`
          : resolveIconKey(set, n);
      if (ik) set.skills.drawCentered(ctx, ik, px, py);
      const fk = allocated ? FRAME_ALLOCATED[n.kind] ?? frameKey : frameKey;
      if (fk) set.frame.drawCentered(ctx, fk, px, py);
      ctx.globalAlpha = 1;
    }

    // collect highlight rings (cheap; drawn batched below)
    const ringR = DOT[n.kind].r * 1.55;
    const de = opts.diffOn && opts.diff ? opts.diff.byKey.get(n.key) : undefined;
    if (de && de.status !== "removed") {
      const c = DIFF_COLORS[de.status];
      let p = ringBuckets.get(c);
      if (!p) ringBuckets.set(c, (p = new Path2D()));
      p.moveTo(px + ringR, py);
      p.arc(px, py, ringR, 0, Math.PI * 2);
    }
    if (opts.searchHits.has(n.key)) {
      const c = "#5fd6cd";
      let p = ringBuckets.get(c);
      if (!p) ringBuckets.set(c, (p = new Path2D()));
      const r = ringR * 1.12;
      p.moveTo(px + r, py);
      p.arc(px, py, r, 0, Math.PI * 2);
    }
    const wt = opts.weaponTag.get(n.key);
    if (wt) {
      const c = SET_COLOR[wt];
      let p = ringBuckets.get(c);
      if (!p) ringBuckets.set(c, (p = new Path2D()));
      const r = DOT[n.kind].r * 1.45;
      p.moveTo(px + r, py);
      p.arc(px, py, r, 0, Math.PI * 2);
    }
    if (hasPreview && opts.previewKeys.has(n.key)) {
      previewNodePath.moveTo(px + ringR, py);
      previewNodePath.arc(px, py, ringR, 0, Math.PI * 2);
    }
    if (opts.focusKey === n.key) focusRing = { x: px, y: py, r: ringR * 1.3 };
    else if (opts.hoverKey === n.key) hoverRing = { x: px, y: py, r: ringR * 1.1 };
  }

  // draw dot buckets
  for (const b of dotBuckets.values()) {
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = b.color;
    ctx.fill(b.path);
  }
  ctx.globalAlpha = 1;

  // draw highlight rings: 2-pass (wide faint + thin bright), no shadowBlur
  for (const [color, path] of ringBuckets) {
    ctx.strokeStyle = color;
    ctx.lineWidth = cssPx(6);
    ctx.globalAlpha = 0.16;
    ctx.stroke(path);
    ctx.lineWidth = cssPx(2);
    ctx.globalAlpha = 0.95;
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;

  if (hasPreview) {
    ctx.save();
    ctx.strokeStyle = TAG_COLOR(opts.previewTag);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = cssPx(2);
    ctx.setLineDash([cssPx(6), cssPx(5)]);
    ctx.stroke(previewNodePath);
    ctx.restore();
  }

  if (hoverRing) {
    ctx.strokeStyle = "#ece5d6";
    ctx.lineWidth = cssPx(2);
    ctx.beginPath();
    ctx.arc(hoverRing.x, hoverRing.y, hoverRing.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (focusRing) {
    ctx.save();
    ctx.strokeStyle = "#f1d6a0";
    ctx.lineWidth = cssPx(3.5);
    ctx.shadowColor = "#f1d6a0";
    ctx.shadowBlur = cssPx(20);
    ctx.beginPath();
    ctx.arc(focusRing.x, focusRing.y, focusRing.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Nearest node to a world point within its footprint (used for hover/pick). */
export function pickNode(
  tree: ParsedTree,
  wx: number,
  wy: number,
  selAsc: string | null,
  off: { dx: number; dy: number } | null
): TreeNode | null {
  let best: TreeNode | null = null;
  let bestD = Infinity;
  for (const n of tree.nodeList) {
    if (n.kind === "mastery") continue;
    const nx = off && n.ascendancyId === selAsc ? n.x + off.dx : n.x;
    const ny = off && n.ascendancyId === selAsc ? n.y + off.dy : n.y;
    const rr = nodeWorldRadius(n);
    const d = (nx - wx) ** 2 + (ny - wy) ** 2;
    if (d < rr * rr && d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}
