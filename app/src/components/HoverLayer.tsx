import { forwardRef, useImperativeHandle, useState } from "react";
import Tooltip from "./Tooltip";
import type { TreeNode, VersionDiff, NodeOverride } from "../types";

export interface HoverHandle {
  setHover: (node: TreeNode | null, x: number, y: number) => void;
}

interface Props {
  diff: VersionDiff | null;
  diffOn: boolean;
  overrides: Map<string, NodeOverride> | null;
  className?: string;
}

/**
 * Owns hover state so the rest of the app never re-renders on mousemove.
 * Re-renders only when the *hovered node* changes (enter / leave / switch),
 * not on every pixel of movement.
 */
const HoverLayer = forwardRef<HoverHandle, Props>(function HoverLayer(
  { diff, diffOn, overrides, className },
  ref
) {
  const [h, setH] = useState<{ node: TreeNode; x: number; y: number } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      setHover: (node, x, y) =>
        setH((prev) => {
          const prevKey = prev?.node.key ?? null;
          const nextKey = node?.key ?? null;
          if (prevKey === nextKey) return prev; // same target → bail, no re-render
          return node ? { node, x, y } : null;
        }),
    }),
    []
  );

  if (!h) return null;
  return (
    <Tooltip
      node={h.node}
      x={h.x}
      y={h.y}
      diff={diff?.byKey.get(h.node.key)}
      diffOn={diffOn}
      override={overrides?.get(h.node.key)}
      className={className}
    />
  );
});

export default HoverLayer;
