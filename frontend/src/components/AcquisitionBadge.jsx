// Suivi d'acquisition pour les jeux en wishlist, façon Sonarr/Radarr
// (monitored/missing/downloaded) : demandé -> pas sorti -> pas disponible -> ok
// une fois réellement possédé (importé).
export function getAcquisitionStatus(game) {
  if (game.status !== "wishlist") return "owned";
  if (game.availability === "unavailable") return "unavailable";
  if (game.release_date) {
    const release = new Date(game.release_date);
    if (!Number.isNaN(release.getTime()) && release > new Date()) return "unreleased";
  }
  return "requested";
}

const STYLES = {
  owned: "bg-emerald-900 text-emerald-200",
  unreleased: "bg-amber-900 text-amber-200",
  unavailable: "bg-red-900 text-red-200",
  requested: "bg-indigo-900 text-indigo-200",
};

const LABELS = {
  owned: "Ok",
  unreleased: "Pas sorti",
  unavailable: "Pas disponible",
  requested: "Demandé",
};

export const ACQUISITION_STATUS_OPTIONS = Object.keys(LABELS).map((value) => ({
  value,
  label: LABELS[value],
}));

export function AcquisitionBadge({ game }) {
  const key = getAcquisitionStatus(game);
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STYLES[key]}`}>{LABELS[key]}</span>
  );
}
