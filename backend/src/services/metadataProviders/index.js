import { rawgProvider } from "./rawg.js";
import { igdbProvider } from "./igdb.js";

const providers = {
  rawg: rawgProvider,
  igdb: igdbProvider,
};

export function listProviders() {
  return Object.values(providers).map((p) => ({
    id: p.id,
    configured: p.isConfigured(),
  }));
}

export function getProvider(id) {
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown metadata provider: ${id}`);
  return provider;
}
