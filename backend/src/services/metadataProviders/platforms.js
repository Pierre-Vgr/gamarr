// Normalise les variantes de nom selon la source (RAWG, IGDB, ...) vers un libellé commun.
const PC_ALIASES = {
  PC: "PC",
  "PC (Microsoft Windows)": "PC",
  macOS: "macOS",
  Mac: "macOS",
  Linux: "Linux",
};

function dedupe(list) {
  const seen = new Set();
  const result = [];
  for (const raw of list) {
    if (raw && !seen.has(raw)) {
      seen.add(raw);
      result.push(raw);
    }
  }
  return result;
}

// Historiquement, ne gardait que PC/macOS/Linux (Gamarr visait uniquement les jeux PC).
// Mais un jeu exclusif à une autre plateforme (ex: Bloodborne, jamais sorti sur PC) n'a
// alors plus aucune plateforme du tout : "plateforme inconnue" alors que la métadonnée
// RAWG/IGDB est en réalité complète et fiable. On ne garde la réduction au PC que quand
// une version PC/macOS/Linux existe vraiment ; sinon on renvoie les plateformes réelles
// du jeu (ex: ["PlayStation 4"]), ce qui permet aussi son classement correct en Roms.
export function filterPcPlatforms(platforms) {
  const pcPlatforms = dedupe(platforms.map((raw) => PC_ALIASES[raw]));
  if (pcPlatforms.length > 0) return pcPlatforms;
  return dedupe(platforms);
}
