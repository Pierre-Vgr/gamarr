import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./db/index.js";
import { gamesRouter } from "./routes/games.js";
import { metadataRouter } from "./routes/metadata.js";
import { importRouter } from "./routes/import.js";
import { prowlarrRouter } from "./routes/prowlarr.js";
import { settingsRouter } from "./routes/settings.js";
import { historyRouter } from "./routes/history.js";
import { steamRouter } from "./routes/steam.js";
import { qbittorrentRouter } from "./routes/qbittorrent.js";
import { processPendingHardlinks } from "./services/hardlink.js";
import { processAutoSearch } from "./services/autoSearch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "../public");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/games", gamesRouter);
app.use("/api/metadata", metadataRouter);
app.use("/api/import", importRouter);
app.use("/api/prowlarr", prowlarrRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/history", historyRouter);
app.use("/api/steam", steamRouter);
app.use("/api/qbittorrent", qbittorrentRouter);
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// En dev, le frontend est servi par son propre serveur Vite (voir docker-compose.dev.yml) ;
// ce dossier n'existe alors pas et on ne sert que l'API.
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Gamarr backend listening on port ${PORT}`);
});

// Hardlink des téléchargements qBittorrent terminés vers la bibliothèque (voir
// services/hardlink.js) — ne fait rien tant que qBittorrent n'est pas configuré.
const HARDLINK_POLL_INTERVAL_MS = 60_000;
setInterval(() => {
  processPendingHardlinks().catch((err) => console.error(`Hardlink poll failed: ${err.message}`));
}, HARDLINK_POLL_INTERVAL_MS);

// Recherche automatique des releases manquantes (voir services/autoSearch.js) —
// désactivée par défaut (réglage AUTO_SEARCH_ENABLED), ne fait rien tant que Prowlarr
// n'est pas configuré non plus.
const AUTO_SEARCH_POLL_INTERVAL_MS = 6 * 60 * 60_000; // 6h
setInterval(() => {
  processAutoSearch().catch((err) => console.error(`Auto search poll failed: ${err.message}`));
}, AUTO_SEARCH_POLL_INTERVAL_MS);
