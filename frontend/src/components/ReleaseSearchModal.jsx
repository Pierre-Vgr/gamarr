import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatSize } from "../utils/format.js";

export function ReleaseSearchModal({ game, onClose }) {
  const [query, setQuery] = useState(game.title);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [grabbing, setGrabbing] = useState(null);
  const [grabbed, setGrabbed] = useState(new Set());
  const [grabErrors, setGrabErrors] = useState({});

  useEffect(() => {
    handleSearch();
  }, []);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const found = await api.searchReleases(query);
      found.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));
      setResults(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  async function handleGrab(r) {
    setGrabbing(r.guid);
    setGrabErrors((prev) => ({ ...prev, [r.guid]: null }));
    try {
      await api.grabRelease(r.guid, r.indexerId);
      setGrabbed((prev) => new Set(prev).add(r.guid));
    } catch (err) {
      setGrabErrors((prev) => ({ ...prev, [r.guid]: err.message }));
    } finally {
      setGrabbing(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto p-6">
        <h2 className="text-xl font-semibold mb-1">Rechercher une release</h2>
        <p className="text-sm text-slate-400 mb-4">via Prowlarr, pour "{game.title}"</p>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-slate-800 rounded px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titre à rechercher..."
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Recherche..." : "Chercher"}
          </button>
        </form>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        {!loading && searched && !error && results.length === 0 && (
          <p className="text-slate-400 text-sm">Aucune release trouvée.</p>
        )}

        {results.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-2">Titre</th>
                  <th className="py-2 pr-2">Indexeur</th>
                  <th className="py-2 pr-2">Taille</th>
                  <th className="py-2 pr-2">Seeders</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.guid} className="border-b border-slate-800/50 hover:bg-slate-800/50">
                    <td className="py-2 pr-2 max-w-md truncate" title={r.title}>
                      {r.title}
                    </td>
                    <td className="py-2 pr-2 text-slate-400">{r.indexer}</td>
                    <td className="py-2 pr-2 text-slate-400 whitespace-nowrap">
                      {formatSize(r.sizeBytes)}
                    </td>
                    <td className="py-2 pr-2 text-slate-400">
                      {r.protocol === "torrent" ? r.seeders ?? "-" : "-"}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <button
                        onClick={() => handleGrab(r)}
                        disabled={grabbing === r.guid || grabbed.has(r.guid)}
                        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium whitespace-nowrap disabled:opacity-50 disabled:bg-emerald-800"
                      >
                        {grabbed.has(r.guid)
                          ? "Envoyé ✓"
                          : grabbing === r.guid
                            ? "Envoi..."
                            : "Télécharger"}
                      </button>
                      {grabErrors[r.guid] && (
                        <p className="text-red-400 text-xs mt-1 max-w-[12rem]">{grabErrors[r.guid]}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
