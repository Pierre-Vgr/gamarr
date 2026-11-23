import { useEffect, useState, useCallback } from "react";
import { api } from "./api/client.js";
import { GameCard } from "./components/GameCard.jsx";
import { GameDetailModal } from "./components/GameDetailModal.jsx";
import { GameFormModal } from "./components/GameFormModal.jsx";
import { ImportView } from "./components/ImportView.jsx";
import { DiscoverView } from "./components/DiscoverView.jsx";
import { ReleaseSearchModal } from "./components/ReleaseSearchModal.jsx";
import { SettingsView, SETTINGS_CATEGORIES } from "./components/SettingsView.jsx";
import { HistoryView } from "./components/HistoryView.jsx";
import { STATUS_OPTIONS } from "./components/StatusBadge.jsx";

const NAV_ITEMS = [
  { id: "library", label: "Bibliothèque" },
  { id: "roms", label: "Roms" },
  { id: "wishlist", label: "Wishlist" },
  { id: "import", label: "Importer" },
  { id: "history", label: "Historique" },
  { id: "settings", label: "Paramètres" },
];

// "Découvrir" est un sous-menu de "Wishlist" (ajouter un résultat du catalogue l'y
// place) : pas de ligne de navigation à part entière, donc son libellé n'est pas dans
// NAV_ITEMS, mais le titre de page en a quand même besoin.
const VIEW_LABELS = Object.fromEntries(NAV_ITEMS.map((i) => [i.id, i.label]));
VIEW_LABELS.discover = "Découvrir";

