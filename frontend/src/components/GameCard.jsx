import { useState } from "react";
import { StatusBadge } from "./StatusBadge.jsx";
import { api } from "../api/client.js";

export function GameCard({ game, onEdit, onDelete, onRefreshed }) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  async function handleRefresh(e) {
    e.stopPropagation();
    setRefreshing(true);
    setRefreshError(null);
    try {
      const updated = await api.refreshMetadata(game.id);
      onRefreshed(updated);
    } catch (err) {
      setRefreshError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="bg-slate-900 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow group">
      <div className="aspect-[3/4] bg-slate-800 relative">
        {game.cover_url ? (
          <img
            src={game.cover_url}
            alt={game.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">
            Pas de cover
          </div>
        )}
        <div className="absolute top-2 right-2">
          <StatusBadge status={game.status} />
        </div>
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(game)}
              className="px-3 py-1.5 rounded bg-slate-200 text-slate-900 text-sm font-medium hover:bg-white"
            >
              Modifier
            </button>
            <button
              onClick={() => onDelete(game)}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-500"
            >
              Supprimer
            </button>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1.5 rounded bg-slate-700 text-slate-100 text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
          >
            {refreshing ? "Actualisation..." : "Actualiser les métadonnées"}
          </button>
          {refreshError && <p className="text-red-400 text-xs text-center">{refreshError}</p>}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold truncate" title={game.title}>
          {game.title}
        </h3>
        <p className="text-xs text-slate-400 truncate">
          {game.platforms?.join(", ") || "Plateforme inconnue"}
        </p>
      </div>
    </div>
  );
}
