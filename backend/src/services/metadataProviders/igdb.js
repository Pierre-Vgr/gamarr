import { getSecret } from "../../config/secrets.js";
import { filterPcPlatforms } from "./platforms.js";
import { withCache, CACHE_TTL } from "../metadataCache.js";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_URL = "https://api.igdb.com/v4/games";
// Identifiant IGDB de la plateforme "PC (Microsoft Windows)" (stable dans leur schéma,
// vérifié en conditions réelles : `where platforms = (6)` ne renvoie que des jeux PC).
const IGDB_PC_PLATFORM_ID = 6;
const BROWSE_PAGE_SIZE = 40;

let cachedToken = null; // { value, expiresAt, clientId }

function isConfigured() {
  return Boolean(getSecret("IGDB_CLIENT_ID") && getSecret("IGDB_CLIENT_SECRET"));
}

async function getToken() {
  const clientId = getSecret("IGDB_CLIENT_ID");

  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", getSecret("IGDB_CLIENT_SECRET"));
  url.searchParams.set("grant_type", "client_credentials");

  const res = await fetch(url, { method: "POST" });
  if (!res.ok) throw new Error(`IGDB auth failed: ${res.status}`);
  const data = await res.json();

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    clientId,
  };
  return cachedToken.value;
}

async function query(body) {
  const token = await getToken();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Client-ID": getSecret("IGDB_CLIENT_ID"),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) throw new Error(`IGDB query failed: ${res.status}`);
  return res.json();
}

function mapGame(game) {
  return {
    source: "igdb",
    externalId: String(game.id),
    title: game.name,
    coverUrl: game.cover?.url
      ? `https:${game.cover.url.replace("t_thumb", "t_cover_big")}`
      : null,
    description: game.summary || "",
    releaseDate: game.first_release_date
      ? new Date(game.first_release_date * 1000).toISOString().slice(0, 10)
      : null,
    platforms: filterPcPlatforms((game.platforms || []).map((p) => p.name)),
    genres: (game.genres || []).map((g) => g.name),
    metacriticScore: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
    communityRating: game.rating ? Math.round(game.rating) : null,
    ratingsCount: game.rating_count || null,
  };
}

export const igdbProvider = {
  id: "igdb",
  isConfigured,

  async search(queryText, limit = 10) {
    if (!isConfigured()) throw new Error("IGDB is not configured");
    return withCache("igdb", "search", `${queryText}::${limit}`, CACHE_TTL.SEARCH, async () => {
      const safe = queryText.replace(/"/g, '\\"');
      const results = await query(
        `search "${safe}"; fields name,cover.url,first_release_date,platforms.name,genres.name; limit ${Number(limit)};`
      );
      return results.map(mapGame);
    });
  },

  async getDetails(externalId) {
    if (!isConfigured()) throw new Error("IGDB is not configured");
    return withCache("igdb", "details", String(externalId), CACHE_TTL.DETAILS, async () => {
      const results = await query(
        `fields name,summary,cover.url,first_release_date,platforms.name,genres.name,aggregated_rating,rating,rating_count; where id = ${Number(
          externalId
        )};`
      );
      if (!results.length) throw new Error("Game not found on IGDB");
      return mapGame(results[0]);
    });
  },

  async browse(page = 1, mode = "all-time") {
    if (!isConfigured()) throw new Error("IGDB is not configured");
    return withCache("igdb", "browse", `${page}::${mode}`, CACHE_TTL.BROWSE, async () => {
      const offset = (Math.max(page, 1) - 1) * BROWSE_PAGE_SIZE;
      const now = Math.floor(Date.now() / 1000);
      const daysAgo = (n) => now - n * 86400;

      let where = `platforms = (${IGDB_PC_PLATFORM_ID})`;
      let sort = "total_rating_count desc";

      if (mode === "new") {
        // Sorties récentes, triées par date — même logique que le mode "new" de RAWG
        // (pur tri chronologique, pas de filtre de qualité).
        where += ` & first_release_date >= ${daysAgo(60)} & first_release_date <= ${now}`;
        sort = "first_release_date desc";
      } else if (mode === "trending") {
        // Jeux récents les plus populaires (proxy de "tendance", comme pour RAWG).
        where += ` & first_release_date >= ${daysAgo(90)} & first_release_date <= ${now}`;
      }
      // all-time : popularité globale, sans filtre de date.

      const results = await query(
        `fields name,cover.url,first_release_date,platforms.name,genres.name; where ${where}; sort ${sort}; limit ${BROWSE_PAGE_SIZE}; offset ${offset};`
      );
      return results.map(mapGame);
    });
  },

  async getMedia(externalId) {
    if (!isConfigured()) throw new Error("IGDB is not configured");
    return withCache("igdb", "media", String(externalId), CACHE_TTL.MEDIA, async () => {
      const results = await query(
        `fields screenshots.url,videos.video_id,videos.name; where id = ${Number(externalId)};`
      );
      if (!results.length) return { screenshots: [], trailers: [] };
      const game = results[0];

      return {
        screenshots: (game.screenshots || [])
          .map((s) => (s.url ? `https:${s.url.replace("t_thumb", "t_screenshot_big")}` : null))
          .filter(Boolean),
        trailers: (game.videos || [])
          .filter((v) => v.video_id)
          .map((v) => ({
            name: v.name,
            thumbnail: `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`,
            videoUrl: `https://www.youtube.com/embed/${v.video_id}`,
            youtube: true,
          })),
      };
    });
  },
};

export async function testIgdbCredentials(clientId, clientSecret) {
  const url = new URL(TOKEN_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const res = await fetch(url, { method: "POST" });
  if (res.ok) return { valid: true };
  if (res.status === 400 || res.status === 403) {
    return { valid: false, message: "Identifiants invalides" };
  }
  return { valid: false, message: `Erreur IGDB (${res.status})` };
}
