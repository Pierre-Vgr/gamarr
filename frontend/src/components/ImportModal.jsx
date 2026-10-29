import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatSize } from "../utils/format.js";

export function ImportModal({ onClose, onImported }) {
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

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
    setImporting(true);
    setError(null);
    try {
      await api.importGames(names);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg w-full max-w-xl max-h-[85vh] overflow-y-auto p-6">
        <h2 className="text-xl font-semibold mb-4">Importer depuis le dossier des jeux</h2>

        {loading ? (
          <p className="text-slate-400">Analyse du dossier...</p>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
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
            <ul className="space-y-1 max-h-96 overflow-y-auto border border-slate-800 rounded-lg p-2">
              {scan.entries.map((entry) => (
                <li key={entry.name}>
                  <label className="flex items-center gap-3 p-2 rounded hover:bg-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.name)}
                      onChange={() => toggle(entry.name)}
                      className="shrink-0"
                    />
                    <span className="flex-1 truncate" title={entry.name}>
                      {entry.title}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {entry.isDirectory ? "dossier" : formatSize(entry.sizeBytes)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && scan && <p className="text-red-400 text-sm mt-2">{error}</p>}

        {importing && (
          <p className="text-slate-400 text-sm mt-2">
            Import et récupération des métadonnées en cours, ça peut prendre un moment...
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
          >
            Fermer
          </button>
          {scan?.exists && scan.entries.length > 0 && (
            <>
              <button
                onClick={() => handleImport(scan.entries.map((e) => e.name))}
                disabled={importing}
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 font-medium disabled:opacity-50"
              >
                {importing ? "Import..." : `Tout importer (${scan.entries.length})`}
              </button>
              <button
                onClick={() => handleImport(Array.from(selected))}
                disabled={importing || selected.size === 0}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium disabled:opacity-50"
              >
                {importing ? "Import..." : `Importer la sélection (${selected.size})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
