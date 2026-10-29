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
  getGame: (id) => request(`/games/${id}`),
  createGame: (data) => request("/games", { method: "POST", body: JSON.stringify(data) }),
  updateGame: (id, data) => request(`/games/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteGame: (id) => request(`/games/${id}`, { method: "DELETE" }),
  refreshMetadata: (id, data = {}) =>
    request(`/games/${id}/refresh-metadata`, { method: "POST", body: JSON.stringify(data) }),

  listProviders: () => request("/metadata/providers"),
  searchMetadata: (q, provider = "rawg") =>
    request(`/metadata/search?q=${encodeURIComponent(q)}&provider=${provider}`),
  getMetadataDetails: (provider, externalId) => request(`/metadata/${provider}/${externalId}`),
  browseCatalog: (provider = "rawg", page = 1) =>
    request(`/metadata/browse?provider=${provider}&page=${page}`),

  scanImport: () => request("/import/scan"),
  importGames: (names) => request("/import", { method: "POST", body: JSON.stringify({ names }) }),

  prowlarrStatus: () => request("/prowlarr/status"),
  searchReleases: (q) => request(`/prowlarr/search?q=${encodeURIComponent(q)}`),

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
};
