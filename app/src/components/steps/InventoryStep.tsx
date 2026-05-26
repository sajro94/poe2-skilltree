import { memo } from "react";
import type { BuildInventorySlot } from "../../lib/buildFile";
import { usePoeDb } from "../../lib/poedb";

interface Props {
  inventory: BuildInventorySlot[];
  setInventory: (inv: BuildInventorySlot[]) => void;
  version: string;
}

// inventory_id values per the .build format (best-effort PoE2 slot ids).
const SLOTS: { id: string; label: string }[] = [
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

function InventoryStep({ inventory, setInventory }: Props) {
  const db = usePoeDb();
  const byId: Record<string, BuildInventorySlot> = {};
  for (const s of inventory) byId[s.inventory_id] = s;

  const update = (id: string, field: "unique" | "hint", val: string) => {
    const merged: BuildInventorySlot = { ...(byId[id] ?? { inventory_id: id }), [field]: val };
    const next = inventory.filter((s) => s.inventory_id !== id);
    if (merged.unique?.trim() || merged.hint?.trim()) next.push(merged);
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
        {SLOTS.map((slot) => (
          <div className="inv-slot" key={slot.id}>
            <span className="inv-slot__label">{slot.label}</span>
            <input
              className="inv-slot__field"
              list="poedb-uniques"
              placeholder="unique item…"
              value={byId[slot.id]?.unique ?? ""}
              onChange={(e) => update(slot.id, "unique", e.target.value)}
            />
            <input
              className="inv-slot__field hint"
              placeholder="hint (optional)"
              value={byId[slot.id]?.hint ?? ""}
              onChange={(e) => update(slot.id, "hint", e.target.value)}
            />
          </div>
        ))}
      </div>

      {db.uniques.length === 0 && (
        <p className="step__hint">Item autocomplete unavailable — type names freely.</p>
      )}
    </div>
  );
}

export default memo(InventoryStep);
