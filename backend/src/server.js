import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./db/index.js";
import { gamesRouter } from "./routes/games.js";
import { metadataRouter } from "./routes/metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, "../public");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/games", gamesRouter);
app.use("/api/metadata", metadataRouter);
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use(express.static(STATIC_DIR));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Playnux backend listening on port ${PORT}`);
});
