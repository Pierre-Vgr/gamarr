import { StatusBadge } from "./StatusBadge.jsx";
import { ProtonBadge } from "./ProtonBadge.jsx";
import { MetacriticBadge } from "./MetacriticBadge.jsx";

export function GameCard({ game, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      className="group bg-slate-900 rounded-lg overflow-hidden shadow-lg hover:shadow-xl hover:ring-2 hover:ring-indigo-500 transition-all text-left"
    >
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
        {game.metacritic_score != null && (
          <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <MetacriticBadge score={game.metacritic_score} />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold truncate" title={game.title}>
          {game.title}
        </h3>
        <p className="text-xs text-slate-400 truncate">
          {game.platforms?.join(", ") || "Plateforme inconnue"}
        </p>
        {(game.stores?.length > 0 || game.proton_tier) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {game.stores?.map((s) => (
              <span
                key={s.slug || s.name}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300"
              >
                {s.name}
              </span>
            ))}
            <ProtonBadge tier={game.proton_tier} />
          </div>
        )}
      </div>
    </button>
  );
}
