import { memo } from "react";
import { motion } from "framer-motion";
import type { TreeNode, VersionDiff } from "../types";
import { KIND_LABEL } from "../lib/text";
import { DIFF_COLORS } from "../lib/diff";

interface Props {
  query: string;
  setQuery: (q: string) => void;
  results: TreeNode[];
  total: number;
  diff: VersionDiff | null;
  diffOn: boolean;
  onPick: (n: TreeNode) => void;
}

const KIND_COLOR: Record<string, string> = {
  keystone: "#e0913f",
  notable: "#d9c184",
  ascNotable: "#c9a9e0",
  jewel: "#5fd6cd",
  mastery: "#c8a35a",
};

function SearchPanel({ query, setQuery, results, total, diff, diffOn, onPick }: Props) {
  return (
    <motion.div
      className="panel search"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
    >
      <div className="search__field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search passives, notables, keystones…"
          autoComplete="off"
          spellCheck={false}
        />
        {query && <span className="search__count">{total}</span>}
      </div>

      {query && results.length > 0 && (
        <div className="search__results">
          {results.map((n) => {
            const d = diffOn ? diff?.byKey.get(n.key) : undefined;
            const dot = d ? DIFF_COLORS[d.status] : KIND_COLOR[n.kind] || "var(--ink-faint)";
            return (
              <div className="search__row" key={n.key} onClick={() => onPick(n)}>
                <span className="search__dot" style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
                <span className="search__row-name">{n.name}</span>
                <span className="search__row-kind">{KIND_LABEL[n.kind]}</span>
              </div>
            );
          })}
        </div>
      )}
      {query && results.length === 0 && (
        <div className="search__results" style={{ color: "var(--ink-faint)", padding: "8px" }}>
          No matches.
        </div>
      )}
    </motion.div>
  );
}

export default memo(SearchPanel);
