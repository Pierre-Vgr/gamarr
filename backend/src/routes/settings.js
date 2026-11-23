import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { getAllSecrets, updateSecrets, hasSecretsFile } from "../config/secrets.js";
import { testRawgKey } from "../services/metadataProviders/rawg.js";
import { testIgdbCredentials } from "../services/metadataProviders/igdb.js";
import { testProwlarrConnection } from "../services/prowlarr.js";
import { testSteamConnection } from "../services/steam.js";
import { testQbittorrentConnection } from "../services/qbittorrent.js";
import { DATA_DIR, CONFIG_DIR } from "../config/paths.js";
import { DEFAULT_LIBRARY_SUBPATH, DEFAULT_DOWNLOADS_SUBPATH } from "../config/libraryPaths.js";
import { DEFAULT_DB_FILENAME, ACTIVE_DB_FILENAME } from "../db/index.js";

export const settingsRouter = Router();

const EDITABLE_FIELDS = [
  "RAWG_API_KEY",
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "PROWLARR_URL",
  "PROWLARR_API_KEY",
  "PROWLARR_INDEXER_IDS",
  "PROWLARR_PREFERRED_TERMS",
  "PROWLARR_BLOCKED_TERMS",
  "STEAM_API_KEY",
  "STEAM_ID",
  "QBITTORRENT_URL",
  "QBITTORRENT_USERNAME",
  "QBITTORRENT_PASSWORD",
  "LIBRARY_SUBPATH",
  "DOWNLOADS_SUBPATH",
  "AUTO_SEARCH_ENABLED",
  "DB_FILENAME",
];

const DEFAULTS = {
  LIBRARY_SUBPATH: DEFAULT_LIBRARY_SUBPATH,
  DOWNLOADS_SUBPATH: DEFAULT_DOWNLOADS_SUBPATH,
  AUTO_SEARCH_ENABLED: "false",
  DB_FILENAME: DEFAULT_DB_FILENAME,
};

function withDefaults(secrets) {
  const result = { firstRun: !hasSecretsFile() };
  for (const field of EDITABLE_FIELDS) {
    if (field === "PROWLARR_INDEXER_IDS") {
      result[field] = Array.isArray(secrets[field]) ? secrets[field] : [];
    } else {
      result[field] = secrets[field] || DEFAULTS[field] || "";
    }
  }
  return result;
}

settingsRouter.get("/", (req, res) => {
  res.json(withDefaults(getAllSecrets()));
});

settingsRouter.put("/", (req, res) => {
  const partial = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) partial[field] = req.body[field];
  }
  res.json(withDefaults(updateSecrets(partial)));
});

settingsRouter.post("/test/rawg", async (req, res) => {
  const { RAWG_API_KEY } = req.body;
  if (!RAWG_API_KEY) return res.json({ valid: false, message: "Clé manquante" });

  try {
    res.json(await testRawgKey(RAWG_API_KEY));
  } catch (err) {
    res.status(502).json({ valid: false, message: err.message });
  }
});

settingsRouter.post("/test/igdb", async (req, res) => {
  const { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET } = req.body;
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    return res.json({ valid: false, message: "Identifiants manquants" });
  }

  try {
    res.json(await testIgdbCredentials(IGDB_CLIENT_ID, IGDB_CLIENT_SECRET));
  } catch (err) {
    res.status(502).json({ valid: false, message: err.message });
  }
});

settingsRouter.post("/test/prowlarr", async (req, res) => {
  const { PROWLARR_URL, PROWLARR_API_KEY } = req.body;
  if (!PROWLARR_URL || !PROWLARR_API_KEY) {
    return res.json({ valid: false, message: "URL ou clé manquante" });
  }

  try {
    res.json(await testProwlarrConnection(PROWLARR_URL, PROWLARR_API_KEY));
  } catch (err) {
    res.status(502).json({ valid: false, message: err.message });
  }
});

settingsRouter.post("/test/steam", async (req, res) => {
  const { STEAM_API_KEY, STEAM_ID } = req.body;
  if (!STEAM_API_KEY || !STEAM_ID) {
    return res.json({ valid: false, message: "Clé API ou SteamID manquant" });
  }

  res.json(await testSteamConnection(STEAM_API_KEY, STEAM_ID));
});

settingsRouter.post("/test/qbittorrent", async (req, res) => {
  const { QBITTORRENT_URL, QBITTORRENT_USERNAME, QBITTORRENT_PASSWORD } = req.body;
  if (!QBITTORRENT_URL || !QBITTORRENT_USERNAME || !QBITTORRENT_PASSWORD) {
    return res.json({ valid: false, message: "URL, utilisateur ou mot de passe manquant" });
  }

  res.json(await testQbittorrentConnection(QBITTORRENT_URL, QBITTORRENT_USERNAME, QBITTORRENT_PASSWORD));
});

settingsRouter.post("/test/storage", (req, res) => {
  const { LIBRARY_SUBPATH, DOWNLOADS_SUBPATH } = req.body;
  const libraryDir = path.join(DATA_DIR, LIBRARY_SUBPATH || DEFAULT_LIBRARY_SUBPATH);
  const downloadsDir = path.join(DATA_DIR, DOWNLOADS_SUBPATH || DEFAULT_DOWNLOADS_SUBPATH);

  if (!fs.existsSync(libraryDir)) {
    return res.json({
      valid: false,
      message: `${libraryDir} introuvable — vérifie le montage du volume ${DATA_DIR} et ce sous-chemin`,
    });
  }
  if (!fs.existsSync(downloadsDir)) {
    return res.json({
      valid: true,
      message: `Bibliothèque OK. ${downloadsDir} n'existe pas encore (sera créé par qBittorrent au premier téléchargement, ou crée-le toi-même).`,
    });
  }
  res.json({ valid: true });
});

settingsRouter.post("/test/database", (req, res) => {
  const requested = path.basename(req.body.DB_FILENAME || "") || DEFAULT_DB_FILENAME;
  if (requested.startsWith(".")) {
    return res.json({ valid: false, message: "Nom de fichier invalide" });
  }

  const current = requested === ACTIVE_DB_FILENAME ? " (fichier actuellement utilisé)" : "";
  const fullPath = path.join(CONFIG_DIR, requested);

  if (!fs.existsSync(fullPath)) {
    return res.json({ valid: true, message: `${requested} sera créé au redémarrage${current}` });
  }
  const sizeKb = Math.round(fs.statSync(fullPath).size / 1024);
  res.json({ valid: true, message: `${requested} existe déjà (${sizeKb} Ko)${current}` });
});
