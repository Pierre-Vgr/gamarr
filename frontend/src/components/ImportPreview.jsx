import { useEffect, useState } from "react";
import { api } from "../api/client.js";

function toRow(item) {
  return {
    name: item.name,
    title: item.match?.title || item.title,
    provider: item.provider,
    match: item.match,
    candidates: item.candidates || [],
    error: item.error || null,
    included: true,
    showSearch: false,
    searchQuery: item.title,
    searching: false,
    searchResults: [],
  };
}

// Revue avant import : montre pour chaque entrée détectée le titre et la
// correspondance de métadonnées qui seraient utilisés par "Tout importer"/
// "Import intelligent", et permet de corriger le titre ou de choisir une
// autre fiche à la main avant de confirmer réellement l'import.
export function ImportPreview({ onClose, onImported }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(null);
  const [commitResult, setCommitResult] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.previewImport();
      setItems(result.items.map(toRow));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateItem(index, patch) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  const includedCount = items?.filter((it) => it.included).length || 0;
  const allIncluded = items?.length > 0 && includedCount === items.length;

  function toggleAll() {
    setItems((prev) => prev.map((it) => ({ ...it, included: !allIncluded })));
  }

  async function handleSearch(index) {
    const item = items[index];
    if (!item.searchQuery.trim()) return;
    updateItem(index, { searching: true });
    try {
      const results = await api.searchMetadata(item.searchQuery, item.provider || "igdb");
      updateItem(index, { searchResults: results, searching: false });
    } catch (err) {
      updateItem(index, { searching: false, searchResults: [] });
      setError(err.message);
    }
  }

  async function pickMatch(index, result) {
    try {
      const details = await api.getMetadataDetails(result.source, result.externalId);
      updateItem(index, {
        title: details.title || items[index].title,
        provider: details.source,
        match: {
          externalId: details.externalId,
          title: details.title,
          coverUrl: details.coverUrl || null,
          releaseDate: details.releaseDate || null,
        },
        showSearch: false,
        searchResults: [],
      });
    } catch (err) {
      setError(err.message);
    }
  }

  function clearMatch(index) {
    updateItem(index, { match: null });
  }

  async function handleCommit() {
    const toImport = items.filter((it) => it.included);
    if (toImport.length === 0) return;
    setCommitting(true);
    setCommitProgress({ done: 0, total: toImport.length });
    const created = [];
    const failed = [];

    for (const it of toImport) {
      try {
        const game = await api.importEntry({
          name: it.name,
          title: it.title.trim() || undefined,
          provider: it.match ? it.provider : null,
          externalId: it.match ? it.match.externalId : null,
        });
        created.push(game);
      } catch (err) {
        failed.push({ name: it.name, error: err.message });
      }
      setCommitProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setCommitting(false);
    setCommitResult({ created, failed });
    onImported?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Prévisualiser avant import</h3>
        <button onClick={onClose} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm">
          Retour
        </button>
      </div>

      {loading ? (
        <p className="text-slate-400">Analyse de la ludothèque...</p>
      ) : error && !items ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400">Aucun nouvel élément détecté.</p>
      ) : commitResult ? (
        <div className="bg-slate-800 rounded-lg p-4 space-y-2">
          <p className="text-sm">
            <span className="text-emerald-400">{commitResult.created.length} importé(s)</span>
            {commitResult.failed.length > 0 && (
              <>
                {" · "}
                <span className="text-red-400">{commitResult.failed.length} échec(s)</span>
              </>
            )}
          </p>
          {commitResult.failed.length > 0 && (
            <ul className="text-xs text-slate-400 space-y-1">
              {commitResult.failed.map((f) => (
                <li key={f.name}>
                  {f.name} — {f.error}
                </li>
              ))}
            </ul>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">
            Terminé
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-slate-800 rounded-lg p-3">
            <button onClick={toggleAll} className="text-sm text-indigo-400 hover:underline">
              {allIncluded ? "Tout exclure" : "Tout inclure"}
            </button>
            <span className="text-sm text-slate-300">{includedCount} / {items.length} à importer</span>
            <button
              onClick={handleCommit}
              disabled={committing || includedCount === 0}
              className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-medium disabled:opacity-50"
            >
              {committing
                ? `Import... (${commitProgress?.done || 0}/${commitProgress?.total || 0})`
                : `Confirmer l'import (${includedCount})`}
            </button>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <ul className="space-y-2 max-h-[70vh] overflow-y-auto">
            {items.map((item, index) => (
              <li key={item.name} className="bg-slate-900 rounded-lg p-3 flex gap-3">
                <input
                  type="checkbox"
                  checked={item.included}
                  disabled={committing}
                  onChange={() => updateItem(index, { included: !item.included })}
                  className="mt-1 shrink-0"
                />
                <div className="w-10 h-14 shrink-0 bg-slate-800 rounded overflow-hidden">
                  {item.match?.coverUrl && (
                    <img src={item.match.coverUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    className="w-full bg-slate-800 rounded px-2 py-1 text-sm mb-1"
                    value={item.title}
                    disabled={committing}
                    onChange={(e) => updateItem(index, { title: e.target.value })}
                  />
                  <p className="text-xs text-slate-500 truncate" title={item.name}>
                    {item.name}
                  </p>

                  {item.match ? (
                    <p className="text-xs text-emerald-400 mt-1">
                      ✓ {item.match.title}
                      {item.match.releaseDate ? ` (${item.match.releaseDate.slice(0, 4)})` : ""}
                      {" · "}
                      <button
                        onClick={() => clearMatch(index)}
                        disabled={committing}
                        className="text-slate-400 hover:underline"
                      >
                        retirer
                      </button>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      Aucune correspondance — sera importé avec le titre seul.
                      {item.candidates.length > 0 && (
                        <>
                          {" "}
                          Suggestions :{" "}
                          {item.candidates
                            .map((c) => `${c.title}${c.releaseDate ? ` (${c.releaseDate.slice(0, 4)})` : ""}`)
                            .join(", ")}
                        </>
                      )}
                    </p>
                  )}

                  <button
                    onClick={() => updateItem(index, { showSearch: !item.showSearch })}
                    disabled={committing}
                    className="text-xs text-indigo-400 hover:underline mt-1"
                  >
                    {item.showSearch ? "Fermer la recherche" : item.match ? "Changer de correspondance" : "Rechercher"}
                  </button>

                  {item.showSearch && (
                    <div className="mt-2 bg-slate-800 rounded p-2">
                      <div className="flex gap-2">
                        <input
                          className="flex-1 bg-slate-700 rounded px-2 py-1 text-xs"
                          value={item.searchQuery}
                          onChange={(e) => updateItem(index, { searchQuery: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch(index))}
                        />
                        <button
                          onClick={() => handleSearch(index)}
                          disabled={item.searching}
                          className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs disabled:opacity-50"
                        >
                          {item.searching ? "..." : "Chercher"}
                        </button>
                      </div>
                      {item.searchResults.length > 0 && (
                        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                          {item.searchResults.map((r) => (
                            <li key={r.externalId}>
                              <button
                                onClick={() => pickMatch(index, r)}
                                className="w-full flex items-center gap-2 p-1 rounded hover:bg-slate-700 text-left text-xs"
                              >
                                {r.coverUrl && (
                                  <img src={r.coverUrl} alt="" className="w-6 h-8 object-cover rounded shrink-0" />
                                )}
                                <span className="truncate">
                                  {r.title} {r.releaseDate ? `(${r.releaseDate.slice(0, 4)})` : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
