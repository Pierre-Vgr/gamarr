import { getSecret } from "../../config/secrets.js";
import { filterPcPlatforms } from "./platforms.js";

const BASE_URL = "https://api.rawg.io/api";
const EXCLUDED_STORE_SLUGS = new Set(["playstation-store", "xbox-store", "nintendo"]);

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
      platforms: filterPcPlatforms((game.platforms || []).map((p) => p.platform.name)),
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
      platforms: filterPcPlatforms((game.platforms || []).map((p) => p.platform.name)),
      genres: (game.genres || []).map((g) => g.name),
    };
  },

  async getStores(externalId) {
    const [gameStores, storeCatalog] = await Promise.all([fetchGameStores(externalId), fetchStoreCatalog()]);

    return gameStores
      .map((entry) => {
        const store = storeCatalog.get(entry.store_id);
        if (!store || EXCLUDED_STORE_SLUGS.has(store.slug)) return null;
        return { name: store.name, slug: store.slug, url: entry.url || null };
      })
      .filter(Boolean);
  },
};

let storeCatalogCache = null;

async function fetchStoreCatalog() {
  if (storeCatalogCache) return storeCatalogCache;

  const url = new URL(`${BASE_URL}/stores`);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAWG store catalog failed: ${res.status}`);
  const data = await res.json();

  storeCatalogCache = new Map(
    (data.results || []).map((s) => [s.id, { name: s.name, slug: s.slug }])
  );
  return storeCatalogCache;
}

async function fetchGameStores(externalId) {
  const url = new URL(`${BASE_URL}/games/${externalId}/stores`);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url);
  if (!res.ok) throw new Error(`RAWG stores failed: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").trim();
}
