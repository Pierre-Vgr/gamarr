import { getSecret } from "../../config/secrets.js";
import { filterPcPlatforms } from "./platforms.js";

const BASE_URL = "https://api.rawg.io/api";
const EXCLUDED_STORE_SLUGS = new Set([
  "playstation-store",
  "xbox-store",
  "xbox360",
  "nintendo",
  "apple-appstore",
  "google-play",
  "itch",
]);

function apiKey() {
  const key = getSecret("RAWG_API_KEY");
  if (!key) throw new Error("RAWG_API_KEY is not configured");
  return key;
}

// RAWG renvoie souvent 401 pour autre chose qu'une clé invalide (ex: quota mensuel de
// l'offre gratuite épuisé, avec {"error": "The monthly API limit reached"}) — sans lire
// le corps de la réponse, ces cas s'affichaient à tort comme "clé invalide" alors que la
// clé est bonne. On relaie donc toujours le message réel de RAWG quand il y en a un.
async function assertOk(res, label) {
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  const detail = body?.error ? `: ${body.error}` : "";
  throw new Error(`${label} failed (${res.status})${detail}`);
}

export const rawgProvider = {
  id: "rawg",
  isConfigured() {
    return Boolean(getSecret("RAWG_API_KEY"));
  },

  async search(query, limit = 10) {
    const url = new URL(`${BASE_URL}/games`);
    url.searchParams.set("key", apiKey());
    url.searchParams.set("search", query);
    url.searchParams.set("page_size", String(Math.min(limit, 40)));

    const res = await fetch(url);
    await assertOk(res, "RAWG search");
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
    await assertOk(res, "RAWG details");
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
      metacriticScore: game.metacritic || null,
      communityRating: game.rating ? Math.round(game.rating * 20) : null, // RAWG note sur 5 -> /100
      ratingsCount: game.ratings_count || null,
    };
  },

  async browse(page = 1, mode = "all-time") {
    const url = new URL(`${BASE_URL}/games`);
    url.searchParams.set("key", apiKey());
    url.searchParams.set("page_size", "40"); // maximum accepté par RAWG
    url.searchParams.set("page", String(page));
    url.searchParams.set("platforms", "4"); // RAWG platform id 4 = PC

    const today = new Date().toISOString().slice(0, 10);
    const daysAgo = (n) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString().slice(0, 10);
    };

    if (mode === "new") {
      // Sorties récentes, triées par date de sortie.
      url.searchParams.set("ordering", "-released");
      url.searchParams.set("dates", `${daysAgo(60)},${today}`);
    } else if (mode === "trending") {
      // Jeux récents les plus populaires (proxy de "tendance", RAWG n'a pas de métrique dédiée).
      url.searchParams.set("ordering", "-added");
      url.searchParams.set("dates", `${daysAgo(90)},${today}`);
    } else {
      // all-time : popularité globale, sans filtre de date.
      url.searchParams.set("ordering", "-added");
    }

    const res = await fetch(url);
    await assertOk(res, "RAWG browse");
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

  async getMedia(externalId) {
    const screenshotsUrl = new URL(`${BASE_URL}/games/${externalId}/screenshots`);
    screenshotsUrl.searchParams.set("key", apiKey());
    const moviesUrl = new URL(`${BASE_URL}/games/${externalId}/movies`);
    moviesUrl.searchParams.set("key", apiKey());

    const [screenshotsRes, moviesRes] = await Promise.all([fetch(screenshotsUrl), fetch(moviesUrl)]);
    await assertOk(screenshotsRes, "RAWG screenshots");
    await assertOk(moviesRes, "RAWG movies");

    const screenshotsData = await screenshotsRes.json();
    const moviesData = await moviesRes.json();

    return {
      screenshots: (screenshotsData.results || []).map((s) => s.image).filter(Boolean),
      trailers: (moviesData.results || [])
        .map((m) => ({
          name: m.name,
          thumbnail: m.preview || null,
          videoUrl: m.data?.max || m.data?.["480"] || null,
          youtube: false,
        }))
        .filter((t) => t.videoUrl),
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
  await assertOk(res, "RAWG store catalog");
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
  await assertOk(res, "RAWG stores");
  const data = await res.json();
  return data.results || [];
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "").trim();
}

export async function testRawgKey(key) {
  const url = new URL(`${BASE_URL}/games`);
  url.searchParams.set("key", key);
  url.searchParams.set("page_size", "1");

  const res = await fetch(url);
  if (res.ok) return { valid: true };

  const body = await res.json().catch(() => null);
  if (body?.error) return { valid: false, message: body.error };
  if (res.status === 401 || res.status === 403) return { valid: false, message: "Clé invalide" };
  return { valid: false, message: `Erreur RAWG (${res.status})` };
}
