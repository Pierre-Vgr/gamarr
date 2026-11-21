import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { formatSize } from "../utils/format.js";

function formatDate(s) {
  if (!s) return "";
  // SQLite datetime('now') renvoie "YYYY-MM-DD HH:MM:SS" en UTC.
  return new Date(`${s.replace(" ", "T")}Z`).toLocaleString();
}

const HARDLINK_LABELS = {
  pending: { label: "Lien en attente", className: "bg-amber-900 text-amber-200" },
  linked: { label: "Lié dans la bibliothèque", className: "bg-emerald-900 text-emerald-200" },
  failed: { label: "Échec du lien", className: "bg-red-900 text-red-200" },
};

function HardlinkBadge({ status, error }) {
  const info = HARDLINK_LABELS[status];
  if (!info) return null;
  return (
    <span
      title={error || undefined}
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${info.className}`}
    >
      {info.label}
    </span>
  );
}

export function HistoryView() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getHistory()
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!entries) return <p className="text-slate-400">Chargement...</p>;
  if (entries.length === 0) {
    return <p className="text-slate-400">Aucune recherche ni téléchargement enregistré pour le moment.</p>;
  }

  return (
    <ul className="space-y-1">
      {entries.map((e) => (
        <li key={e.id} className="bg-slate-900 rounded-lg p-3 flex items-center gap-3 text-sm">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
              e.type === "grab" ? "bg-emerald-900 text-emerald-200" : "bg-slate-700 text-slate-300"
            }`}
          >
            {e.type === "grab" ? "Téléchargement" : "Recherche"}
          </span>

          <div className="flex-1 min-w-0">
            {e.type === "grab" ? (
              <p className="truncate">
                <span className="text-slate-300">{e.release_title}</span>
                {e.indexer && <span className="text-slate-500"> · {e.indexer}</span>}
                {e.size_bytes != null && <span className="text-slate-500"> · {formatSize(e.size_bytes)}</span>}
              </p>
            ) : (
              <p className="truncate">
                <span className="text-slate-300">"{e.query}"</span>
                <span className="text-slate-500"> · {e.result_count} résultat(s)</span>
              </p>
            )}
            {e.game_title && <p className="text-xs text-slate-500 truncate">pour {e.game_title}</p>}
          </div>

          <HardlinkBadge status={e.hardlink_status} error={e.hardlink_error} />

          <span className="text-xs text-slate-500 shrink-0 whitespace-nowrap">{formatDate(e.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
