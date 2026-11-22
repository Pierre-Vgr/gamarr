import { db } from "../db/index.js";

const selectStmt = db.prepare(
  "SELECT value, created_at FROM metadata_cache WHERE provider = ? AND kind = ? AND key = ?"
);
const upsertStmt = db.prepare(`
  INSERT INTO metadata_cache (provider, kind, key, value, created_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(provider, kind, key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at
`);

function ageSeconds(createdAt) {
  return (Date.now() - new Date(`${createdAt.replace(" ", "T")}Z`).getTime()) / 1000;
}

// Les fiches RAWG/IGDB (titre, plateformes, genres, cover...) changent rarement une
// fois publiées : un cache de plusieurs jours est sans risque pratique pour un usage de
// gestion de bibliothèque personnelle, et réduit fortement la consommation du quota
// RAWG (20 000 appels/mois sur l'offre gratuite) — surtout utile en phase de test, où
// les mêmes titres sont recherchés/réimportés à répétition.
//
// Si l'appel réel échoue (ex: quota épuisé) et qu'une valeur en cache existe, même
// expirée, elle est renvoyée plutôt que de faire échouer l'opération : dégrade en
// douceur sur des données un peu anciennes plutôt que de tout bloquer.
export async function withCache(provider, kind, key, ttlSeconds, fetchFn) {
  const row = selectStmt.get(provider, kind, key);
  if (row && ageSeconds(row.created_at) < ttlSeconds) {
    return JSON.parse(row.value);
  }

  try {
    const value = await fetchFn();
    upsertStmt.run(provider, kind, key, JSON.stringify(value));
    return value;
  } catch (err) {
    if (row) {
      console.error(
        `Metadata cache: ${provider}/${kind} a échoué (${err.message}), repli sur le cache expiré`
      );
      return JSON.parse(row.value);
    }
    throw err;
  }
}

export const CACHE_TTL = {
  SEARCH: 24 * 60 * 60,
  DETAILS: 7 * 24 * 60 * 60,
  STORES: 7 * 24 * 60 * 60,
  MEDIA: 7 * 24 * 60 * 60,
  BROWSE: 60 * 60,
};
