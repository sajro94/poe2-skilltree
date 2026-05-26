import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClassInfo } from "../types";

interface Props {
  classes: ClassInfo[];
  selectedClass: number | null;
  selectedAsc: string | null;
  newAscIds: Set<string>;
  onSelectClass: (idx: number | null) => void;
  onSelectAsc: (id: string | null) => void;
}

const isPlayable = (c: ClassInfo) => c.ascendancies.some((a) => a && a.name);

function ClassPanel({
  classes,
  selectedClass,
  selectedAsc,
  newAscIds,
  onSelectClass,
  onSelectAsc,
}: Props) {
  const cls = selectedClass != null ? classes[selectedClass] : null;
  const ascendancies = cls ? cls.ascendancies.filter((a) => a && a.name) : [];

  return (
    <motion.div
      className="panel classes"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="panel__title">Class · Ascendancy</div>
      <div className="class-grid">
        {classes.map((c, i) => (
          <button
            key={c.name}
            className={
              "class-chip" +
              (selectedClass === i ? " active" : "") +
              (isPlayable(c) ? "" : " legacy")
            }
            onClick={() => onSelectClass(selectedClass === i ? null : i)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {ascendancies.length > 0 && (
          <motion.div
            className="asc-row"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            {ascendancies.map((a) => {
              const isNew = newAscIds.has(a.id);
              return (
                <div
                  key={a.id}
                  className={
                    "asc-chip" +
                    (selectedAsc === a.id ? " active" : "") +
                    (isNew ? " new" : "")
                  }
                  onClick={() => onSelectAsc(selectedAsc === a.id ? null : a.id)}
                >
                  <span className="asc-chip__name">{a.name}</span>
                  <span className="asc-chip__tag">{isNew ? "NEW IN 0.5" : a.id}</span>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default memo(ClassPanel);
