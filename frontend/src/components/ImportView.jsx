import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatSize } from "../utils/format.js";
import { ImportEntryReview } from "./ImportEntryReview.jsx";

export function ImportView({ onImported }) {
  const [scan, setScan] = useState(null);
  const [scanLoading, setScanLoading] = useState(true);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [smartRunning, setSmartRunning] = useState(false);
  const [smartResult, setSmartResult] = useState(null);
  const [bulkError, setBulkError] = useState(null);

  const [currentPath, setCurrentPath] = useState("");
  const [browse, setBrowse] = useState(null);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState(null);
  const [activeName, setActiveName] = useState(null);
  const [selected, setSelected] = useState(new Set());
  // Chemin du dossier coché -> noms (relatifs à LIBRARY_DIR) de son contenu détecté,
  // pour pouvoir les retirer de `selected` si le dossier est décoché, et pour savoir
  // si la case d'un dossier doit apparaître cochée.
  const [expandedFolders, setExpandedFolders] = useState(new Map());
  const [expandingFolders, setExpandingFolders] = useState(new Set());

  async function loadScan() {
    setScanLoading(true);
    try {
      const result = await api.scanImport();
      setScan(result);
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setScanLoading(false);
    }
  }

  async function loadBrowse(targetPath) {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const result = await api.browseImport(targetPath);
      setBrowse(result);
    } catch (err) {
      setBrowseError(err.message);
    } finally {
      setBrowseLoading(false);
    }
  }

  useEffect(() => {
    loadScan();
  }, []);

  useEffect(() => {
    setActiveName(null);
    loadBrowse(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  async function refreshAll() {
    await Promise.all([loadScan(), loadBrowse(currentPath)]);
    onImported?.();
  }

  async function handleImport(names) {
    if (names.length === 0) return;
    setBulkRunning(true);
    setBulkError(null);
    try {
      await api.importGames(names);
      setSelected((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.delete(n));
        return next;
      });
      // Un dossier coché n'est "sélectionné" que via son contenu détecté : une fois
      // tout ce contenu importé, le dossier ne doit plus apparaître cocher non plus.
      setExpandedFolders((prev) => {
        const next = new Map(prev);
        for (const [folderName, subNames] of prev) {
          if (subNames.every((n) => names.includes(n))) next.delete(folderName);
        }
        return next;
      });
      await refreshAll();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkRunning(false);
    }
  }

  function toggleSelected(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Cocher un dossier ne l'importe jamais lui-même : ça scanne son contenu et
  // ajoute à la sélection ce qui y a été détecté (jeux/archives), afin de ne pas
  // se retrouver avec tout son contenu fusionné dans une seule fausse entrée.
  async function toggleFolderSelection(entry) {
    if (expandedFolders.has(entry.name)) {
      const names = expandedFolders.get(entry.name);
      setSelected((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.delete(n));
        return next;
      });
      setExpandedFolders((prev) => {
        const next = new Map(prev);
        next.delete(entry.name);
        return next;
      });
      return;
    }

    setExpandingFolders((prev) => new Set(prev).add(entry.name));
    setBulkError(null);
    try {
      const result = await api.scanImport(entry.name);
      const names = result.entries.map((e) => e.name);
      if (names.length === 0) {
        setBulkError(`Aucun élément détecté dans "${entry.title}".`);
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        names.forEach((n) => next.add(n));
        return next;
      });
      setExpandedFolders((prev) => new Map(prev).set(entry.name, names));
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setExpandingFolders((prev) => {
        const next = new Set(prev);
        next.delete(entry.name);
        return next;
      });
    }
  }

  function isEntrySelected(entry) {
    return entry.isDirectory ? expandedFolders.has(entry.name) : selected.has(entry.name);
  }

  async function handleSmartImport() {
    setSmartRunning(true);
    setBulkError(null);
    setSmartResult(null);
    try {
      const result = await api.smartImport();
      setSmartResult(result);
      await refreshAll();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setSmartRunning(false);
    }
  }

  const busy = bulkRunning || smartRunning;
  const activeEntry = browse?.entries.find((e) => e.name === activeName) || null;
  const selectableInCurrentLevel = (browse?.entries || []).filter((e) => !e.alreadyImported);
  const allCurrentLevelSelected =
    selectableInCurrentLevel.length > 0 && selectableInCurrentLevel.every(isEntrySelected);

  async function toggleCurrentLevel() {
    if (allCurrentLevelSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        selectableInCurrentLevel.forEach((e) => {
          if (e.isDirectory) (expandedFolders.get(e.name) || []).forEach((n) => next.delete(n));
          else next.delete(e.name);
        });
        return next;
      });
      setExpandedFolders((prev) => {
        const next = new Map(prev);
        selectableInCurrentLevel.forEach((e) => e.isDirectory && next.delete(e.name));
        return next;
      });
      return;
    }

    const files = selectableInCurrentLevel.filter((e) => !e.isDirectory).map((e) => e.name);
    setSelected((prev) => {
      const next = new Set(prev);
      files.forEach((n) => next.add(n));
      return next;
    });

    const folders = selectableInCurrentLevel.filter((e) => e.isDirectory && !expandedFolders.has(e.name));
    await Promise.all(folders.map((f) => toggleFolderSelection(f)));
  }

  const breadcrumbs = [];
  if (currentPath) {
    const segments = currentPath.split("/");
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      breadcrumbs.push({ label: seg, path: acc });
    }
  }

  return (
    <div className="space-y-4">
      {!scanLoading && scan?.exists && scan.entries.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-400 flex-1 min-w-[200px]">
              {scan.entries.length} jeu(x) détecté(s) automatiquement. "Import intelligent"
              n'ajoute que ceux dont le titre correspond exactement à une fiche chez le
              fournisseur de métadonnées configuré. Utilise l'arborescence ci-dessous pour
              naviguer et traiter le reste à la main.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => handleImport(scan.entries.map((e) => e.name))}
                disabled={busy}
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 font-medium disabled:opacity-50"
              >
                {bulkRunning ? "Import..." : `Tout importer (${scan.entries.length})`}
              </button>
              <button
                onClick={handleSmartImport}
                disabled={busy}
                className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 font-medium disabled:opacity-50"
              >
                {smartRunning ? "Analyse en cours..." : "Import intelligent"}
              </button>
            </div>
          </div>

          {smartResult && (
            <p className="text-xs mt-2">
              <span className="text-emerald-400">{smartResult.created.length} ajouté(s)</span>
              {" · "}
              <span className="text-slate-400">{smartResult.skipped.length} laissé(s) pour tri manuel</span>
            </p>
          )}
          {bulkError && <p className="text-red-400 text-xs mt-2">{bulkError}</p>}
        </div>
      )}

      <div className="flex gap-6 items-start flex-wrap lg:flex-nowrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-1 text-sm flex-wrap">
              <button
                onClick={() => setCurrentPath("")}
                className={currentPath === "" ? "text-white font-medium" : "text-indigo-400 hover:underline"}
              >
                Racine
              </button>
              {breadcrumbs.map((b, i) => (
                <span key={b.path} className="flex items-center gap-1">
                  <span className="text-slate-500">/</span>
                  <button
                    onClick={() => setCurrentPath(b.path)}
                    className={
                      i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-indigo-400 hover:underline"
                    }
                  >
                    {b.label}
                  </button>
                </span>
              ))}
            </div>
            {selectableInCurrentLevel.length > 0 && (
              <button onClick={toggleCurrentLevel} className="text-sm text-indigo-400 hover:underline shrink-0">
                {allCurrentLevelSelected ? "Désélectionner ce dossier" : "Sélectionner ce dossier"}
              </button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between gap-3 bg-slate-800 rounded-lg p-2 mb-3 text-sm">
              <span className="text-slate-300">
                {selected.size} sélectionné(s) (toutes catégories confondues). Cocher un dossier
                sélectionne le contenu détecté à l'intérieur, pas le dossier lui-même.
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setSelected(new Set())}
                  className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
                >
                  Vider
                </button>
                <button
                  onClick={() => handleImport(Array.from(selected))}
                  disabled={busy}
                  className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium disabled:opacity-50"
                >
                  {bulkRunning ? "Import..." : `Importer la sélection (${selected.size})`}
                </button>
              </div>
            </div>
          )}

          {browseLoading ? (
            <p className="text-slate-400">Chargement...</p>
          ) : browseError ? (
            <p className="text-red-400 text-sm">{browseError}</p>
          ) : !browse?.exists ? (
            <p className="text-amber-400 text-sm">
              Dossier introuvable. Vérifie qu'un dossier est bien monté sur /library dans
              docker-compose.yml.
            </p>
          ) : browse.entries.length === 0 ? (
            <p className="text-slate-400">Ce dossier est vide.</p>
          ) : (
            <ul className="space-y-1 border border-slate-800 rounded-lg p-2">
              {browse.entries.map((entry) => (
                <li key={entry.name}>
                  <div
                    className={`flex items-center gap-2 p-2 rounded hover:bg-slate-800 ${
                      activeName === entry.name ? "bg-slate-800 ring-1 ring-indigo-500" : ""
                    } ${entry.alreadyImported ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isEntrySelected(entry)}
                      disabled={entry.alreadyImported || expandingFolders.has(entry.name)}
                      onChange={() => (entry.isDirectory ? toggleFolderSelection(entry) : toggleSelected(entry.name))}
                      className="shrink-0"
                    />
                    <span className="shrink-0">{entry.isDirectory ? "📁" : "📄"}</span>
                    {entry.isDirectory ? (
                      <button
                        type="button"
                        onClick={() => setCurrentPath(entry.name)}
                        className="flex-1 min-w-0 text-left truncate hover:underline"
                        title={entry.name}
                      >
                        {entry.title}
                      </button>
                    ) : (
                      <span className="flex-1 min-w-0 truncate" title={entry.name}>
                        {entry.title}
                      </span>
                    )}
                    <span className="text-xs text-slate-500 shrink-0">
                      {entry.isDirectory ? "" : formatSize(entry.sizeBytes)}
                    </span>
                    {entry.alreadyImported ? (
                      <span className="text-xs text-slate-500 shrink-0">déjà importé</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveName(entry.name)}
                        className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 shrink-0"
                      >
                        Importer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeEntry && (
          <ImportEntryReview
            key={activeEntry.name}
            entry={activeEntry}
            onClose={() => setActiveName(null)}
            onImported={async () => {
              setActiveName(null);
              setSelected((prev) => {
                const next = new Set(prev);
                next.delete(activeEntry.name);
                return next;
              });
              await refreshAll();
            }}
          />
        )}
      </div>
    </div>
  );
}
