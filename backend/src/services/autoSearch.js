import { db } from "../db/index.js";
import { getSecret } from "../config/secrets.js";
import { isConfigured as isProwlarrConfigured, searchReleases, grabRelease } from "./prowlarr.js";
import { logSearch, logGrab } from "./history.js";

// Désactivée par défaut : grab automatiquement, pas juste un signal "disponible" —
// mérite un geste explicite de l'utilisateur plutôt qu'être actif dès que Prowlarr
// est configuré.
function isEnabled() {
  return getSecret("AUTO_SEARCH_ENABLED") === "true";
}

// Laisse le temps à un grab de se terminer (ou d'échouer clairement) avant de
// retenter sur le même jeu, plutôt que de le re-rechercher/re-grabber à chaque tick.
const GRAB_RETRY_COOLDOWN_HOURS = 24;

function eligibleGames() {
  const today = new Date().toISOString().slice(0, 10);
  // "demandé" (release_date inconnue) ou "pas disponible"/sorti (release_date passée) —
  // jamais "pas sorti" : chercher une release avant la sortie officielle n'a aucune
  // chance d'aboutir.
  return db
    .prepare("SELECT * FROM games WHERE status = 'wishlist' AND (release_date IS NULL OR release_date <= ?)")
    .all(today);
}

function lastGrabFor(gameId) {
  return db
    .prepare(
      "SELECT created_at, hardlink_status FROM history WHERE type = 'grab' AND game_id = ? ORDER BY created_at DESC, id DESC LIMIT 1"
    )
    .get(gameId);
}

function hoursSince(createdAt) {
  return (Date.now() - new Date(`${createdAt.replace(" ", "T")}Z`).getTime()) / 3_600_000;
}

function pickBest(results) {
  return [...results].sort(
    (a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0) || (b.seeders || 0) - (a.seeders || 0)
  )[0];
}

const markAvailability = db.prepare(
  "UPDATE games SET availability = ?, updated_at = datetime('now') WHERE id = ?"
);

// Appelé périodiquement (voir server.js) : pour chaque jeu wishlisté et sorti, relance
// la même recherche qu'un clic manuel sur "Rechercher une release" et grab
// automatiquement le meilleur résultat (préférences/blacklist déjà appliquées par
// searchReleases). Le grab passe par logGrab() comme un grab manuel, donc rejoint
// normalement le poller de hardlink (services/hardlink.js) une fois le téléchargement
// terminé — aucune double comptabilité à tenir ici.
export async function processAutoSearch() {
  if (!isEnabled() || !isProwlarrConfigured()) return;

  for (const game of eligibleGames()) {
    const lastGrab = lastGrabFor(game.id);
    if (lastGrab) {
      if (lastGrab.hardlink_status === "pending") continue; // déjà en cours de téléchargement
      if (hoursSince(lastGrab.created_at) < GRAB_RETRY_COOLDOWN_HOURS) continue;
    }

    let results;
    try {
      results = await searchReleases(game.title);
    } catch (err) {
      console.error(`Recherche automatique échouée pour "${game.title}": ${err.message}`);
      continue;
    }

    logSearch({ gameId: game.id, gameTitle: game.title, query: game.title, resultCount: results.length });
    // Même logique que ReleaseSearchModal : "pas disponible" si rien trouvé, sinon
    // levé — tient le badge de suivi à jour même sans ouvrir la fiche manuellement.
    markAvailability.run(results.length === 0 ? "unavailable" : null, game.id);
    if (results.length === 0) continue;

    const best = pickBest(results);
    try {
      await grabRelease(best.guid, best.indexerId);
      logGrab({
        gameId: game.id,
        gameTitle: game.title,
        releaseTitle: best.title,
        indexer: best.indexer,
        sizeBytes: best.sizeBytes,
      });
    } catch (err) {
      console.error(`Grab automatique échoué pour "${game.title}": ${err.message}`);
    }
  }
}
