import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isPobExport } from "../lib/pobDecode";

interface Props {
  open: boolean;
  onClose: () => void;
  onPobString: (s: string) => Promise<void>;
  onFile: (f: File) => void;
}

export default function PobImportModal({ open, onClose, onPobString, onFile }: Props) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDecode = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    setWarnings([]);
    setLoading(true);
    try {
      await onPobString(trimmed);
      // success: parent closes us
    } catch (e) {
      setError((e as Error).message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [value, onPobString]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) {
        onFile(f);
        e.target.value = "";
        setValue("");
        setError(null);
        setWarnings([]);
      }
    },
    [onFile],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Auto-detect & auto-decode on paste if it looks like PoB
    const pasted = e.clipboardData.getData("text");
    if (isPobExport(pasted)) {
      // let state update first, then trigger decode
      setTimeout(() => {
        setValue(pasted);
      }, 0);
    }
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    setValue("");
    setError(null);
    setWarnings([]);
    onClose();
  }, [loading, onClose]);

  const isPob = isPobExport(value.trim());

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="pob-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* modal */}
          <div className="pob-modal-wrap">
          <motion.div
            className="pob-modal panel"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label="Import Build"
          >
            <div className="pob-modal__header">
              <span className="pob-modal__title">Import Build</span>
              <button className="pob-modal__close" onClick={handleClose} disabled={loading} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="pob-modal__section-label">Path of Building export string</div>
            <textarea
              className="pob-modal__textarea"
              placeholder={"Paste a PoB export string here…\n(starts with eN…)"}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onPaste={handlePaste}
              spellCheck={false}
              disabled={loading}
            />

            {error && <div className="pob-modal__error">{error}</div>}

            {warnings.length > 0 && (
              <div className="pob-modal__warnings">
                {warnings.map((w, i) => (
                  <div key={i} className="pob-modal__warn-line">
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}

            <div className="pob-modal__actions">
              <button
                className="ca-btn primary"
                onClick={handleDecode}
                disabled={!isPob || loading}
              >
                {loading ? "Decoding…" : "Import PoB"}
              </button>

              <span className="pob-modal__divider">or</span>

              <button
                className="ca-btn"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
              >
                Open .build file
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".build,application/json"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <div className="pob-modal__hint">
              PoB export strings start with <code>eN</code> and can be copied from{" "}
              <em>Path of Building → Export</em>.
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
