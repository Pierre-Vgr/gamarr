import { getSecret } from "../../config/secrets.js";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const API_URL = "https://api.igdb.com/v4/games";

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
    platforms: (game.platforms || []).map((p) => p.name),
    genres: (game.genres || []).map((g) => g.name),
  };
}

export const igdbProvider = {
  id: "igdb",
  isConfigured,

  async search(queryText) {
    if (!isConfigured()) throw new Error("IGDB is not configured");
    const safe = queryText.replace(/"/g, '\\"');
    const results = await query(
      `search "${safe}"; fields name,cover.url,first_release_date,platforms.name,genres.name; limit 10;`
    );
    return results.map(mapGame);
  },

  async getDetails(externalId) {
    if (!isConfigured()) throw new Error("IGDB is not configured");
    const results = await query(
      `fields name,summary,cover.url,first_release_date,platforms.name,genres.name; where id = ${Number(
        externalId
      )};`
    );
    if (!results.length) throw new Error("Game not found on IGDB");
    return mapGame(results[0]);
  },
};
