import { useEffect, useState } from "react";
import { GameInfoPanel } from "./GameInfoPanel.jsx";
import { api } from "../api/client.js";

export function DiscoverDetailModal({ result, onClose, onAdd, isAdded, isAdding }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getMetadataDetails(result.source, result.externalId)
      .then(setDetails)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [result]);

  const data = details || result;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {loading ? (
          <p className="text-slate-400">Chargement...</p>
        ) : (
          <GameInfoPanel
            title={data.title}
            coverUrl={data.coverUrl}
            platforms={data.platforms}
            releaseDate={data.releaseDate}
            genres={data.genres}
            metacriticScore={data.metacriticScore}
            communityRating={data.communityRating}
            ratingsCount={data.ratingsCount}
            description={data.description}
          />
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="flex justify-end gap-2 pt-6">
          <button
            onClick={() => onAdd(result)}
            disabled={isAdding || isAdded}
            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 disabled:bg-emerald-800"
          >
            {isAdded ? "Ajouté ✓" : isAdding ? "Ajout..." : "+ Wishlist"}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
