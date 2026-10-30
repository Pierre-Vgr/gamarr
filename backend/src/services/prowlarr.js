import { getSecret, getAllSecrets } from "../config/secrets.js";

const PC_GAMES_CATEGORY = 4000; // catégorie Torznab/Newznab "PC"

function baseUrl() {
  const url = getSecret("PROWLARR_URL");
  if (!url) throw new Error("PROWLARR_URL is not configured");
  return url.replace(/\/$/, "");
}

function apiKey() {
  const key = getSecret("PROWLARR_API_KEY");
  if (!key) throw new Error("PROWLARR_API_KEY is not configured");
  return key;
}

export function isConfigured() {
  return Boolean(getSecret("PROWLARR_URL") && getSecret("PROWLARR_API_KEY"));
}

export async function searchReleases(query) {
  const url = new URL(`${baseUrl()}/api/v1/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("type", "search");
  url.searchParams.append("categories", String(PC_GAMES_CATEGORY));

  const indexerIds = getAllSecrets().PROWLARR_INDEXER_IDS;
  if (Array.isArray(indexerIds)) {
    for (const id of indexerIds) url.searchParams.append("indexerIds", String(id));
  }

  const res = await fetch(url, { headers: { "X-Api-Key": apiKey() } });
  if (!res.ok) throw new Error(`Prowlarr search failed: ${res.status}`);
  const data = await res.json();

  return data.map((r) => ({
    title: r.title,
    indexer: r.indexer,
    sizeBytes: r.size ?? null,
    seeders: r.seeders ?? null,
    leechers: r.leechers ?? null,
    protocol: r.protocol || null,
    publishDate: r.publishDate || null,
    downloadUrl: r.downloadUrl || r.magnetUrl || null,
    infoUrl: r.infoUrl || null,
  }));
}

export async function listIndexers(url, apiKeyValue) {
  const indexersUrl = new URL(`${url.replace(/\/$/, "")}/api/v1/indexer`);

  const res = await fetch(indexersUrl, { headers: { "X-Api-Key": apiKeyValue } });
  if (!res.ok) throw new Error(`Prowlarr indexers failed: ${res.status}`);
  const data = await res.json();

  return data.map((i) => ({
    id: i.id,
    name: i.name,
    enabled: i.enable,
    protocol: i.protocol,
  }));
}

export async function testProwlarrConnection(url, apiKey) {
  let statusUrl;
  try {
    statusUrl = new URL(`${url.replace(/\/$/, "")}/api/v1/system/status`);
  } catch {
    return { valid: false, message: "URL invalide" };
  }

  try {
    const res = await fetch(statusUrl, { headers: { "X-Api-Key": apiKey } });
    if (res.ok) return { valid: true };
    if (res.status === 401) return { valid: false, message: "Clé API invalide" };
    return { valid: false, message: `Erreur Prowlarr (${res.status})` };
  } catch (err) {
    return { valid: false, message: `Connexion impossible : ${err.message}` };
  }
}
