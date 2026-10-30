import { useState } from "react";
import { GameInfoPanel } from "./GameInfoPanel.jsx";
import { api } from "../api/client.js";

export function GameDetailModal({ game, onClose, onEdit, onDelete, onRefreshed, onSearchReleases }) {
  const [current, setCurrent] = useState(game);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const updated = await api.refreshMetadata(current.id);
      setCurrent(updated);
      onRefreshed(updated);
    } catch (err) {
      setRefreshError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  function handleEdit() {
    onEdit(current);
    onClose();
  }

  function handleDelete() {
    onDelete(current);
    onClose();
  }

  function handleSearchReleases() {
    onSearchReleases(current);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <GameInfoPanel
          title={current.title}
          coverUrl={current.cover_url}
          platforms={current.platforms}
          releaseDate={current.release_date}
          genres={current.genres}
          status={current.status}
          stores={current.stores}
          protonTier={current.proton_tier}
          metacriticScore={current.metacritic_score}
          communityRating={current.community_rating}
          ratingsCount={current.ratings_count}
          description={current.description}
          notes={current.notes}
          personalRating={current.rating}
        />

        {refreshError && <p className="text-red-400 text-sm mt-3">{refreshError}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-6">
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded text-red-400 border border-red-900 hover:bg-red-950 font-medium"
          >
            Supprimer
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            >
              {refreshing ? "Actualisation..." : "Actualiser les métadonnées"}
            </button>
            {onSearchReleases && (
              <button
                onClick={handleSearchReleases}
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
              >
                Chercher une release
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600">
              Fermer
            </button>
            <button
              onClick={handleEdit}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
            >
              Modifier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
