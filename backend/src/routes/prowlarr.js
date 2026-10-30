import { Router } from "express";
import { isConfigured, searchReleases, listIndexers, grabRelease } from "../services/prowlarr.js";

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
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "q is required" });
  if (!isConfigured()) {
    return res.status(400).json({ error: "Prowlarr is not configured" });
  }

  try {
    const results = await searchReleases(q);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

prowlarrRouter.post("/grab", async (req, res) => {
  const { guid, indexerId } = req.body || {};
  if (!guid || !indexerId) {
    return res.status(400).json({ error: "guid et indexerId requis" });
  }
  if (!isConfigured()) {
    return res.status(400).json({ error: "Prowlarr is not configured" });
  }

  try {
    await grabRelease(guid, indexerId);
    res.status(204).end();
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
