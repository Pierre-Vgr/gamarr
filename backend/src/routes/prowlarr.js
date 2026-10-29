import { Router } from "express";
import { isConfigured, searchReleases } from "../services/prowlarr.js";

export const prowlarrRouter = Router();

prowlarrRouter.get("/status", (req, res) => {
  res.json({ configured: isConfigured() });
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
