import { Router } from "express";
import { isConfigured, searchReleases, listIndexers, grabRelease } from "../services/prowlarr.js";
import { logSearch, logGrab } from "../services/history.js";

export const prowlarrRouter = Router();

prowlarrRouter.get("/status", (req, res) => {
  res.json({ configured: isConfigured() });
});

prowlarrRouter.post("/indexers", async (req, res) => {
  const { url, apiKey } = req.body || {};
  if (!url || !apiKey) {
    return res.status(400).json({ error: "URL et clé API requis" });
  }

  try {
    res.json(await listIndexers(url, apiKey));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

prowlarrRouter.get("/search", async (req, res) => {
  const { q, gameId, gameTitle } = req.query;
  if (!q) return res.status(400).json({ error: "q is required" });
  if (!isConfigured()) {
    return res.status(400).json({ error: "Prowlarr is not configured" });
  }

  try {
    const results = await searchReleases(q);
    logSearch({
      gameId: gameId ? Number(gameId) : null,
      gameTitle: gameTitle || null,
      query: q,
      resultCount: results.length,
    });
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

prowlarrRouter.post("/grab", async (req, res) => {
  const { guid, indexerId, gameId, gameTitle, releaseTitle, indexer, sizeBytes } = req.body || {};
  if (!guid || !indexerId) {
    return res.status(400).json({ error: "guid et indexerId requis" });
  }
  if (!isConfigured()) {
    return res.status(400).json({ error: "Prowlarr is not configured" });
  }

  try {
    await grabRelease(guid, indexerId);
    logGrab({
      gameId: gameId ? Number(gameId) : null,
      gameTitle: gameTitle || null,
      releaseTitle: releaseTitle || null,
      indexer: indexer || null,
      sizeBytes: sizeBytes ?? null,
    });
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
