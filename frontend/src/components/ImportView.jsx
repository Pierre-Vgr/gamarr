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
      await refreshAll();
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkRunning(false);
    }
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
          <div className="flex items-center gap-1 text-sm mb-3 flex-wrap">
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
              await refreshAll();
            }}
          />
        )}
      </div>
    </div>
  );
}
