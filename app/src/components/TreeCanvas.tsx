import { memo, useEffect, useRef } from "react";
import type { Camera } from "../lib/camera";
import type { AtlasSet } from "../lib/atlas";
import type { ParsedTree, TreeNode, VersionDiff, NodeOverride } from "../types";
import { renderTree, pickNode, type RenderOpts } from "../render/draw";
import { previewAllocation, type Tag } from "../lib/buildState";

const EMPTY_KEYS: Set<string> = new Set();

export interface FocusTarget {
  x: number;
  y: number;
  zoom?: number;
  nonce: number;
}

interface Props {
  tree: ParsedTree;
  atlases: AtlasSet;
  camera: Camera;
  diff: VersionDiff | null;
  diffOn: boolean;
  searchHits: Set<string>;
  focusKey: string | null;
  selectedClass: number | null;
  selectedAsc: string | null;
  ascPrefixForClass: string | null;
  overrides: Map<string, NodeOverride> | null;
  allocated: Set<string>;
  weaponTag: Map<string, 1 | 2>;
  ascOffset: { dx: number; dy: number } | null;
  alloc: Map<string, Tag>;
  ascAlloc: Set<string>;
  mode: Tag;
  focusTarget: FocusTarget | null;
  onHover: (node: TreeNode | null, clientX: number, clientY: number) => void;
  onPick: (node: TreeNode | null) => void;
}

function TreeCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const optsRef = useRef<Props>(props);
  optsRef.current = props;
  // Any React re-render (prop/state change) schedules exactly one redraw.
  props.camera.dirty = true;

  const animTarget = useRef<FocusTarget | null>(null);
  const lastNonce = useRef<number>(-1);

  // pointer state
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragging = useRef(false);
  const moved = useRef(false);
  const pinchDist = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    const cam = props.camera;
    if (import.meta.env.DEV) (window as unknown as { __cam: typeof cam }).__cam = cam;
    let raf = 0;
    let stop = false;

    // Adaptive backing-store resolution: full DPR when zoomed in (crisp
    // sprites), reduced when zoomed out (detail is invisible, so spend ~4x
    // fewer pixels). Resized only when the bucket changes, not every frame.
    const dprRef = { current: 1 };
    const targetDpr = () => {
      const full = Math.min(window.devicePixelRatio || 1, 2);
      return cam.zoom < 0.1 ? Math.min(full, 1) : full;
    };
    const applyDpr = () => {
      const dpr = dprRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    };
    const resize = () => {
      dprRef.current = targetDpr();
      applyDpr();
      const firstFit = cam.vw <= 1;
      cam.setViewport(window.innerWidth, window.innerHeight);
      if (firstFit) cam.fit(optsRef.current.tree.bounds);
    };
    resize();
    window.addEventListener("resize", resize);

    // Wheel + trackpad pinch (fires wheel with ctrlKey). Non-passive so we can
    // preventDefault and capture it for the tree instead of the browser page.
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.pow(1.0015, -e.deltaY * (e.ctrlKey ? 2.2 : 1));
      cam.zoomAt(factor, e.clientX, e.clientY);
      animTarget.current = null;
    };
    canvas.addEventListener("wheel", onWheelNative, { passive: false });

    // Ctrl/Cmd +/-/0 → zoom the tree, not the browser.
    const onKeyZoom = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        cam.zoomAt(1.3, cx, cy);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        cam.zoomAt(1 / 1.3, cx, cy);
      } else if (e.key === "0") {
        e.preventDefault();
        cam.fit(optsRef.current.tree.bounds);
      }
    };
    window.addEventListener("keydown", onKeyZoom, { passive: false });

    const loop = (t: number) => {
      if (stop) return;
      const p = optsRef.current;
      // handle focus animation
      if (p.focusTarget && p.focusTarget.nonce !== lastNonce.current) {
        lastNonce.current = p.focusTarget.nonce;
        animTarget.current = p.focusTarget;
      }
      const tgt = animTarget.current;
      if (tgt) {
        cam.x += (tgt.x - cam.x) * 0.18;
        cam.y += (tgt.y - cam.y) * 0.18;
        if (tgt.zoom) cam.zoom += (tgt.zoom - cam.zoom) * 0.18;
        cam.dirty = true;
        const close =
          Math.hypot(tgt.x - cam.x, tgt.y - cam.y) < 3 &&
          (!tgt.zoom || Math.abs(tgt.zoom - cam.zoom) < 0.002);
        if (close) animTarget.current = null;
      }
      // Switch backing resolution if the zoom bucket changed.
      const td = targetDpr();
      if (Math.abs(td - dprRef.current) > 0.01) {
        dprRef.current = td;
        applyDpr();
        cam.dirty = true;
      }
      // Render only when something changed — idle frames cost nothing.
      if (cam.dirty) {
        cam.dirty = false;
        const dpr = dprRef.current;
        const ro: RenderOpts = {
          dpr,
          diff: p.diff,
          diffOn: p.diffOn,
          searchHits: p.searchHits,
          focusKey: p.focusKey,
          hoverKey: hoverKey.current,
          selectedClass: p.selectedClass,
          selectedAsc: p.selectedAsc,
          ascPrefixForClass: p.ascPrefixForClass,
          overrides: p.overrides,
          allocated: p.allocated,
          weaponTag: p.weaponTag,
          ascOffset: p.ascOffset,
          previewKeys: previewRef.current?.keys ?? EMPTY_KEYS,
          previewTag: previewRef.current?.tag ?? 0,
          time: t,
        };
        renderTree(ctx, cam, p.tree, p.atlases, ro);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("wheel", onWheelNative);
      window.removeEventListener("keydown", onKeyZoom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoverKey = useRef<string | null>(null);
  const previewRef = useRef<{ keys: Set<string>; tag: Tag } | null>(null);
  const tapSel = useRef<string | null>(null); // touch: node tapped once (tap again to allocate)
  const downPos = useRef<{ x: number; y: number } | null>(null);

  // Show a node's details + preview path (the touch equivalent of mouse hover).
  const inspect = (hit: ReturnType<typeof pickNode>, clientX: number, clientY: number) => {
    const p = optsRef.current;
    hoverKey.current = hit ? hit.key : null;
    const pv =
      hit &&
      previewAllocation(
        p.tree,
        { selectedClass: p.selectedClass, selectedAsc: p.selectedAsc, mode: p.mode, alloc: p.alloc, ascAlloc: p.ascAlloc },
        hit
      );
    previewRef.current = pv ? { keys: new Set(pv.keys), tag: pv.tag } : null;
    p.onHover(hit, clientX, clientY);
    p.camera.dirty = true;
  };

  // ---- input ----
  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events / no active pointer */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragging.current = true;
      moved.current = false;
      downPos.current = { x: e.clientX, y: e.clientY };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    animTarget.current = null;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cam = optsRef.current.camera;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      // pinch zoom
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        cam.zoomAt(dist / pinchDist.current, mx, my);
      }
      pinchDist.current = dist;
      moved.current = true;
      return;
    }

    if (dragging.current && prev) {
      // Only start panning once the finger/mouse moves past a slop radius, so a
      // tap (with normal finger jitter) isn't consumed as a drag.
      if (!moved.current && downPos.current) {
        const tot = Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y);
        if (tot > 10) moved.current = true;
      }
      if (moved.current) {
        cam.panByScreen(e.clientX - prev.x, e.clientY - prev.y);
        previewRef.current = null;
        hoverKey.current = null;
        tapSel.current = null;
        optsRef.current.onHover(null, 0, 0);
      }
      return;
    }

    // hover hit-test — redraw only when the hovered node actually changes
    const wx = cam.screenToWorldX(e.clientX);
    const wy = cam.screenToWorldY(e.clientY);
    const p = optsRef.current;
    const hit = pickNode(p.tree, wx, wy, p.selectedAsc, p.ascOffset);
    const newKey = hit ? hit.key : null;
    if (newKey !== hoverKey.current) {
      hoverKey.current = newKey;
      // preview the path this node would allocate
      const pv = hit
        ? previewAllocation(
            p.tree,
            { selectedClass: p.selectedClass, selectedAsc: p.selectedAsc, mode: p.mode, alloc: p.alloc, ascAlloc: p.ascAlloc },
            hit
          )
        : null;
      previewRef.current = pv ? { keys: new Set(pv.keys), tag: pv.tag } : null;
      cam.dirty = true;
    }
    p.onHover(hit, e.clientX, e.clientY);
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (pointers.current.size === 0) {
      if (dragging.current && !moved.current) {
        const p = optsRef.current;
        const cam = p.camera;
        const wx = cam.screenToWorldX(e.clientX);
        const wy = cam.screenToWorldY(e.clientY);
        const hit = pickNode(p.tree, wx, wy, p.selectedAsc, p.ascOffset);
        if (e.pointerType === "mouse") {
          // mouse: hover already shows details, so a click allocates directly
          p.onPick(hit);
        } else if (!hit) {
          // touch on empty space: dismiss the inspector
          tapSel.current = null;
          inspect(null, 0, 0);
        } else if (tapSel.current === hit.key) {
          // touch: second tap on the same node confirms allocation
          p.onPick(hit);
          tapSel.current = null;
          inspect(hit, e.clientX, e.clientY); // refresh details for the new state
        } else {
          // touch: first tap shows details + preview path (no allocation yet)
          tapSel.current = hit.key;
          inspect(hit, e.clientX, e.clientY);
        }
      }
      dragging.current = false;
      moved.current = false;
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className={"tree-canvas" + (dragging.current ? " dragging" : "")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    />
  );
}

export default memo(TreeCanvas);
