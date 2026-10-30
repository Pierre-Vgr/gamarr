import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { getProvider, listProviders } from "./metadataProviders/index.js";
import { extractSteamAppId, getProtonTier } from "./protondb.js";

const updateMetadata = db.prepare(`
  UPDATE games SET
    cover_url = @cover_url, description = @description, release_date = @release_date,
    platforms = @platforms, genres = @genres, external_id = @external_id,
    stores = @stores, steam_app_id = @steam_app_id, proton_tier = @proton_tier,
    metacritic_score = @metacritic_score, community_rating = @community_rating,
    ratings_count = @ratings_count, updated_at = datetime('now')
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
    const results = await providerImpl.search(query || game.title);
    if (!results.length) {
      throw new Error("No match found");
    }
    matchedExternalId = results[0].externalId;
  }

  const details = await providerImpl.getDetails(matchedExternalId);
  const { stores, steamAppId, protonTier } = await fetchStoresAndProtonTier(
    providerImpl,
    matchedExternalId,
    game
  );

  updateMetadata.run({
    id: game.id,
    cover_url: details.coverUrl || null,
    description: details.description || null,
    release_date: details.releaseDate || null,
    platforms: JSON.stringify(details.platforms || []),
    genres: JSON.stringify(details.genres || []),
    external_id: details.externalId || null,
    stores: JSON.stringify(stores),
    steam_app_id: steamAppId,
    proton_tier: protonTier,
    metacritic_score: details.metacriticScore ?? null,
    community_rating: details.communityRating ?? null,
    ratings_count: details.ratingsCount ?? null,
  });
  return serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(game.id));
}
