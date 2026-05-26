import { memo, useState } from "react";
import { createPortal } from "react-dom";
import MarkupText from "./MarkupText";

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

const FONTS: { tag: string; label: string; style: React.CSSProperties }[] = [
  { tag: "b", label: "Bold", style: { fontWeight: 700 } },
  { tag: "i", label: "Italic", style: { fontStyle: "italic" } },
  { tag: "u", label: "Underline", style: { textDecoration: "underline" } },
  { tag: "s", label: "Small", style: { fontSize: "0.85em" } },
  { tag: "l", label: "Large", style: { fontSize: "1.1em" } },
];

const SWATCHES: [string, string][] = [
  ["red", "#e5554e"],
  ["orange", "#e08a3c"],
  ["yellow", "#e6c84f"],
  ["green", "#5ec46a"],
  ["blue", "#5b9be0"],
  ["indigo", "#7a74e0"],
  ["violet", "#b573e0"],
  ["gold", "#e8c87e"],
  ["bronze", "#cd7f32"],
  ["silver", "#c8c8c8"],
  ["grey", "#9e978a"],
  ["white", "#f0ead9"],
];

interface Menu {
  x: number;
  y: number;
  key: string;
  start: number;
  end: number;
}

function NotesPanel({ nodes, notes, setNote }: Props) {
  const [tab, setTab] = useState<"asc" | "main">("asc");
  const [menu, setMenu] = useState<Menu | null>(null);
  const asc = nodes.filter((n) => n.asc);
  const main = nodes.filter((n) => !n.asc);
  const shown = tab === "asc" ? asc : main;

  const openMenu = (e: React.MouseEvent<HTMLTextAreaElement>, key: string) => {
    e.preventDefault();
    const ta = e.currentTarget;
    setMenu({ x: e.clientX, y: e.clientY, key, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
  };

  const apply = (tag: string) => {
    if (!menu) return;
    const { key, start, end } = menu;
    const v = notes[key] ?? "";
    const sel = v.slice(start, end) || "text";
    setNote(key, v.slice(0, start) + `<${tag}>{ ${sel} }` + v.slice(end));
    setMenu(null);
  };

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
          {shown.map((n) => {
            const val = notes[n.key] ?? "";
            return (
              <div className="note-item" key={n.key}>
                <div className="note-item__name">{n.name}</div>
                <textarea
                  className="note-item__input"
                  rows={2}
                  value={val}
                  placeholder="type a note — select text and right-click to style it"
                  onChange={(e) => setNote(n.key, e.target.value)}
                  onContextMenu={(e) => openMenu(e, n.key)}
                />
                {val && (
                  <div className="note-item__preview">
                    <MarkupText text={val} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {menu &&
        createPortal(
          <>
            <div
              className="note-menu__backdrop"
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              className="note-menu"
              style={{
                left: Math.min(menu.x, window.innerWidth - 190),
                top: Math.min(menu.y, window.innerHeight - 200),
              }}
            >
              <div className="note-menu__label">Font</div>
              <div className="note-menu__fonts">
                {FONTS.map((f) => (
                  <button key={f.tag} style={f.style} onClick={() => apply(f.tag)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="note-menu__label">Colour</div>
              <div className="note-menu__swatches">
                {SWATCHES.map(([name, hex]) => (
                  <button
                    key={name}
                    className="note-swatch"
                    style={{ background: hex }}
                    title={name}
                    onClick={() => apply(name)}
                  />
                ))}
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

export default memo(NotesPanel);
