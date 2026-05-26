import { memo, useState } from "react";
import MarkupEditor from "./MarkupEditor";

interface NoteNode {
  key: string;
  name: string;
  asc: boolean;
}

interface Props {
  nodes: NoteNode[];
  notes: Record<string, string>;
  setNote: (key: string, text: string) => void;
}

function NotesPanel({ nodes, notes, setNote }: Props) {
  const [tab, setTab] = useState<"asc" | "main">("asc");
  const asc = nodes.filter((n) => n.asc);
  const main = nodes.filter((n) => !n.asc);
  const shown = tab === "asc" ? asc : main;

  return (
    <div className="panel notes-panel">
      <div className="panel__title">Passive Notes</div>
      <div className="notes-tabs">
        <button className={tab === "asc" ? "active" : ""} onClick={() => setTab("asc")}>
          Ascendancy <span className="notes-tabs__n">{asc.length}</span>
        </button>
        <button className={tab === "main" ? "active" : ""} onClick={() => setTab("main")}>
          Passives <span className="notes-tabs__n">{main.length}</span>
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="step__hint">
          {tab === "asc"
            ? "Allocate ascendancy notables to annotate them."
            : "Allocate notables or keystones to annotate them."}
        </p>
      ) : (
        <div className="notes-list">
          {shown.map((n) => (
            <div className="note-item" key={n.key}>
              <div className="note-item__name">{n.name}</div>
              <MarkupEditor value={notes[n.key] ?? ""} onChange={(v) => setNote(n.key, v)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(NotesPanel);
