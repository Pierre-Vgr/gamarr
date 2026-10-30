import { Router } from "express";
import { getAllSecrets, updateSecrets, hasSecretsFile } from "../config/secrets.js";
import { testRawgKey } from "../services/metadataProviders/rawg.js";
import { testIgdbCredentials } from "../services/metadataProviders/igdb.js";
import { testProwlarrConnection } from "../services/prowlarr.js";

export const settingsRouter = Router();

const EDITABLE_FIELDS = [
  "RAWG_API_KEY",
  "IGDB_CLIENT_ID",
  "IGDB_CLIENT_SECRET",
  "PROWLARR_URL",
  "PROWLARR_API_KEY",
  "PROWLARR_INDEXER_IDS",
];

function withDefaults(secrets) {
  const result = { firstRun: !hasSecretsFile() };
  for (const field of EDITABLE_FIELDS) {
    if (field === "PROWLARR_INDEXER_IDS") {
      result[field] = Array.isArray(secrets[field]) ? secrets[field] : [];
    } else {
      result[field] = secrets[field] || "";
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
