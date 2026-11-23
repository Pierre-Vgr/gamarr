import { rawgProvider } from "./rawg.js";
import { igdbProvider } from "./igdb.js";

// IGDB en premier : préféré par défaut partout où un provider est choisi
// automatiquement (listProviders().find(p => p.configured)) — données et miniatures
// jugées plus pertinentes à l'usage. RAWG reste disponible en secours/alternative.
const providers = {
  igdb: igdbProvider,
  rawg: rawgProvider,
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
