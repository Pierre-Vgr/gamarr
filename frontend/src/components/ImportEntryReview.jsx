import { useEffect, useState } from "react";
import { api } from "../api/client.js";

// Panneau de revue pour une entrée de scan : permet d'ajuster le titre, de
// choisir (ou non) une correspondance de métadonnées avant import, plutôt que
// de subir le matching automatique du scan.
export function ImportEntryReview({ entry, onClose, onImported }) {
  const [title, setTitle] = useState(entry.title);
  const [query, setQuery] = useState(entry.title);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [match, setMatch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .listProviders()
      .then((list) => {
        const configured = list.filter((p) => p.configured);
        setProviders(configured);
        setProvider(configured[0]?.id || null);
      })
      .catch(() => {});
  }, []);

  async function handleSearch() {
    if (!query.trim() || !provider) return;
    setSearching(true);
    setError(null);
    try {
      const found = await api.searchMetadata(query, provider);
      setResults(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  useEffect(() => {
    if (provider && !searched) handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  async function pickResult(r) {
    setError(null);
    try {
      const details = await api.getMetadataDetails(r.source, r.externalId);
      setMatch(details);
      setTitle(details.title || title);
      setResults([]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirm() {
    if (!title.trim()) {
      setError("Le titre est obligatoire");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.importEntry({
        name: entry.name,
        title: title.trim(),
        provider: match?.source || null,
        externalId: match?.externalId || null,
      });
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-slate-900 rounded-lg p-4 space-y-4 self-start lg:sticky lg:top-6">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold truncate" title={entry.name}>
            {entry.title}
          </h3>
          <p className="text-xs text-slate-500 truncate" title={entry.name}>
            {entry.name}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm shrink-0">
          ✕
        </button>
      </div>

      <div>
        <label className="block text-sm text-slate-300 mb-1">Titre</label>
        <input
          className="w-full bg-slate-800 rounded px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {match ? (
        <div className="bg-slate-800 rounded-lg p-3 flex gap-3">
          {match.coverUrl && (
            <img src={match.coverUrl} alt="" className="w-16 h-20 object-cover rounded shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{match.title}</p>
            <p className="text-xs text-slate-400">
              {match.releaseDate ? match.releaseDate.slice(0, 4) : "Date inconnue"}
            </p>
            {match.platforms?.length > 0 && (
              <p className="text-xs text-slate-500 mt-1 truncate">{match.platforms.join(", ")}</p>
            )}
            <button
              onClick={() => setMatch(null)}
              className="text-xs text-indigo-400 hover:underline mt-2"
            >
              Changer de correspondance
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-700 rounded px-3 py-2 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSearch())}
              placeholder="Titre à rechercher..."
            />
            {providers.length > 1 && (
              <select
                className="bg-slate-700 rounded px-2 py-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !provider}
              className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
            >
              {searching ? "..." : "Chercher"}
            </button>
          </div>

          {results.length > 0 ? (
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li key={r.externalId}>
                  <button
                    type="button"
                    onClick={() => pickResult(r)}
                    className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-700 text-left text-sm"
                  >
                    {r.coverUrl && (
                      <img src={r.coverUrl} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
                    )}
                    <span className="truncate">
                      {r.title} {r.releaseDate ? `(${r.releaseDate.slice(0, 4)})` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            searched &&
            !searching && <p className="text-xs text-slate-500">Aucun résultat, ajuste la recherche ci-dessus.</p>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <p className="text-xs text-slate-500">
        {match
          ? "Sera importé avec les métadonnées choisies ci-dessus."
          : "Sera importé avec le titre seul, sans métadonnées (modifiable plus tard depuis la fiche)."}
      </p>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm">
          Annuler
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Import..." : "Importer ce jeu"}
        </button>
      </div>
    </div>
  );
}
