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

metadataRouter.get("/:provider/:externalId", async (req, res) => {
  const { provider, externalId } = req.params;
  try {
    const details = await getProvider(provider).getDetails(externalId);
    res.json(details);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