export default function App() {
  const [view, setView] = useState("library");
  const [ready, setReady] = useState(false);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [genre, setGenre] = useState("");
  const [platform, setPlatform] = useState("");
  const [store, setStore] = useState("");
  const [sort, setSort] = useState("title");
  const [facets, setFacets] = useState({
    sources: [],
    genres: [],
    platforms: [],
    romPlatforms: [],
    stores: [],
    gamesCount: 0,
    romsCount: 0,
  });
  const [modalGame, setModalGame] = useState(undefined); // undefined = closed, null = new, object = edit
  const [detailGame, setDetailGame] = useState(null);
  const [releaseSearchGame, setReleaseSearchGame] = useState(null);
  const [prowlarrConfigured, setProwlarrConfigured] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  // Sous-menus (stores sous Bibliothèque, plateformes sous Roms, Découvrir sous
  // Wishlist, catégories sous Paramètres) dépliés par défaut ; repliables en cliquant
  // sur leur menu parent.
  const [expandedMenus, setExpandedMenus] = useState(new Set(["library", "roms", "wishlist", "settings"]));
  const [settingsCategory, setSettingsCategory] = useState("general");

  const isGridView = view === "library" || view === "wishlist" || view === "roms";

  // Laisse l'utilisateur finir de taper avant de relancer une requête réseau : sans
  // ça, chaque frappe dans le champ de recherche déclenchait un aller-retour complet.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

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
      const effectiveStatus = view === "wishlist" ? "wishlist" : status;
      // "games" exclut les Roms de la Bibliothèque : elles ont désormais leur propre
      // section, inutile qu'elles réapparaissent aussi ici.
      const effectiveCategory = view === "roms" ? "roms" : view === "library" ? "games" : "";
      const params = {
        search: debouncedSearch,
        status: effectiveStatus,
        sort,
        source,
        genre,
        platform,
        store,
        category: effectiveCategory,
      };
      const data = await api.listGames(params);
      setGames(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, source, genre, platform, store, sort, view, isGridView]);

  useEffect(() => {
    load();
  }, [load]);

  // Les facettes (stores, plateformes, genres...) ne peuvent changer qu'en touchant à
  // la bibliothèque elle-même (ajout/suppression/édition/import), jamais en filtrant —
  // inutile de les recharger à chaque changement de filtre/tri comme le faisait load().
  const refreshFacets = useCallback(() => {
    api.getGameFacets().then(setFacets).catch(() => {});
  }, []);

  async function reload() {
    await load();
    refreshFacets();
  }

  useEffect(() => {
    setSelectedIds(new Set());
  }, [view]);

  async function handleDelete(game) {
    if (!confirm(`Supprimer "${game.title}" de la bibliothèque ?`)) return;
    await api.deleteGame(game.id);
    reload();
  }

  function handleRefreshed(updatedGame) {
    setGames((prev) => prev.map((g) => (g.id === updatedGame.id ? updatedGame : g)));
    refreshFacets();
  }

  function toggleMenu(id) {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Centralise la navigation depuis un sous-élément de la sidebar : remet toujours
  // store/platform à vide sauf override explicite, pour ne jamais hériter du filtre
  // d'une autre section (ex: une plateforme Roms qui traînerait en vue Bibliothèque).
  function goTo(nextView, overrides = {}) {
    setView(nextView);
    setStore(overrides.store ?? "");
    setPlatform(overrides.platform ?? "");
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
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkRefresh() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkRefreshing(true);
    try {
      const { updated, failed } = await api.bulkRefreshMetadata(Array.from(selectedIds));
      setSelectedIds(new Set());
      await reload();
      if (failed.length > 0) {
        setError(
          `${updated} jeu(x) actualisé(s), ${failed.length} échec(s) : ${failed
            .map((f) => f.title || f.id)
            .join(", ")}`
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
      setBulkRefreshing(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} jeu(x) de la bibliothèque ?`)) return;
    setBulkBusy(true);
    try {
      await api.bulkDeleteGames(Array.from(selectedIds));
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-1 sticky top-0 h-screen overflow-y-auto">
        <h1 className="text-xl font-bold mb-4 px-2">🎮 Gamarr</h1>
        {NAV_ITEMS.map((item) => {
          const hasSubmenu =
            item.id === "library" || item.id === "roms" || item.id === "wishlist" || item.id === "settings";
          const expanded = expandedMenus.has(item.id);
          // Le menu parent replie/déplie son sous-menu ; accéder à son contenu se fait
          // toujours via un sous-élément ("Tout" inclus) pour ne pas avoir à deviner si
          // un clic sur le parent va naviguer ou juste (re)fermer la liste.
          const isSectionActive =
            item.id === "wishlist" ? view === "wishlist" || view === "discover" : view === item.id;

          return (
            <div key={item.id}>
              <button
                onClick={() => (hasSubmenu ? toggleMenu(item.id) : setView(item.id))}
                className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded font-medium ${
                  isSectionActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                {hasSubmenu && <span className="text-xs">{expanded ? "▾" : "▸"}</span>}
              </button>
              {item.id === "library" && expanded && (
                <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
                  <button
                    onClick={() => goTo("library")}
                    className={`flex items-center justify-between gap-2 text-left px-3 py-1.5 ml-3 rounded text-sm ${
                      view === "library" && store === ""
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>Tout</span>
                    <span className="text-xs opacity-70">{facets.gamesCount}</span>
                  </button>
                  {facets.stores.map((s) => (
                    <button
                      key={s.slug}
                      onClick={() => goTo("library", { store: s.slug })}
                      className={`flex items-center justify-between gap-2 text-left px-3 py-1.5 ml-3 rounded text-sm ${
                        view === "library" && store === s.slug
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <span>{s.name}</span>
                      <span className="text-xs opacity-70">{s.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {item.id === "roms" && expanded && (
                <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
                  <button
                    onClick={() => goTo("roms")}
                    className={`flex items-center justify-between gap-2 text-left px-3 py-1.5 ml-3 rounded text-sm ${
                      view === "roms" && platform === ""
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span>Tout</span>
                    <span className="text-xs opacity-70">{facets.romsCount}</span>
                  </button>
                  {facets.romPlatforms.map((p) => (
                    <button
                      key={p.platform}
                      onClick={() => goTo("roms", { platform: p.platform })}
                      className={`flex items-center justify-between gap-2 text-left px-3 py-1.5 ml-3 rounded text-sm ${
                        view === "roms" && platform === p.platform
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <span>{p.platform}</span>
                      <span className="text-xs opacity-70">{p.count}</span>
                    </button>
                  ))}
                </div>
              )}
              {item.id === "wishlist" && expanded && (
                <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
                  <button
                    onClick={() => goTo("wishlist")}
                    className={`text-left px-3 py-1.5 ml-3 rounded text-sm ${
                      view === "wishlist"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    Wishlist
                  </button>
                  <button
                    onClick={() => goTo("discover")}
                    className={`text-left px-3 py-1.5 ml-3 rounded text-sm ${
                      view === "discover"
                        ? "bg-indigo-600 text-white"
                        : "text-slate-500 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    Découvrir
                  </button>
                </div>
              )}
              {item.id === "settings" && expanded && (
                <div className="flex flex-col gap-0.5 mt-0.5 mb-1">
                  {SETTINGS_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        goTo("settings");
                        setSettingsCategory(cat.id);
                      }}
                      className={`text-left px-3 py-1.5 ml-3 rounded text-sm ${
                        view === "settings" && settingsCategory === cat.id
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      <main className="flex-1 px-6 py-6 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold">
            {VIEW_LABELS[view]}
          </h2>
          {isGridView && (
            <div className="flex gap-2">
              <button
                onClick={() => setModalGame(null)}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium"
              >
                {view === "wishlist" ? "+ Ajouter à la wishlist" : "+ Ajouter un jeu"}
              </button>
            </div>
          )}
        </div>

        {view === "import" && <ImportView onImported={reload} />}
        {view === "discover" && <DiscoverView />}
        {view === "history" && <HistoryView />}
        {view === "settings" && <SettingsView category={settingsCategory} />}

        {isGridView && (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <input
                className="bg-slate-800 rounded px-3 py-2 flex-1 min-w-[200px]"
                placeholder="Rechercher un jeu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {view === "library" && (
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
              )}
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
              {view !== "roms" && (
                <select
                  className="bg-slate-800 rounded px-3 py-2"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  <option value="">Toutes les plateformes</option>
                  {facets.platforms.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
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
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-800 rounded-lg p-2 mb-4 text-sm shadow-lg">
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
                    onClick={handleBulkRefresh}
                    disabled={bulkBusy}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-medium disabled:opacity-50"
                  >
                    {bulkRefreshing ? "Actualisation..." : "Actualiser les métadonnées"}
                  </button>
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
              <p className="text-slate-400">
                {debouncedSearch ? (
                  <>
                    Aucun résultat pour « {debouncedSearch} ».{" "}
                    <button onClick={() => setSearch("")} className="text-indigo-400 hover:underline">
                      Effacer la recherche
                    </button>
                  </>
                ) : view === "wishlist" ? (
                  "Aucun jeu en wishlist."
                ) : view === "roms" ? (
                  "Aucune Rom dans la bibliothèque."
                ) : (
                  "Aucun jeu dans la bibliothèque pour le moment."
                )}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,170px)] gap-4">
                {/* Taille de vignette fixe : plus d'espace = plus de colonnes, pas des
                    vignettes plus grandes. */}
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
            defaultStatus={view === "wishlist" ? "wishlist" : "backlog"}
            onClose={() => setModalGame(undefined)}
            onSaved={() => {
              setModalGame(undefined);
              reload();
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
