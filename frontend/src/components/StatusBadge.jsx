const STYLES = {
  wishlist: "bg-purple-900 text-purple-200",
  backlog: "bg-slate-700 text-slate-200",
  playing: "bg-emerald-900 text-emerald-200",
  completed: "bg-blue-900 text-blue-200",
  abandoned: "bg-red-900 text-red-200",
};

const LABELS = {
  wishlist: "Envie",
  backlog: "À jouer",
  playing: "En cours",
  completed: "Terminé",
  abandoned: "Abandonné",
};

export function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STYLES[status] || STYLES.backlog}`}>
      {LABELS[status] || status}
    </span>
  );
}

export const STATUS_OPTIONS = Object.keys(LABELS).map((value) => ({
  value,
  label: LABELS[value],
}));

// Pour le filtre de la vue Bibliothèque : la wishlist a sa propre vue dédiée.
export const LIBRARY_STATUS_OPTIONS = STATUS_OPTIONS.filter((opt) => opt.value !== "wishlist");
