import { StatusBadge } from "./StatusBadge.jsx";

export function GameCard({ game, onEdit, onDelete }) {
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
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
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
