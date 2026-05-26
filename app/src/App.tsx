import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Camera } from "./lib/camera";
import { loadAtlases, type AtlasSet } from "./lib/atlas";
import { loadTree } from "./lib/treeData";
import { computeDiff } from "./lib/diff";
import { buildReducer, initialBuild, ASC_BUDGET, SWAP_MAX, type Tag } from "./lib/buildState";
import type { ParsedTree, TreeNode, VersionDiff } from "./types";
import TreeCanvas, { type FocusTarget } from "./components/TreeCanvas";
import SearchPanel from "./components/SearchPanel";
import ClassPanel from "./components/ClassPanel";
import VersionPanel from "./components/VersionPanel";
import BuildPanel from "./components/BuildPanel";
import Controls from "./components/Controls";
import HoverLayer, { type HoverHandle } from "./components/HoverLayer";
import PlannerWizard from "./components/PlannerWizard";
import NotesPanel from "./components/NotesPanel";
import DetailsStep from "./components/steps/DetailsStep";
import InventoryStep from "./components/steps/InventoryStep";
import SkillsStep from "./components/steps/SkillsStep";
import {
  exportBuild,
  parseBuildFile,
  downloadBuild,
  emptyDoc,
  type PlannerDoc,
  type BuildInventorySlot,
  type BuildSkill,
} from "./lib/buildFile";
import { importPobString } from "./lib/pobImport";
import { isPobExport } from "./lib/pobDecode";
import PobImportModal from "./components/PobImportModal";

type Version = "0.5" | "0.4";
const WIZARD_STEPS = ["Details", "Passives", "Skills", "Inventory"];

