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
