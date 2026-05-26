import type { TreeNode, DiffEntry, NodeOverride } from "../types";
import { cleanStat, KIND_LABEL } from "../lib/text";
import { DIFF_COLORS } from "../lib/diff";

interface Props {
  node: TreeNode;
  x: number;
  y: number;
  diff: DiffEntry | undefined;
  diffOn: boolean;
  override?: NodeOverride;
  className?: string;
}

const DIFF_LABEL: Record<string, string> = {
  added: "New in 0.5",
  removed: "Removed in 0.5",
  stats: "Reworked in 0.5",
  renamed: "Renamed in 0.5",
};

export default function Tooltip({ node, x, y, diff, diffOn, override, className }: Props) {
  const left = Math.min(x + 20, window.innerWidth - 360);
  const top = Math.min(y + 20, window.innerHeight - 280);
  const kindClass =
    node.kind === "keystone" ? "k-keystone" : node.kind.includes("otable") ? "k-notable" : "";
  const showDiff = diffOn && diff && diff.status !== "removed";

  // When a class is selected, some shared start nodes show a class-specific variant.
  const name = override?.name || node.name || "Unnamed";
  const stats = override?.stats ?? node.stats;

  return (
    <div className={`tooltip ${kindClass}`} style={{ left, top }}>
      <div className="tooltip__name">{name}</div>
      <div className="tooltip__kind">
        {KIND_LABEL[node.kind]}
        {override ? ` · ${className} variant` : node.ascendancyId ? ` · ${node.ascendancyId}` : ""}
      </div>
      {stats.map((s, i) =>
        cleanStat(s)
          .split("\n")
          .map((line, j) => (
            <div className="tooltip__stat" key={`${i}-${j}`}>
              {line}
            </div>
          ))
      )}
      {node.stats.length === 0 && node.kind === "mastery" && (
        <div className="tooltip__stat" style={{ color: "var(--ink-faint)" }}>
          Mastery — grants a choice of bonuses.
        </div>
      )}
      {node.flavourText.length > 0 && (
        <div className="tooltip__flavour">{node.flavourText.join(" ")}</div>
      )}

      {showDiff && (
        <div className="tooltip__diff">
          <span
            className="tooltip__diff-tag"
            style={{
              background: DIFF_COLORS[diff!.status] + "22",
              color: DIFF_COLORS[diff!.status],
              border: `1px solid ${DIFF_COLORS[diff!.status]}55`,
            }}
          >
            {DIFF_LABEL[diff!.status]}
          </span>
          {diff!.status === "renamed" && (
            <div className="tooltip__old">{diff!.oldName}</div>
          )}
          {diff!.status === "stats" && diff!.oldStats && (
            <>
              {diff!.oldStats.map((s, i) => (
                <div className="tooltip__old" key={i}>
                  {cleanStat(s)}
                </div>
              ))}
              <div style={{ height: 6 }} />
              {diff!.newStats!.map((s, i) => (
                <div className="tooltip__new" key={i}>
                  {cleanStat(s)}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
