import { useState } from "react";

function formatCandidates(candidates) {
  if (!candidates?.length) return null;
  return candidates
    .map((c) => `${c.title}${c.releaseDate ? ` (${c.releaseDate.slice(0, 4)})` : ""}`)
    .join(", ");
}

// Détail diagnostic pour une entrée laissée de côté (ou importée sans
// métadonnées) par l'import automatique : le titre recherché et les
// suggestions les plus proches trouvées chez le fournisseur de métadonnées,
// pour comprendre soi-même pourquoi le match exact a échoué sans avoir à
// relancer une recherche à la main.
export function ImportDiagnostics({ items }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} className="text-xs text-indigo-400 hover:underline">
        {open ? "Masquer le détail" : `Voir le détail (${items.length})`}
      </button>
      {open && (
        <ul className="mt-2 space-y-2 max-h-72 overflow-y-auto bg-slate-900 rounded p-2 text-xs">
          {items.map((item) => (
            <li key={item.name} className="border-b border-slate-800 pb-2 last:border-0 last:pb-0">
              <p className="text-slate-300 truncate" title={item.name}>
                {item.name}
              </p>
              <p className="text-slate-500">{item.reason}</p>
              {item.query && (
                <p className="text-slate-500">
                  recherché : <span className="text-slate-400">"{item.query}"</span>
                </p>
              )}
              {item.matchedTitle && (
                <p className="text-slate-500">
                  déjà en bibliothèque sous : <span className="text-slate-400">{item.matchedTitle}</span>
                </p>
              )}
              {formatCandidates(item.candidates) && (
                <p className="text-slate-500">
                  suggestions : <span className="text-slate-400">{formatCandidates(item.candidates)}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
