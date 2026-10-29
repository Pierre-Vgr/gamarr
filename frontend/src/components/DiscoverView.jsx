import { useEffect, useState } from "react";
import { api } from "../api/client.js";

export function DiscoverView() {
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(new Set());
  const [adding, setAdding] = useState(null);

  const canBrowse = provider === "rawg";

  useEffect(() => {
    api
      .listProviders()
      .then((list) => {
        setProviders(list.filter((p) => p.configured));
        const first = list.find((p) => p.configured);
        setProvider(first ? first.id : "rawg");
      })
      .catch(() => setProvider("rawg"));
  }, []);

  useEffect(() => {
    if (!provider) return;
    if (!query.trim() && canBrowse) {
      loadBrowse(1);
    } else if (!query.trim()) {
      setResults([]);
      setLoading(false);
    }
  }, [provider]);

  async function loadBrowse(nextPage) {
    setLoading(true);
    setError(null);
    try {
      const found = await api.browseCatalog(provider, nextPage);
      setResults(found);
      setPage(nextPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!provider) return;
    if (!query.trim()) {
      if (canBrowse) loadBrowse(1);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const found = await api.searchMetadata(query, provider);
      setResults(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addToWishlist(result) {
    setAdding(result.externalId);
    setError(null);
    try {
      const details = await api.getMetadataDetails(result.source, result.externalId);
      await api.createGame({
        title: details.title,
        platforms: details.platforms,
        status: "wishlist",
        coverUrl: details.coverUrl,
        description: details.description,
        releaseDate: details.releaseDate,
        genres: details.genres,
        source: details.source,
        externalId: details.externalId,
      });
      setAdded((prev) => new Set(prev).add(result.externalId));
    } catch (err) {
      if (err.status === 409) {
        // Déjà présent dans la bibliothèque : pas une erreur, juste marquer comme ajouté.
        setAdded((prev) => new Set(prev).add(result.externalId));
      } else {
        setError(err.message);
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-6">
        <input
          className="bg-slate-800 rounded px-3 py-2 flex-1 min-w-[200px]"
          placeholder="Rechercher un jeu à ajouter en wishlist..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {providers.length > 1 && (
          <select
            className="bg-slate-800 rounded px-3 py-2"
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
          type="submit"
          disabled={!provider}
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium disabled:opacity-50"
        >
          Chercher
        </button>
      </form>

      {!query.trim() && (
        <p className="text-slate-400 text-sm mb-4">
          {canBrowse
            ? "Jeux PC tendance sur RAWG — ou tape une recherche ci-dessus."
            : "Le parcours sans recherche n'est disponible que pour RAWG. Tape une recherche."}
        </p>
      )}

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : results.length === 0 ? (
        <p className="text-slate-400">Aucun résultat.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {results.map((r) => (
            <div key={r.externalId} className="bg-slate-900 rounded-lg overflow-hidden shadow-lg">
              <div className="aspect-[3/4] bg-slate-800 relative">
                {r.coverUrl ? (
                  <img src={r.coverUrl} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">
                    Pas de cover
                  </div>
                )}
              </div>
              <div className="p-3">
                <h3 className="font-semibold truncate text-sm" title={r.title}>
                  {r.title}
                </h3>
                <p className="text-xs text-slate-400 truncate mb-2">
                  {r.releaseDate ? r.releaseDate.slice(0, 4) : "Date inconnue"}
                </p>
                <button
                  onClick={() => addToWishlist(r)}
                  disabled={adding === r.externalId || added.has(r.externalId)}
                  className="w-full px-2 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-emerald-800"
                >
                  {added.has(r.externalId)
                    ? "Ajouté ✓"
                    : adding === r.externalId
                      ? "Ajout..."
                      : "+ Wishlist"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && canBrowse && !query.trim() && results.length > 0 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => loadBrowse(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-slate-400">Page {page}</span>
          <button
            onClick={() => loadBrowse(page + 1)}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
