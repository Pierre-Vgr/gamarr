import { getSecret } from "../config/secrets.js";

const BASE_URL = "https://api.steampowered.com";

export function isConfigured() {
  return Boolean(getSecret("STEAM_API_KEY") && getSecret("STEAM_ID"));
}

// Jeux Steam possédés par le compte configuré (API officielle, nécessite que
// le profil/les détails de jeu soient publics pour cette clé). Retourne la
// liste brute {appid, name} ; le filtrage/normalisation pour comparer à un
// titre RAWG se fait côté appelant.
export async function getOwnedGames(apiKey, steamId) {
  const url = new URL(`${BASE_URL}/IPlayerService/GetOwnedGames/v1/`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("include_appinfo", "true");
  url.searchParams.set("format", "json");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam Web API a répondu ${res.status}`);
  const data = await res.json();
  const games = data?.response?.games;
  if (!Array.isArray(games)) {
    // Réponse vide typique d'un profil/détails de jeu privés, même avec une
    // clé/SteamID valides : {"response": {}}.
    throw new Error("Aucun jeu renvoyé — le profil ou les détails de jeu sont probablement privés");
  }
  return games.map((g) => ({ appid: g.appid, name: g.name }));
}

export async function testSteamConnection(apiKey, steamId) {
  try {
    const games = await getOwnedGames(apiKey, steamId);
    return { valid: true, message: `${games.length} jeu(x) trouvé(s)` };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}
