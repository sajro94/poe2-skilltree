import { memo } from "react";
import { levelParts, makeLevel, type BuildInventorySlot } from "../../lib/buildFile";
import { usePoeDb } from "../../lib/poedb";
import MarkupEditor from "../MarkupEditor";

interface Props {
  inventory: BuildInventorySlot[];
  setInventory: (inv: BuildInventorySlot[]) => void;
  selectedAsc: string | null;
}

// inventory_id values per the .build format (best-effort PoE2 slot ids).
const BASE_SLOTS: { id: string; label: string }[] = [
  { id: "Weapon1", label: "Weapon — Set I" },
  { id: "Weapon2", label: "Off-hand — Set I" },
  { id: "Weapon1Swap", label: "Weapon — Set II" },
  { id: "Weapon2Swap", label: "Off-hand — Set II" },
  { id: "Helmet", label: "Helmet" },
  { id: "BodyArmour", label: "Body Armour" },
  { id: "Gloves", label: "Gloves" },
  { id: "Boots", label: "Boots" },
  { id: "Amulet", label: "Amulet" },
  { id: "Ring1", label: "Ring 1" },
  { id: "Ring2", label: "Ring 2" },
  { id: "Belt", label: "Belt" },
];

function InventoryStep({ inventory, setInventory, selectedAsc }: Props) {
  const db = usePoeDb();
  // Ritualist (Huntress3) can equip a third ring.
  const slots =
    selectedAsc === "Huntress3"
      ? [...BASE_SLOTS.slice(0, 11), { id: "Ring3", label: "Ring 3" }, ...BASE_SLOTS.slice(11)]
      : BASE_SLOTS;
  const byId: Record<string, BuildInventorySlot> = {};
  for (const s of inventory) byId[s.inventory_id] = s;

  const update = (id: string, p: Partial<BuildInventorySlot>) => {
    const merged: BuildInventorySlot = { ...(byId[id] ?? { inventory_id: id }), ...p };
    const next = inventory.filter((s) => s.inventory_id !== id);
    if (merged.unique?.trim() || merged.hint?.trim() || merged.level_interval != null) next.push(merged);
    setInventory(next);
  };

  return (
    <div className="panel step step--inv">
      <div className="step__title">Inventory</div>
      <datalist id="poedb-uniques">
        {db.uniques.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <div className="inv-grid">
        {slots.map((slot) => {
          const s = byId[slot.id];
          const hasContent = !!(s?.unique?.trim() || s?.hint?.trim());
          return (
            <div className="inv-slot-block" key={slot.id}>
              <div className="inv-slot">
                <span className="inv-slot__label">{slot.label}</span>
                <input
                  className="inv-slot__field"
                  list="poedb-uniques"
                  placeholder="unique item…"
                  value={s?.unique ?? ""}
                  onChange={(e) => update(slot.id, { unique: e.target.value })}
                />
                <input
                  className="lvl-field"
                  placeholder="lvl"
                  title="Start level (optional)"
                  value={levelParts(s?.level_interval)[0]}
                  onChange={(e) =>
                    update(slot.id, { level_interval: makeLevel(e.target.value, levelParts(s?.level_interval)[1]) })
                  }
                />
                <input
                  className="lvl-field"
                  placeholder="to"
                  title="End level (optional)"
                  value={levelParts(s?.level_interval)[1]}
                  onChange={(e) =>
                    update(slot.id, { level_interval: makeLevel(levelParts(s?.level_interval)[0], e.target.value) })
                  }
                />
              </div>
              {hasContent && (
                <MarkupEditor
                  value={s?.hint ?? ""}
                  onChange={(v) => update(slot.id, { hint: v })}
                  placeholder="hint (optional) — right-click to format"
                  rows={1}
                />
              )}
            </div>
          );
        })}
      </div>

      {db.uniques.length === 0 && (
        <p className="step__hint">Item autocomplete unavailable — type names freely.</p>
      )}
    </div>
  );
}

export default memo(InventoryStep);
