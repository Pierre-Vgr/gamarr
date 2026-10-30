import { useState } from "react";
import { StatusBadge } from "./StatusBadge.jsx";
import { ProtonBadge } from "./ProtonBadge.jsx";
import { api } from "../api/client.js";

function MetacriticBadge({ score }) {
  if (score == null) return null;
  const color = score >= 75 ? "bg-emerald-700" : score >= 50 ? "bg-yellow-600" : "bg-red-700";
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded text-xs font-bold text-white shrink-0 ${color}`}
      title="Score Metacritic"
    >
      {score}
    </span>
  );
}

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
        <div className="flex gap-4">
          <div className="w-32 shrink-0 aspect-[3/4] bg-slate-800 rounded overflow-hidden">
            {current.cover_url ? (
              <img src={current.cover_url} alt={current.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs text-center p-2">
                Pas de cover
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-semibold">{current.title}</h2>
              <StatusBadge status={current.status} />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {current.platforms?.join(", ") || "Plateforme inconnue"}
              {current.release_date && ` · ${current.release_date.slice(0, 4)}`}
            </p>
            {current.genres?.length > 0 && (
              <p className="text-sm text-slate-500 mt-1">{current.genres.join(", ")}</p>
            )}
            {(current.metacritic_score != null || current.community_rating != null) && (
              <div className="flex items-center gap-3 mt-2">
                {current.metacritic_score != null && (
                  <div className="flex items-center gap-1.5">
                    <MetacriticBadge score={current.metacritic_score} />
                    <span className="text-xs text-slate-500">Metacritic</span>
                  </div>
                )}
                {current.community_rating != null && (
                  <span className="text-xs text-slate-400">
                    Note communauté : {current.community_rating}/100
                    {current.ratings_count ? ` (${current.ratings_count} avis)` : ""}
                  </span>
                )}
              </div>
            )}
            {(current.stores?.length > 0 || current.proton_tier) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {current.stores?.map((s) => (
                  <span
                    key={s.slug || s.name}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300"
                  >
                    {s.name}
                  </span>
                ))}
                <ProtonBadge tier={current.proton_tier} />
              </div>
            )}
            {current.rating != null && (
              <p className="text-sm text-slate-400 mt-2">Note : {current.rating} / 5</p>
            )}
          </div>
        </div>

        {current.description && (
          <p className="text-sm text-slate-300 mt-4 leading-relaxed">{current.description}</p>
        )}

        {current.notes && (
          <div className="mt-4 p-3 bg-slate-800 rounded">
            <p className="text-xs text-slate-500 mb-1">Notes personnelles</p>
            <p className="text-sm text-slate-300">{current.notes}</p>
          </div>
        )}

        {refreshError && <p className="text-red-400 text-sm mt-3">{refreshError}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-6">
          <button onClick={onClose} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600">
            Fermer
          </button>
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
          <button onClick={handleEdit} className="px-4 py-2 rounded bg-slate-200 text-slate-900 hover:bg-white">
            Modifier
          </button>
          <button onClick={handleDelete} className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
