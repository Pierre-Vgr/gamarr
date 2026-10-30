import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatSize } from "../utils/format.js";
import { ImportEntryReview } from "./ImportEntryReview.jsx";

export function ImportView({ onImported }) {
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [smartRunning, setSmartRunning] = useState(false);
  const [smartResult, setSmartResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeName, setActiveName] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.scanImport();
      setScan(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeEntry = scan?.entries.find((e) => e.name === activeName) || null;

  function toggle(name) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (!scan) return;
    setSelected((prev) =>
      prev.size === scan.entries.length ? new Set() : new Set(scan.entries.map((e) => e.name))
    );
  }

  async function handleImport(names) {
    if (names.length === 0) return;
    setBulkRunning(true);
    setError(null);
    try {
      await api.importGames(names);
      setSelected(new Set());
      if (activeName && names.includes(activeName)) setActiveName(null);
      await load();
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkRunning(false);
    }
  }

  async function handleSmartImport() {
    setSmartRunning(true);
    setError(null);
    setSmartResult(null);
    try {
      const result = await api.smartImport();
      setSmartResult(result);
      setSelected(new Set());
      await load();
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSmartRunning(false);
    }
  }

  const busy = bulkRunning || smartRunning;

  return (
    <div className="flex gap-6 items-start flex-wrap lg:flex-nowrap">
      <div className="flex-1 min-w-0">
        {!loading && scan?.exists && scan.entries.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-400 flex-1 min-w-[200px]">
                Ajoute automatiquement les jeux dont le titre correspond exactement à une
                fiche existante chez le fournisseur de métadonnées configuré, et qui ne sont
                pas déjà en bibliothèque. Clique sur une entrée ci-dessous pour les autres
                (titre à ajuster, correspondance à choisir à la main).
              </p>
              <button
                onClick={handleSmartImport}
                disabled={busy}
                className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 font-medium disabled:opacity-50 shrink-0"
              >
                {smartRunning ? "Analyse en cours..." : "Import intelligent"}
              </button>
            </div>

            {smartResult && (
              <p className="text-xs mt-2">
                <span className="text-emerald-400">{smartResult.created.length} ajouté(s)</span>
                {" · "}
                <span className="text-slate-400">{smartResult.skipped.length} laissé(s) pour tri manuel</span>
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Analyse du dossier...</p>
        ) : !scan ? (
          <p className="text-red-400 text-sm">{error || "Impossible de charger le dossier."}</p>
        ) : !scan.exists ? (
          <p className="text-amber-400 text-sm">
            Dossier "{scan.libraryDir}" introuvable. Vérifie qu'un dossier est bien monté sur
            /library dans docker-compose.yml.
          </p>
        ) : scan.entries.length === 0 ? (
          <p className="text-slate-400">
            Aucun nouvel élément trouvé dans "{scan.libraryDir}" (tout est déjà importé, ou le
            dossier est vide).
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <button onClick={toggleAll} className="text-sm text-indigo-400 hover:underline">
                {selected.size === scan.entries.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <span className="text-sm text-slate-400">
                {selected.size} / {scan.entries.length} sélectionné(s)
              </span>
            </div>
            <ul className="space-y-1 border border-slate-800 rounded-lg p-2">
              {scan.entries.map((entry) => (
                <li key={entry.name}>
                  <div
                    className={`flex items-center gap-3 p-2 rounded hover:bg-slate-800 ${
                      activeName === entry.name ? "bg-slate-800 ring-1 ring-indigo-500" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(entry.name)}
                      onChange={() => toggle(entry.name)}
                      className="shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveName(entry.name)}
                      className="flex-1 min-w-0 text-left truncate"
                      title={entry.name}
                    >
                      {entry.name.includes("/") && (
                        <span className="text-slate-500">
                          {entry.name.slice(0, entry.name.lastIndexOf("/") + 1)}
                        </span>
                      )}
                      {entry.title}
                    </button>
                    <span className="text-xs text-slate-500 shrink-0">
                      {entry.isDirectory ? "dossier" : formatSize(entry.sizeBytes)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && scan && <p className="text-red-400 text-sm mt-2">{error}</p>}

        {bulkRunning && (
          <p className="text-slate-400 text-sm mt-2">
            Import et récupération des métadonnées en cours, ça peut prendre un moment...
          </p>
        )}

        {smartRunning && (
          <p className="text-slate-400 text-sm mt-2">
            Analyse et récupération des métadonnées en cours, ça peut prendre un moment sur
            une grosse ludothèque...
          </p>
        )}

        {scan?.exists && scan.entries.length > 0 && (
          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => handleImport(scan.entries.map((e) => e.name))}
              disabled={busy}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 font-medium disabled:opacity-50"
            >
              {bulkRunning ? "Import..." : `Tout importer (${scan.entries.length})`}
            </button>
            <button
              onClick={() => handleImport(Array.from(selected))}
              disabled={busy || selected.size === 0}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium disabled:opacity-50"
            >
              {bulkRunning ? "Import..." : `Importer la sélection (${selected.size})`}
            </button>
          </div>
        )}
      </div>

      {activeEntry && (
        <ImportEntryReview
          key={activeEntry.name}
          entry={activeEntry}
          onClose={() => setActiveName(null)}
          onImported={async () => {
            setActiveName(null);
            await load();
            onImported?.();
          }}
        />
      )}
    </div>
  );
}
