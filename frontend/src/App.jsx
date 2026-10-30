import { useEffect, useState, useCallback } from "react";
import { api } from "./api/client.js";
import { GameCard } from "./components/GameCard.jsx";
import { GameDetailModal } from "./components/GameDetailModal.jsx";
import { GameFormModal } from "./components/GameFormModal.jsx";
import { ImportView } from "./components/ImportView.jsx";
import { DiscoverView } from "./components/DiscoverView.jsx";
import { ReleaseSearchModal } from "./components/ReleaseSearchModal.jsx";
import { SettingsView } from "./components/SettingsView.jsx";
import { STATUS_OPTIONS } from "./components/StatusBadge.jsx";

const NAV_ITEMS = [
  { id: "library", label: "Bibliothèque" },
  { id: "import", label: "Importer" },
  { id: "discover", label: "Découvrir" },
  { id: "settings", label: "Paramètres" },
];

export default function App() {
  const [view, setView] = useState("library");
  const [ready, setReady] = useState(false);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("title");
  const [facets, setFacets] = useState({ sources: [], genres: [] });
  const [modalGame, setModalGame] = useState(undefined); // undefined = closed, null = new, object = edit
  const [detailGame, setDetailGame] = useState(null);
  const [releaseSearchGame, setReleaseSearchGame] = useState(null);
  const [prowlarrConfigured, setProwlarrConfigured] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const isGridView = view === "library";

  useEffect(() => {
    api
      .prowlarrStatus()
      .then((s) => setProwlarrConfigured(s.configured))
      .catch(() => {});
    api
      .getGameFacets()
      .then(setFacets)
      .catch(() => {});
    // Aucun secrets.json fourni : on démarre directement sur Paramètres plutôt que
    // de laisser l'utilisateur découvrir une bibliothèque vide sans explication.
    api
      .getSettings()
      .then((s) => {
        if (s.firstRun) setView("settings");
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const load = useCallback(async () => {
    if (!isGridView) return;
    setLoading(true);
    setError(null);
    try {
      const params = { search, status, sort, source, genre };
      const data = await api.listGames(params);
      setGames(data);
      api.getGameFacets().then(setFacets).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, source, genre, sort, isGridView]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [view]);

  async function handleDelete(game) {
    if (!confirm(`Supprimer "${game.title}" de la bibliothèque ?`)) return;
    await api.deleteGame(game.id);
    load();
  }

  function handleRefreshed(updatedGame) {
    setGames((prev) => prev.map((g) => (g.id === updatedGame.id ? updatedGame : g)));
  }

  function toggleSelectGame(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allGamesSelected = games.length > 0 && games.every((g) => selectedIds.has(g.id));

  function toggleSelectAllGames() {
    setSelectedIds(allGamesSelected ? new Set() : new Set(games.map((g) => g.id)));
  }

  async function handleBulkStatus(newStatus) {
    if (!newStatus || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await api.bulkUpdateStatus(Array.from(selectedIds), newStatus);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} jeu(x) de la bibliothèque ?`)) return;
    setBulkBusy(true);
    try {
      await api.bulkDeleteGames(Array.from(selectedIds));
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-1">
        <h1 className="text-xl font-bold mb-4 px-2">🎮 Gamarr</h1>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`text-left px-3 py-2 rounded font-medium ${
              view === item.id ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <main className="flex-1 px-6 py-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold">
            {NAV_ITEMS.find((i) => i.id === view)?.label}
          </h2>
          {isGridView && (
            <div className="flex gap-2">
              <button
                onClick={() => setModalGame(null)}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium"
              >
                + Ajouter un jeu
              </button>
            </div>
          )}
        </div>

        {view === "import" && <ImportView onImported={load} />}
        {view === "discover" && <DiscoverView />}
        {view === "settings" && <SettingsView />}

        {isGridView && (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <input
                className="bg-slate-800 rounded px-3 py-2 flex-1 min-w-[200px]"
                placeholder="Rechercher un jeu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="bg-slate-800 rounded px-3 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                className="bg-slate-800 rounded px-3 py-2"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Toutes les sources</option>
                {facets.sources.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
              </select>
              <select
                className="bg-slate-800 rounded px-3 py-2"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
              >
                <option value="">Toutes les catégories</option>
                {facets.genres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                className="bg-slate-800 rounded px-3 py-2"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="title">Trier par titre</option>
                <option value="created_at">Trier par date d'ajout</option>
                <option value="release_date">Trier par date de sortie</option>
                <option value="rating">Trier par note</option>
                <option value="source">Trier par source</option>
              </select>
            </div>

            {error && <p className="text-red-400 mb-4">{error}</p>}

            {games.length > 0 && (
              <div className="mb-2">
                <button onClick={toggleSelectAllGames} className="text-sm text-indigo-400 hover:underline">
                  {allGamesSelected ? "Tout désélectionner" : "Tout sélectionner"}
                </button>
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between gap-3 bg-slate-800 rounded-lg p-2 mb-4 text-sm">
                <span className="text-slate-300">{selectedIds.size} sélectionné(s)</span>
                <div className="flex gap-2 shrink-0 items-center">
                  <select
                    disabled={bulkBusy}
                    defaultValue=""
                    onChange={(e) => handleBulkStatus(e.target.value)}
                    className="bg-slate-700 rounded px-2 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="" disabled>
                      Changer le statut...
                    </option>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkBusy}
                    className="px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-xs font-medium disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    disabled={bulkBusy}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs disabled:opacity-50"
                  >
                    Vider
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-slate-400">Chargement...</p>
            ) : games.length === 0 ? (
              <p className="text-slate-400">Aucun jeu dans la bibliothèque pour le moment.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    onOpen={setDetailGame}
                    selected={selectedIds.has(game.id)}
                    onToggleSelect={toggleSelectGame}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {modalGame !== undefined && (
          <GameFormModal
            game={modalGame}
            onClose={() => setModalGame(undefined)}
            onSaved={() => {
              setModalGame(undefined);
              load();
            }}
          />
        )}

        {releaseSearchGame && (
          <ReleaseSearchModal
            game={releaseSearchGame}
            onClose={() => setReleaseSearchGame(null)}
            onUpdated={handleRefreshed}
          />
        )}

        {detailGame && (
          <GameDetailModal
            game={detailGame}
            onClose={() => setDetailGame(null)}
            onEdit={setModalGame}
            onDelete={handleDelete}
            onRefreshed={handleRefreshed}
            onSearchReleases={prowlarrConfigured ? setReleaseSearchGame : null}
          />
        )}
      </main>
    </div>
  );
}
