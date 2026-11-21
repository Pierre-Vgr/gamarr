// Un match n'est "fiable" que si le titre nettoyé correspond exactement (une fois
// normalisé) au titre d'un résultat de recherche. Pas de correspondance approximative :
// en cas de doute, on laisse l'entrée pour un tri manuel plutôt que de risquer
// d'associer les mauvaises métadonnées (ex: un titre rétro obscur qui matcherait sinon
// le premier résultat RAWG non lié, avec sa plateforme "PC" qui n'a rien à voir).
//
// Partagé entre l'import (routes/import.js) et l'actualisation automatique des
// métadonnées (services/enrich.js).
function normalizeBase(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function finishNormalize(s) {
  return s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Deux conventions différentes existent pour un titre possessif selon qui a
// nommé le dossier : "Dragons Dogma" (apostrophe supprimée, le "s" reste,
// très fréquent) ou "Marvel Spider-Man" au lieu de "Marvel's Spider-Man" (le
// "'s" entier est supprimé). Comme on ne peut pas savoir laquelle s'applique,
// les deux variantes sont calculées et un match est accepté si l'une
// quelconque des variantes de la cible correspond à l'une quelconque des
// variantes du résultat — toujours une égalité exacte sur le texte obtenu,
// jamais une tolérance floue sur autre chose que cette apostrophe précise.
export function normalizeTitleVariants(s) {
  const base = normalizeBase(s);
  const apostropheOnly = finishNormalize(base.replace(/['’`]/g, ""));
  const possessive = finishNormalize(base.replace(/['’`]s\b/gi, "").replace(/['’`]/g, ""));
  return apostropheOnly === possessive ? [apostropheOnly] : [apostropheOnly, possessive];
}

export function findConfidentMatch(title, results) {
  const targets = normalizeTitleVariants(title);
  if (targets.every((t) => !t)) return null;
  return (
    results.find((r) => {
      const candidates = normalizeTitleVariants(r.title);
      return targets.some((t) => candidates.includes(t));
    }) || null
  );
}