export default function App() {
  const cameraRef = useRef(new Camera());
  const hoverRef = useRef<HoverHandle>(null);
  const trees = useRef<Record<Version, ParsedTree> | null>(null);
  const prog = useRef<Record<string, { l: number; t: number }>>({});
  const nonce = useRef(0);

  // load-time state (set once)
  const [ready, setReady] = useState(false);
  const [atlases, setAtlases] = useState<AtlasSet | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [newAscIds, setNewAscIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);

  // view state
  const [version, setVersionState] = useState<Version>("0.5");
  const [diffOn, setDiffOn] = useState(false);
  const [query, setQuery] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  // Panel visibility on mobile. Default false = "not manually opened"; CSS
  // shows panels on desktop regardless and hides them on mobile until a
  // `show-*` class is added by the edge toggles. This keeps the mobile default
  // purely CSS-media-driven (no reliance on JS innerWidth).
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  // PoB import modal
  const [pobModalOpen, setPobModalOpen] = useState(false);

  // planner mode (build wizard)
  const [planner, setPlanner] = useState(false);
  const [step, setStep] = useState(0);
  const [doc, setDoc] = useState<PlannerDoc>(emptyDoc());

  // all selection + build-planner state in one reducer
  const [build, dispatch] = useReducer(buildReducer, initialBuild);
  const { selectedClass, selectedAsc, mode, alloc, ascAlloc, baseBudget } = build;

  // ---- initial load ----
  useEffect(() => {
    const report = (k: string) => (l: number, t: number) => {
      prog.current[k] = { l, t };
      const vals = Object.values(prog.current);
      const tot = vals.reduce((s, v) => s + v.t, 0);
      const ld = vals.reduce((s, v) => s + v.l, 0);
      if (tot > 0) setProgress(Math.min(0.99, ld / tot));
    };
    (async () => {
      const [atl, t04, t05] = await Promise.all([
        loadAtlases(),
        loadTree("0.4", report("d04")),
        loadTree("0.5", report("d05")),
      ]);
      setProgress(1);
      trees.current = { "0.4": t04, "0.5": t05 };
      setAtlases(atl);
      setDiff(computeDiff(t04, t05));
      const ns = new Set<string>();
      t05.classes.forEach((c, i) => {
        c.ascendancies.forEach((a) => {
          if (!a || !a.name) return;
          const oc = t04.classes[i]?.ascendancies.find((x) => x && x.id === a.id);
          if (!oc || !oc.name || oc.name.startsWith("[DNT")) ns.add(a.id);
        });
      });
      setNewAscIds(ns);
      setReady(true);
    })();
  }, []);

  const tree = trees.current ? trees.current[version] : null;

  // ---- search ----
  const { results, hits } = useMemo(() => {
    if (!tree || query.trim().length < 1)
      return { results: [] as TreeNode[], hits: new Set<string>() };
    const q = query.toLowerCase();
    // With a class selected, match the class-specific override (the name/stats
    // actually shown on the tree) so search stays consistent with the display.
    const ov = selectedClass != null ? tree.classOverrides.get(selectedClass) ?? null : null;
    const out: TreeNode[] = [];
    for (const n of tree.nodeList) {
      if (n.kind === "mastery") continue; // masteries aren't rendered → don't match/highlight
      const o = ov?.get(n.key);
      const name = o?.name ?? n.name;
      const stats = o?.stats ?? n.stats;
      if (!name || name.startsWith("[DNT")) continue;
      if (name.toLowerCase().includes(q) || stats.some((s) => s.toLowerCase().includes(q))) {
        out.push(n);
      }
    }
    out.sort((a, b) => rank(b.kind) - rank(a.kind));
    return { results: out, hits: new Set(out.map((n) => n.key)) };
  }, [tree, query, selectedClass]);

  // ---- navigation ----
  const goTo = useCallback((x: number, y: number, zoom?: number) => {
    nonce.current++;
    setFocusTarget({ x, y, zoom, nonce: nonce.current });
  }, []);

  const resetView = useCallback(() => {
    const cam = cameraRef.current;
    const b = trees.current?.[version]?.bounds;
    if (!b) return;
    const fit = Math.min(cam.vw / (b.maxX - b.minX), cam.vh / (b.maxY - b.minY)) * 0.92;
    goTo((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, fit);
  }, [version, goTo]);

  const selectClass = useCallback(
    (idx: number | null) => {
      dispatch({ type: "selectClass", idx });
      const t = trees.current?.[version];
      const start = idx != null && t ? t.classStart.get(idx) : null;
      if (start) goTo(start.x, start.y, 0.13);
      else resetView();
    },
    [version, goTo, resetView]
  );

  const selectAsc = useCallback(
    (id: string | null) => {
      dispatch({ type: "selectAsc", id });
      const t = trees.current?.[version];
      if (id && t) {
        const start = t.ascStart.get(id);
        if (start) goTo(start.x, start.y, 0.4);
      }
    },
    [version, goTo]
  );

  const pickSearch = useCallback(
    (n: TreeNode) => {
      setFocusKey(n.key);
      goTo(n.x, n.y, 0.6);
    },
    [goTo]
  );

  const setVersion = useCallback((v: Version) => setVersionState(v), []);
  const toggleDiff = useCallback((b: boolean) => {
    setDiffOn(b);
    if (b) setVersionState("0.5"); // diff is expressed relative to 0.4 → view 0.5
  }, []);

  // click a node: allocate, or switch ascendancy / focus when not allocatable
  const handleNodeClick = useCallback(
    (node: TreeNode | null) => {
      if (!node) {
        setFocusKey(null);
        return;
      }
      const t = trees.current?.[version];
      if (!t) return;
      if (node.ascendancyId && selectedAsc !== node.ascendancyId) {
        selectAsc(node.ascendancyId);
        return;
      }
      if (!node.ascendancyId && selectedClass == null) {
        setFocusKey(node.key);
        return;
      }
      dispatch({ type: "clickNode", node, tree: t });
    },
    [version, selectedClass, selectedAsc, selectAsc]
  );

  const setMode = useCallback((m: Tag) => dispatch({ type: "setMode", mode: m }), []);
  const setBaseBudget = useCallback((n: number) => dispatch({ type: "setBudget", n }), []);
  const clearBuild = useCallback(() => dispatch({ type: "clear" }), []);

  // hover routes straight to HoverLayer — no App re-render per mousemove
  const onHover = useCallback((node: TreeNode | null, x: number, y: number) => {
    hoverRef.current?.setHover(node, x, y);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQuery("");
        setFocusKey(null);
        dispatch({ type: "selectClass", idx: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- planner ----
  const enterPlanner = useCallback(() => {
    dispatch({ type: "load", selectedClass: null, selectedAsc: null, alloc: new Map(), ascAlloc: new Set() });
    setDoc(emptyDoc());
    setStep(0);
    setPlanner(true);
  }, []);

  const exitPlanner = useCallback(() => setPlanner(false), []);

  // Edit an already-loaded build (e.g. just imported) in the planner wizard.
  const editBuild = useCallback(() => {
    setStep(0);
    setPlanner(true);
  }, []);

  const triggerImport = useCallback(() => setPobModalOpen(true), []);

  // Entering the Passives step: focus the class start so allocation can begin.
  const goToStep = useCallback(
    (s: number) => {
      setStep(s);
      if (s === 1) {
        const t = trees.current?.[version];
        const start = selectedClass != null && t ? t.classStart.get(selectedClass) : null;
        if (start) goTo(start.x, start.y, 0.42);
        else resetView();
      }
    },
    [version, selectedClass, goTo, resetView]
  );

  const setDocField = useCallback((field: "name" | "author" | "description", value: string) => {
    setDoc((d) => ({ ...d, [field]: value }));
  }, []);
  const setInventory = useCallback((inv: BuildInventorySlot[]) => setDoc((d) => ({ ...d, inventory: inv })), []);
  const setSkills = useCallback((sk: BuildSkill[]) => setDoc((d) => ({ ...d, skills: sk })), []);
  const setNote = useCallback(
    (key: string, text: string) => setDoc((d) => ({ ...d, notes: { ...d.notes, [key]: text } })),
    []
  );

  const onExport = useCallback(() => {
    const t = trees.current?.[version];
    if (!t) return;
    downloadBuild(exportBuild(t, alloc, ascAlloc, selectedAsc, doc));
  }, [version, alloc, ascAlloc, selectedAsc, doc]);

  const applyParsedBuild = useCallback(
    (parsed: { selectedClass: number | null; selectedAsc: string | null; alloc: Map<string, import("./lib/buildState").Tag>; ascAlloc: Set<string>; doc: PlannerDoc }, t: import("./types").ParsedTree) => {
      dispatch({
        type: "load",
        selectedClass: parsed.selectedClass,
        selectedAsc: parsed.selectedAsc,
        alloc: parsed.alloc,
        ascAlloc: parsed.ascAlloc,
      });
      setDoc(parsed.doc);
      const start = parsed.selectedClass != null ? t.classStart.get(parsed.selectedClass) : null;
      if (start) goTo(start.x, start.y, 0.3);
      else resetView();
    },
    [goTo, resetView]
  );

  const onImport = useCallback(
    async (file: File) => {
      const t = trees.current?.[version];
      if (!t) return;
      const text = await file.text();
      try {
        // Auto-detect: try PoB string first, fall back to .build JSON
        if (isPobExport(text.trim())) {
          const result = await importPobString(text.trim(), t);
          applyParsedBuild(result, t);
          if (result.warnings.length > 0) {
            console.warn("[PoB import]", result.warnings.join("\n"));
          }
        } else {
          const parsed = parseBuildFile(text, t);
          applyParsedBuild(parsed, t);
        }
      } catch (e) {
        alert("Could not read that file: " + (e as Error).message);
      }
    },
    [version, applyParsedBuild]
  );

  const onPobString = useCallback(
    async (s: string) => {
      const t = trees.current?.[version];
      if (!t) throw new Error("Tree not loaded yet");
      const result = await importPobString(s, t);
      applyParsedBuild(result, t);
      setPobModalOpen(false);
      // Surface warnings non-blocking after modal closes
      if (result.warnings.length > 0) {
        setTimeout(() => {
          console.warn("[PoB import warnings]\n" + result.warnings.join("\n"));
        }, 0);
      }
    },
    [version, applyParsedBuild]
  );

  // ---- derived ----
  const startKey =
    selectedClass != null && tree ? tree.classStart.get(selectedClass)?.key ?? null : null;

  const allocated = useMemo(() => {
    const s = new Set<string>();
    if (!tree) return s;
    alloc.forEach((_t, k) => s.add(k));
    ascAlloc.forEach((k) => s.add(k));
    if (startKey) s.add(startKey);
    if (selectedAsc) {
      const a = tree.ascStart.get(selectedAsc);
      if (a) s.add(a.key);
    }
    return s;
  }, [tree, alloc, ascAlloc, startKey, selectedAsc]);

  const weaponTag = useMemo(() => {
    const m = new Map<string, 1 | 2>();
    alloc.forEach((t, k) => t !== 0 && m.set(k, t as 1 | 2));
    return m;
  }, [alloc]);

  // Ascendancies render in place at the tree's edge (no centre relocation).
  const ascOffset = null;

  const bonus = useMemo(() => {
    if (!tree) return 0;
    let b = 0;
    const add = (k: string) => {
      const gp = tree.nodes.get(k)?.grantedPassivePoints;
      if (gp) b += gp;
    };
    alloc.forEach((_t, k) => add(k));
    ascAlloc.forEach(add);
    return b;
  }, [tree, alloc, ascAlloc]);

  const setCounts = useMemo(() => {
    let a = 0;
    let b = 0;
    alloc.forEach((t) => (t === 1 ? a++ : t === 2 ? b++ : 0));
    return [a, b] as const;
  }, [alloc]);

  const ascUsed = useMemo(() => {
    if (!tree) return 0;
    let n = 0;
    ascAlloc.forEach((k) => {
      if (!tree.nodes.get(k)?.mcOption) n++; // multiple-choice options are free
    });
    return n;
  }, [tree, ascAlloc]);

  // allocated notables / keystones that can carry a note (asc flag for tabs)
  const notesNodes = useMemo(() => {
    if (!tree) return [] as { key: string; name: string; asc: boolean }[];
    const out: { key: string; name: string; asc: boolean }[] = [];
    const add = (k: string) => {
      const n = tree.nodes.get(k);
      if (n && n.name && (n.kind === "notable" || n.kind === "keystone" || n.kind === "ascNotable"))
        out.push({ key: k, name: n.name, asc: n.kind === "ascNotable" });
    };
    alloc.forEach((_t, k) => add(k));
    ascAlloc.forEach(add);
    return out;
  }, [tree, alloc, ascAlloc]);

  // node keys with a non-empty note → show a badge in the tree. Shown in both
  // planner and explorer (e.g. after importing a build that carries notes);
  // doc.notes is empty while plainly browsing, so this is a no-op then.
  const notedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const [k, v] of Object.entries(doc.notes)) if (v.trim()) s.add(k);
    return s;
  }, [doc.notes]);

  const ascPrefixForClass =
    selectedClass != null && tree ? tree.classes[selectedClass].name : null;
  const activeOverrides =
    selectedClass != null && tree ? tree.classOverrides.get(selectedClass) ?? null : null;
  const className = selectedClass != null && tree ? tree.classes[selectedClass].name : undefined;

  if (!ready || !tree || !atlases) {
    return (
      <div className="app">
        <div className="loader">
          <div className="loader__ring" />
          <div className="loader__brand">Passive Skill Tree</div>
          <div className="loader__label">
            {progress >= 1 ? "Awakening the tree…" : "Drawing the passive tree"}
          </div>
          <div className="loader__bar">
            <div className="loader__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="loader__pct">{Math.round(progress * 100)}%</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        "app" + (showLeft ? " show-left" : "") + (showRight ? " show-right" : "") + (planner ? " planner" : "")
      }
    >
      <TreeCanvas
        tree={tree}
        atlases={atlases}
        camera={cameraRef.current}
        diff={diff}
        diffOn={diffOn}
        searchHits={hits}
        focusKey={focusKey}
        selectedClass={selectedClass}
        selectedAsc={selectedAsc}
        ascPrefixForClass={ascPrefixForClass}
        overrides={activeOverrides}
        allocated={allocated}
        weaponTag={weaponTag}
        ascOffset={ascOffset}
        alloc={alloc}
        ascAlloc={ascAlloc}
        mode={mode}
        notedKeys={notedKeys}
        focusTarget={focusTarget}
        onHover={onHover}
        onPick={handleNodeClick}
      />

      {planner ? (
        <>
          <PlannerWizard
            steps={WIZARD_STEPS}
            step={step}
            setStep={goToStep}
            onExport={onExport}
            onExit={exitPlanner}
          />
          {step === 0 && (
            <DetailsStep
              name={doc.name}
              author={doc.author}
              description={doc.description}
              setField={setDocField}
              classes={tree.classes}
              selectedClass={selectedClass}
              selectedAsc={selectedAsc}
              newAscIds={newAscIds}
              onSelectClass={selectClass}
              onSelectAsc={selectAsc}
            />
          )}
          {step === 1 && (
            <>
              <SearchPanel
                query={query}
                setQuery={setQuery}
                results={results}
                total={results.length}
                diff={diff}
                diffOn={diffOn}
                onPick={pickSearch}
                overrides={activeOverrides}
              />
              <BuildPanel
                hasClass={selectedClass != null}
                mainUsed={alloc.size}
                budget={baseBudget + bonus}
                bonus={bonus}
                ascUsed={ascUsed}
                ascBudget={ASC_BUDGET}
                mode={mode}
                set1={setCounts[0]}
                set2={setCounts[1]}
                swapMax={SWAP_MAX}
                setMode={setMode}
                setBaseBudget={setBaseBudget}
                onClear={clearBuild}
              />
              <NotesPanel nodes={notesNodes} notes={doc.notes} setNote={setNote} />
            </>
          )}
          {step === 2 && <SkillsStep skills={doc.skills} setSkills={setSkills} version={version} />}
          {step === 3 && (
            <InventoryStep
              inventory={doc.inventory}
              setInventory={setInventory}
              selectedAsc={selectedAsc}
            />
          )}
        </>
      ) : (
        <>
          <SearchPanel
            query={query}
            setQuery={setQuery}
            results={results}
            total={results.length}
            diff={diff}
            diffOn={diffOn}
            onPick={pickSearch}
            overrides={activeOverrides}
          />
          <VersionPanel
            version={version}
            setVersion={setVersion}
            diffOn={diffOn}
            setDiffOn={toggleDiff}
            diff={diff}
          />
          <BuildPanel
            hasClass={selectedClass != null}
            mainUsed={alloc.size}
            budget={baseBudget + bonus}
            bonus={bonus}
            ascUsed={ascUsed}
            ascBudget={ASC_BUDGET}
            mode={mode}
            set1={setCounts[0]}
            set2={setCounts[1]}
            swapMax={SWAP_MAX}
            setMode={setMode}
            setBaseBudget={setBaseBudget}
            onClear={clearBuild}
          />
          <ClassPanel
            classes={tree.classes}
            selectedClass={selectedClass}
            selectedAsc={selectedAsc}
            newAscIds={newAscIds}
            onSelectClass={selectClass}
            onSelectAsc={selectAsc}
            onNewBuild={enterPlanner}
            onImport={triggerImport}
            onEdit={editBuild}
            canEdit={selectedClass != null || alloc.size > 0}
          />
          <button
            className="edge-toggle left"
            onClick={() => setShowLeft((v) => !v)}
            aria-label="Toggle search and class panels"
          >
            {showLeft ? "‹" : "›"}
          </button>
          <button
            className="edge-toggle right"
            onClick={() => setShowRight((v) => !v)}
            aria-label="Toggle version panel"
          >
            {showRight ? "›" : "‹"}
          </button>
        </>
      )}

      <Controls camera={cameraRef.current} onReset={resetView} />

      <PobImportModal
        open={pobModalOpen}
        onClose={() => setPobModalOpen(false)}
        onPobString={onPobString}
        onFile={onImport}
      />

      <HoverLayer
        ref={hoverRef}
        diff={diff}
        diffOn={diffOn}
        overrides={activeOverrides}
        className={className}
        notes={doc.notes}
      />
    </div>
  );
}

function rank(kind: string): number {
  if (kind === "keystone") return 4;
  if (kind.includes("otable")) return 3;
  if (kind === "mastery") return 2;
  if (kind === "jewel") return 1;
  return 0;
}
