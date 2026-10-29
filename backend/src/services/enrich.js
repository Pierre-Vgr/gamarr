import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { getProvider, listProviders } from "./metadataProviders/index.js";
import { extractSteamAppId, getProtonTier } from "./protondb.js";

const updateMetadata = db.prepare(`
  UPDATE games SET
    cover_url = @cover_url, description = @description, release_date = @release_date,
    platforms = @platforms, genres = @genres, external_id = @external_id,
    stores = @stores, steam_app_id = @steam_app_id, proton_tier = @proton_tier,
    updated_at = datetime('now')
  WHERE id = @id
`);

async function fetchStoresAndProtonTier(provider, externalId) {
  if (!provider.getStores) return { stores: [], steamAppId: null, protonTier: null };

  let stores = [];
  try {
    stores = await provider.getStores(externalId);
  } catch (err) {
    console.error(`Failed to fetch stores: ${err.message}`);
    return { stores: [], steamAppId: null, protonTier: null };
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

export async function enrichGame(game, { query, providerId } = {}) {
  const provider = providerId
    ? { id: providerId, configured: getProvider(providerId).isConfigured() }
    : listProviders().find((p) => p.configured);

  if (!provider || !provider.configured) {
    throw new Error("No configured metadata provider");
  }

  const providerImpl = getProvider(provider.id);
  const results = await providerImpl.search(query || game.title);
  if (!results.length) {
    throw new Error("No match found");
  }

  const details = await providerImpl.getDetails(results[0].externalId);
  const { stores, steamAppId, protonTier } = await fetchStoresAndProtonTier(
    providerImpl,
    results[0].externalId
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
  });
  return serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(game.id));
}
