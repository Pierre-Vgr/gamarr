import { Router } from "express";
import { getProvider, listProviders } from "../services/metadataProviders/index.js";

export const metadataRouter = Router();

metadataRouter.get("/providers", (req, res) => {
  res.json(listProviders());
});

metadataRouter.get("/search", async (req, res) => {
  const { q, provider = "rawg" } = req.query;
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const results = await getProvider(provider).search(q);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

metadataRouter.get("/browse", async (req, res) => {
  const { provider = "rawg", page = "1" } = req.query;

  try {
    const impl = getProvider(provider);
    if (!impl.browse) {
      return res.status(400).json({ error: `${provider} does not support browsing` });
    }
    const results = await impl.browse(Number(page) || 1);
    res.json(results);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

metadataRouter.get("/:provider/:externalId/media", async (req, res) => {
  const { provider, externalId } = req.params;
  try {
    const impl = getProvider(provider);
    if (!impl.getMedia) return res.json({ screenshots: [], trailers: [] });
    res.json(await impl.getMedia(externalId));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

metadataRouter.get("/:provider/:externalId", async (req, res) => {
  const { provider, externalId } = req.params;
  try {
    const details = await getProvider(provider).getDetails(externalId);
    res.json(details);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
