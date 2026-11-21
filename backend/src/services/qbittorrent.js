import { getSecret } from "../config/secrets.js";

// L'API WebUI de qBittorrent utilise un cookie de session (pas de clé API), obtenu via
// /api/v2/auth/login. Pas de notion d'expiration documentée de façon fiable : on se
// reconnecte simplement à chaque appel plutôt que de gérer un cache de session fragile
// (un torrent-poll toutes les minutes, le coût d'un login en plus est négligeable).

function baseUrl() {
  const url = getSecret("QBITTORRENT_URL");
  if (!url) throw new Error("QBITTORRENT_URL is not configured");
  return url.replace(/\/$/, "");
}

export function isConfigured() {
  return Boolean(
    getSecret("QBITTORRENT_URL") && getSecret("QBITTORRENT_USERNAME") && getSecret("QBITTORRENT_PASSWORD")
  );
}

async function login(url, username, password) {
  const res = await fetch(`${url}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });
  if (!res.ok) throw new Error(`Connexion qBittorrent échouée : ${res.status}`);
  const body = await res.text();
  if (body !== "Ok.") throw new Error("Identifiants qBittorrent invalides");

  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie) throw new Error("qBittorrent n'a renvoyé aucun cookie de session");
  return cookie;
}

async function withSession(url, username, password, fn) {
  const cookie = await login(url, username, password);
  return fn(cookie);
}

// Liste tous les torrents connus de qBittorrent (toutes catégories), avec leur nom,
// progression et chemin de contenu — suffisant pour retrouver par titre une release
// envoyée par Gamarr et vérifier si son téléchargement est terminé.
export async function listTorrents() {
  const url = baseUrl();
  const username = getSecret("QBITTORRENT_USERNAME");
  const password = getSecret("QBITTORRENT_PASSWORD");

  return withSession(url, username, password, async (cookie) => {
    const res = await fetch(`${url}/api/v2/torrents/info`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`Liste des torrents qBittorrent échouée : ${res.status}`);
    const data = await res.json();
    return data.map((t) => ({
      hash: t.hash,
      name: t.name,
      progress: t.progress, // 0..1
      state: t.state,
      contentPath: t.content_path || null,
      savePath: t.save_path || null,
    }));
  });
}

export async function testQbittorrentConnection(url, username, password) {
  const cleanUrl = (url || "").replace(/\/$/, "");
  try {
    await login(cleanUrl, username, password);
    return { valid: true };
  } catch (err) {
    return { valid: false, message: err.message };
  }
}
