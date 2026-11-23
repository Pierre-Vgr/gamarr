const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listGames: (params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString();
    return request(`/games${query ? `?${query}` : ""}`);
  },
  getGameFacets: () => request("/games/facets"),
  getGame: (id) => request(`/games/${id}`),
  createGame: (data) => request("/games", { method: "POST", body: JSON.stringify(data) }),
  updateGame: (id, data) => request(`/games/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteGame: (id) => request(`/games/${id}`, { method: "DELETE" }),
  bulkUpdateStatus: (ids, status) =>
    request("/games/bulk/status", { method: "PATCH", body: JSON.stringify({ ids, status }) }),
  bulkDeleteGames: (ids) => request("/games/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
  refreshMetadata: (id, data = {}) =>
    request(`/games/${id}/refresh-metadata`, { method: "POST", body: JSON.stringify(data) }),
  bulkRefreshMetadata: (ids) =>
    request("/games/bulk/refresh-metadata", { method: "POST", body: JSON.stringify({ ids }) }),

  listProviders: () => request("/metadata/providers"),
  searchMetadata: (q, provider = "igdb", limit) =>
    request(
      `/metadata/search?q=${encodeURIComponent(q)}&provider=${provider}${limit ? `&limit=${limit}` : ""}`
    ),
  getMetadataDetails: (provider, externalId) => request(`/metadata/${provider}/${externalId}`),
  getMedia: (provider, externalId) => request(`/metadata/${provider}/${externalId}/media`),
  browseCatalog: (provider = "igdb", page = 1, mode = "all-time") =>
    request(`/metadata/browse?provider=${provider}&page=${page}&mode=${mode}`),

  scanImport: (path = "") => request(`/import/scan${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  previewImport: (path = "") =>
    request(`/import/preview${path ? `?path=${encodeURIComponent(path)}` : ""}`, { method: "POST" }),
  browseImport: (path = "") => request(`/import/browse?path=${encodeURIComponent(path)}`),
  importGames: (names) => request("/import", { method: "POST", body: JSON.stringify({ names }) }),
  smartImport: () => request("/import/smart", { method: "POST" }),
  importEntry: (data) => request("/import/entry", { method: "POST", body: JSON.stringify(data) }),

  prowlarrStatus: () => request("/prowlarr/status"),
  searchReleases: (q, game) =>
    request(
      `/prowlarr/search?q=${encodeURIComponent(q)}${game?.id ? `&gameId=${game.id}` : ""}${
        game?.title ? `&gameTitle=${encodeURIComponent(game.title)}` : ""
      }`
    ),
  grabRelease: (release, game) =>
    request("/prowlarr/grab", {
      method: "POST",
      body: JSON.stringify({
        guid: release.guid,
        indexerId: release.indexerId,
        releaseTitle: release.title,
        indexer: release.indexer,
        sizeBytes: release.sizeBytes,
        gameId: game?.id,
        gameTitle: game?.title,
      }),
    }),
  listProwlarrIndexers: (url, apiKey) =>
    request("/prowlarr/indexers", { method: "POST", body: JSON.stringify({ url, apiKey }) }),

  getHistory: (limit) => request(`/history${limit ? `?limit=${limit}` : ""}`),

  getSettings: () => request("/settings"),
  updateSettings: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),
  testRawg: (apiKey) =>
    request("/settings/test/rawg", { method: "POST", body: JSON.stringify({ RAWG_API_KEY: apiKey }) }),
  testIgdb: (clientId, clientSecret) =>
    request("/settings/test/igdb", {
      method: "POST",
      body: JSON.stringify({ IGDB_CLIENT_ID: clientId, IGDB_CLIENT_SECRET: clientSecret }),
    }),
  testProwlarr: (url, apiKey) =>
    request("/settings/test/prowlarr", {
      method: "POST",
      body: JSON.stringify({ PROWLARR_URL: url, PROWLARR_API_KEY: apiKey }),
    }),
  testSteam: (apiKey, steamId) =>
    request("/settings/test/steam", {
      method: "POST",
      body: JSON.stringify({ STEAM_API_KEY: apiKey, STEAM_ID: steamId }),
    }),
  testQbittorrent: (url, username, password) =>
    request("/settings/test/qbittorrent", {
      method: "POST",
      body: JSON.stringify({ QBITTORRENT_URL: url, QBITTORRENT_USERNAME: username, QBITTORRENT_PASSWORD: password }),
    }),
  testStorage: (librarySubpath, downloadsSubpath) =>
    request("/settings/test/storage", {
      method: "POST",
      body: JSON.stringify({ LIBRARY_SUBPATH: librarySubpath, DOWNLOADS_SUBPATH: downloadsSubpath }),
    }),
  testDatabase: (dbFilename) =>
    request("/settings/test/database", { method: "POST", body: JSON.stringify({ DB_FILENAME: dbFilename }) }),

  steamStatus: () => request("/steam/status"),
  getSteamLibrary: () => request("/steam/library"),
  qbittorrentStatus: () => request("/qbittorrent/status"),
};
