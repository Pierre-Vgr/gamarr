import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { getProvider, listProviders } from "./metadataProviders/index.js";
import { extractSteamAppId, getProtonTier } from "./protondb.js";
import { resolvePlatforms } from "./platformFallback.js";
import { findConfidentMatch } from "./titleMatch.js";

const updateMetadata = db.prepare(`
  UPDATE games SET
    cover_url = @cover_url, description = @description, release_date = @release_date,
    platforms = @platforms, genres = @genres, external_id = @external_id,
    source = @source, stores = @stores, steam_app_id = @steam_app_id,
    proton_tier = @proton_tier, metacritic_score = @metacritic_score,
    community_rating = @community_rating, ratings_count = @ratings_count,
    updated_at = datetime('now')
  WHERE id = @id
`);

async function fetchStoresAndProtonTier(provider, externalId, existingGame) {
  // Le provider ne fournit pas les stores (ex: IGDB) : on garde les valeurs déjà en base
  // plutôt que de les écraser avec du vide.
  const fallback = {
    stores: existingGame.stores || [],
    steamAppId: existingGame.steam_app_id || null,
    protonTier: existingGame.proton_tier || null,
  };

  if (!provider.getStores) return fallback;

  let stores = [];
  try {
    stores = await provider.getStores(externalId);
  } catch (err) {
    console.error(`Failed to fetch stores: ${err.message}`);
    return fallback;
  }

  const steamAppId = extractSteamAppId(stores);
  let protonTier = null;
  if (steamAppId) {
    try {
      protonTier = await getProtonTier(steamAppId);
    } catch (err) {
      console.error(`Failed to fetch ProtonDB tier for app ${steamAppId}: ${err.message}`);
    }
  }

  return { stores, steamAppId, protonTier };
}

export async function enrichGame(game, { query, providerId, externalId } = {}) {
  const provider = providerId
    ? { id: providerId, configured: getProvider(providerId).isConfigured() }
    : listProviders().find((p) => p.configured);

  if (!provider || !provider.configured) {
    throw new Error("No configured metadata provider");
  }

  const providerImpl = getProvider(provider.id);

  // Si on connaît déjà l'externalId exact (résultat choisi manuellement), on l'utilise
  // directement plutôt que de re-chercher par titre, qui pourrait matcher autre chose.
  let matchedExternalId = externalId;
  if (!matchedExternalId) {
    const searchTitle = query || game.title;
    const results = await providerImpl.search(searchTitle);
    if (!results.length) {
      throw new Error("No match found");
    }
    // Comme à l'import : un titre rétro obscur peut ne matcher exactement aucun
    // résultat RAWG/IGDB (pas de fiche, ou mal référencée) — prendre le premier résultat
    // quand même lui ferait hériter de métadonnées sans rapport (plateforme "PC" d'un
    // jeu totalement différent, par exemple), pire que ne pas actualiser du tout.
    const match = findConfidentMatch(searchTitle, results);
    if (!match) {
      throw new Error("Aucune correspondance fiable trouvée pour ce titre");
    }
    matchedExternalId = match.externalId;
  }

  const details = await providerImpl.getDetails(matchedExternalId);
  const { stores, steamAppId, protonTier } = await fetchStoresAndProtonTier(
    providerImpl,
    matchedExternalId,
    game
  );

  // Le rangement sur disque (Roms/<plateforme>, recomp) prime toujours sur la
  // métadonnée pour un jeu importé — sinon actualiser les métadonnées d'une Rom
  // écraserait sa plateforme par celle (possiblement fausse, pour un titre qui existe
  // sur plusieurs plateformes) renvoyée par le provider. Pour un jeu sans import_path
  // (ajout manuel, Découvrir...), la métadonnée reste seule autorité.
  const platforms = resolvePlatforms(game.import_path, game.title, details.platforms || []);

  updateMetadata.run({
    id: game.id,
    cover_url: details.coverUrl || null,
    description: details.description || null,
    release_date: details.releaseDate || null,
    platforms: JSON.stringify(platforms),
    genres: JSON.stringify(details.genres || []),
    external_id: details.externalId || null,
    source: provider.id,
    stores: JSON.stringify(stores),
    steam_app_id: steamAppId,
    proton_tier: protonTier,
    metacritic_score: details.metacriticScore ?? null,
    community_rating: details.communityRating ?? null,
    ratings_count: details.ratingsCount ?? null,
  });
  return serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(game.id));
}
