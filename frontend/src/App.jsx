import { useEffect, useState, useCallback } from "react";
import { api } from "./api/client.js";
import { GameCard } from "./components/GameCard.jsx";
import { GameFormModal } from "./components/GameFormModal.jsx";
import { ImportModal } from "./components/ImportModal.jsx";
import { STATUS_OPTIONS } from "./components/StatusBadge.jsx";

export default function App() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("title");
  const [modalGame, setModalGame] = useState(undefined); // undefined = closed, null = new, object = edit
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listGames({ search, status, sort });
      setGames(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, sort]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(game) {
    if (!confirm(`Supprimer "${game.title}" de la bibliothèque ?`)) return;
    await api.deleteGame(game.id);
    load();
  }

  return (
    <div className="min-h-screen max-w-7xl mx-auto px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">🎮 Gamarr</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 font-medium"
          >
            Importer
          </button>
          <button
            onClick={() => setModalGame(null)}
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium"
          >
            + Ajouter un jeu
          </button>
        </div>
      </header>

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
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="title">Trier par titre</option>
          <option value="created_at">Trier par date d'ajout</option>
          <option value="release_date">Trier par date de sortie</option>
          <option value="rating">Trier par note</option>
        </select>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

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
              onEdit={setModalGame}
              onDelete={handleDelete}
            />
          ))}
        </div>
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

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            load();
          }}
        />
      )}
    </div>
  );
}
