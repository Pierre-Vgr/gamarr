import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { getProvider, listProviders } from "./metadataProviders/index.js";

const updateMetadata = db.prepare(`
  UPDATE games SET
    cover_url = @cover_url, description = @description, release_date = @release_date,
    platforms = @platforms, genres = @genres, external_id = @external_id,
    updated_at = datetime('now')
  WHERE id = @id
`);

export async function enrichGame(game, { query, providerId } = {}) {
  const provider = providerId
    ? { id: providerId, configured: getProvider(providerId).isConfigured() }
    : listProviders().find((p) => p.configured);

  if (!provider || !provider.configured) {
    throw new Error("No configured metadata provider");
  }

  const results = await getProvider(provider.id).search(query || game.title);
  if (!results.length) {
    throw new Error("No match found");
  }

  const details = await getProvider(provider.id).getDetails(results[0].externalId);
  updateMetadata.run({
    id: game.id,
    cover_url: details.coverUrl || null,
    description: details.description || null,
    release_date: details.releaseDate || null,
    platforms: JSON.stringify(details.platforms || []),
    genres: JSON.stringify(details.genres || []),
    external_id: details.externalId || null,
  });
  return serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(game.id));
}
