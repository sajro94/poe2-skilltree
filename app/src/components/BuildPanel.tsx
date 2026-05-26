import { memo } from "react";
import type { Tag } from "../lib/buildState";

interface Props {
  hasClass: boolean;
  mainUsed: number;
  budget: number;
  bonus: number;
  ascUsed: number;
  ascBudget: number;
  mode: Tag;
  set1: number;
  set2: number;
  swapMax: number;
  setMode: (m: Tag) => void;
  setBaseBudget: (n: number) => void;
  onClear: () => void;
}

function BuildPanel({
  hasClass,
  mainUsed,
  budget,
  bonus,
  ascUsed,
  ascBudget,
  mode,
  set1,
  set2,
  swapMax,
  setMode,
  setBaseBudget,
  onClear,
}: Props) {
  return (
    <div className="panel build">
      <div className="build__stat">
        <span className="build__label">Passives</span>
        <span className={"build__val" + (mainUsed > budget ? " over" : "")}>
          {mainUsed}
          <span className="build__slash">/</span>
          <input
            className="build__budget"
            type="number"
            value={budget - bonus}
            min={0}
            onChange={(e) => setBaseBudget(Math.max(0, parseInt(e.target.value || "0", 10)))}
            title="Base passive points (campaign + levels). Editable."
          />
          {bonus > 0 && <span className="build__bonus">+{bonus}</span>}
        </span>
      </div>

      <div className="build__sep" />

      <div className="build__stat">
        <span className="build__label">Ascendancy</span>
        <span className={"build__val" + (ascUsed > ascBudget ? " over" : "")}>
          {ascUsed}
          <span className="build__slash">/</span>
          {ascBudget}
        </span>
      </div>

      <div className="build__sep" />

      <div className="build__stat">
        <span className="build__label">Weapon Swap</span>
        <div className="build__seg">
          <button className={mode === 0 ? "active" : ""} onClick={() => setMode(0)} title="Shared — allocate / remove">
            Shared
          </button>
          <button
            className={"set1" + (mode === 1 ? " active" : "")}
            onClick={() => setMode(1)}
            title="Allocate Set I (red)"
          >
            Set I
          </button>
          <button
            className={"set2" + (mode === 2 ? " active" : "")}
            onClick={() => setMode(2)}
            title="Allocate Set II (green)"
          >
            Set II
          </button>
        </div>
        <span className="build__sets">
          <span className="s1" title="Set I points">
            {set1}
            <span className="cap">/{swapMax}</span>
          </span>
          <span className="s2" title="Set II points">
            {set2}
            <span className="cap">/{swapMax}</span>
          </span>
        </span>
      </div>

      <div className="build__sep" />

      <button className="build__clear" onClick={onClear} title="Reset allocation" aria-label="Reset">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
    </div>
  );
}

export default memo(BuildPanel);
