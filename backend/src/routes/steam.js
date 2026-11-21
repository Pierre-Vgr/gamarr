import { Router } from "express";
import { getSecret } from "../config/secrets.js";
import { isConfigured, getOwnedGames } from "../services/steam.js";

export const steamRouter = Router();

steamRouter.get("/status", (req, res) => {
  res.json({ configured: isConfigured() });
});

// Titres bruts des jeux Steam possédés, pour que le frontend puisse signaler
// dans Découvrir qu'un résultat est déjà possédé (comparaison par titre
// normalisé côté client, pas d'appel supplémentaire par résultat affiché).
steamRouter.get("/library", async (req, res) => {
  if (!isConfigured()) return res.json({ configured: false, titles: [] });

  try {
    const games = await getOwnedGames(getSecret("STEAM_API_KEY"), getSecret("STEAM_ID"));
    res.json({ configured: true, titles: games.map((g) => g.name) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
