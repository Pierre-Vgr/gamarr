import { getSecret } from "../../config/secrets.js";

const BASE_URL = "https://api.rawg.io/api";

function apiKey() {
  const key = getSecret("RAWG_API_KEY");
  if (!key) throw new Error("RAWG_API_KEY is not configured");
  return key;
}

export const rawgProvider = {
  id: "rawg",
  isConfigured() {
    return Boolean(getSecret("RAWG_API_KEY"));
  },

  async search(query) {
    const url = new URL(`${BASE_URL}/games`);
    url.searchParams.set("key", apiKey());
    url.searchParams.set("search", query);
    url.searchParams.set("page_size", "10");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`RAWG search failed: ${res.status}`);
    const data = await res.json();

    return (data.results || []).map((game) => ({
      source: "rawg",
      externalId: String(game.id),
      title: game.name,
      coverUrl: game.background_image || null,
      releaseDate: game.released || null,
      platforms: (game.platforms || []).map((p) => p.platform.name),
      genres: (game.genres || []).map((g) => g.name),
    }));
  },

  async getDetails(externalId) {
    const url = new URL(`${BASE_URL}/games/${externalId}`);
    url.searchParams.set("key", apiKey());

    const res = await fetch(url);
    if (!res.ok) throw new Error(`RAWG details failed: ${res.status}`);
    const game = await res.json();

    return {
      source: "rawg",
      externalId: String(game.id),
      title: game.name,
      coverUrl: game.background_image || null,
      description: stripHtml(game.description || ""),
      releaseDate: game.released || null,
      platforms: (game.platforms || []).map((p) => p.platform.name),
      genres: (game.genres || []).map((g) => g.name),
    };
  },
};

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").trim();
}
