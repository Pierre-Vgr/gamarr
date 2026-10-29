const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
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

  listProviders: () => request("/metadata/providers"),
  searchMetadata: (q, provider = "rawg") =>
    request(`/metadata/search?q=${encodeURIComponent(q)}&provider=${provider}`),
  getMetadataDetails: (provider, externalId) => request(`/metadata/${provider}/${externalId}`),

  scanImport: () => request("/import/scan"),
  importGames: (names) => request("/import", { method: "POST", body: JSON.stringify({ names }) }),
};
