import { memo, useState } from "react";
import { createPortal } from "react-dom";
import MarkupText from "./MarkupText";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
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

// Textarea with a right-click formatting menu (font/colour) that wraps the
// selection as <tag>{ … }, plus a live markup preview. Reused for passive
// notes, skill/support additional_text, and inventory hints.
function MarkupEditor({ value, onChange, placeholder, rows = 2 }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; start: number; end: number } | null>(null);

  const openMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const ta = e.currentTarget;
    setMenu({ x: e.clientX, y: e.clientY, start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 });
  };

  const apply = (tag: string) => {
    if (!menu) return;
    const { start, end } = menu;
    const sel = value.slice(start, end) || "text";
    onChange(value.slice(0, start) + `<${tag}>{ ${sel} }` + value.slice(end));
    setMenu(null);
  };

  return (
    <div className="mk-editor">
      <textarea
        className="note-item__input"
        rows={rows}
        value={value}
        placeholder={placeholder ?? "type a note — select text and right-click to style it"}
        onChange={(e) => onChange(e.target.value)}
        onContextMenu={openMenu}
      />
      {value.trim() && (
        <div className="note-item__preview">
          <MarkupText text={value} />
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

export default memo(MarkupEditor);
