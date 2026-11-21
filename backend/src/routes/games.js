import { Router } from "express";
import { db } from "../db/index.js";
import { serializeGame as serialize } from "../models/game.js";
import { enrichGame } from "../services/enrich.js";

export const gamesRouter = Router();

const STATUSES = ["wishlist", "backlog", "playing", "completed", "abandoned"];

// Un jeu est considéré "Roms" (console) quand il a au moins une plateforme connue
// mais aucune d'entre elles n'est "PC" — un vrai jeu PC l'a toujours (RAWG/IGDB la
// liste, ou l'app s'y attend par défaut), alors qu'une ROM n'a que sa console
// (ex: "SNES", "Nintendo 3DS"), déduite du dossier par le filet de sécurité de
// l'import. Un jeu PC multi-plateforme dont la fiche liste aussi des consoles
// (portages) n'est donc pas compté comme Roms tant que "PC" y figure.
function isRomGame(platformsJson) {
  const platforms = JSON.parse(platformsJson || "[]");
  return platforms.length > 0 && !platforms.includes("PC");
}

gamesRouter.get("/", (req, res) => {
  const { status, platform, search, source, genre, store, category, sort = "title" } = req.query;

  let rows = db.prepare("SELECT * FROM games").all();

  if (status) rows = rows.filter((r) => r.status === status);
  if (source) rows = rows.filter((r) => r.source === source);
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle));
  }
  if (platform) {
    rows = rows.filter((r) => JSON.parse(r.platforms || "[]").includes(platform));
  }
  if (genre) {
    rows = rows.filter((r) => JSON.parse(r.genres || "[]").includes(genre));
  }
  if (store) {
    rows = rows.filter((r) => JSON.parse(r.stores || "[]").some((s) => s.slug === store));
  }
  if (category === "roms") {
    rows = rows.filter((r) => isRomGame(r.platforms));
  } else if (category === "games") {
    rows = rows.filter((r) => !isRomGame(r.platforms));
  }

  const games = rows.map(serialize);

  games.sort((a, b) => {
    if (sort === "created_at") return a.created_at < b.created_at ? 1 : -1;
    if (sort === "release_date") return (b.release_date || "") > (a.release_date || "") ? 1 : -1;
    if (sort === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sort === "source") return (a.source || "").localeCompare(b.source || "");
    return a.title.localeCompare(b.title);
  });

  res.json(games);
});

gamesRouter.get("/facets", (req, res) => {
  const rows = db.prepare("SELECT source, genres, platforms, stores FROM games").all();
  const sources = new Set();
  const genres = new Set();
  // Séparées : "platforms" alimente le filtre de la Bibliothèque (jeux PC), "romPlatforms"
  // les sous-menus de la section Roms — sinon le filtre plateforme de la Bibliothèque
  // proposerait des consoles qui n'y apparaissent jamais (catégorie "games" uniquement).
  const platforms = new Set();
  const romPlatforms = new Set();
  const stores = new Map(); // slug -> name, pour afficher un nom lisible (Steam, GOG...)

  for (const r of rows) {
    if (r.source) sources.add(r.source);
    for (const g of JSON.parse(r.genres || "[]")) genres.add(g);
    for (const s of JSON.parse(r.stores || "[]")) {
      if (s.slug) stores.set(s.slug, s.name || s.slug);
    }
    const gamePlatforms = JSON.parse(r.platforms || "[]");
    if (isRomGame(r.platforms)) {
      for (const p of gamePlatforms) romPlatforms.add(p);
    } else {
      for (const p of gamePlatforms) platforms.add(p);
    }
  }

  res.json({
    sources: [...sources].sort(),
    genres: [...genres].sort(),
    platforms: [...platforms].sort(),
    romPlatforms: [...romPlatforms].sort(),
    stores: [...stores.entries()]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
});

gamesRouter.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Game not found" });
  res.json(serialize(row));
});

gamesRouter.post("/", (req, res) => {
  const body = req.body;
  if (!body.title) return res.status(400).json({ error: "title is required" });
  if (body.status && !STATUSES.includes(body.status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }

  if (body.source && body.externalId) {
    const existing = db
      .prepare("SELECT id FROM games WHERE source = ? AND external_id = ?")
      .get(body.source, body.externalId);
    if (existing) {
      return res.status(409).json({
        error: "Ce jeu est déjà dans la bibliothèque",
        existingId: existing.id,
      });
    }
  }

  const stmt = db.prepare(`
    INSERT INTO games (title, platforms, status, cover_url, description, release_date, genres, rating, notes, source, external_id)
    VALUES (@title, @platforms, @status, @cover_url, @description, @release_date, @genres, @rating, @notes, @source, @external_id)
  `);

  const result = stmt.run({
    title: body.title,
    platforms: JSON.stringify(body.platforms || []),
    status: body.status || "backlog",
    cover_url: body.coverUrl || null,
    description: body.description || null,
    release_date: body.releaseDate || null,
    genres: JSON.stringify(body.genres || []),
    rating: body.rating ?? null,
    notes: body.notes || null,
    source: body.source || "manual",
    external_id: body.externalId || null,
  });

  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(serialize(row));
});

gamesRouter.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM games WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Game not found" });

  const body = req.body;
  if (body.status && !STATUSES.includes(body.status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }

  const merged = {
    title: body.title ?? existing.title,
    platforms: JSON.stringify(body.platforms ?? JSON.parse(existing.platforms)),
    status: body.status ?? existing.status,
    cover_url: body.coverUrl ?? existing.cover_url,
    description: body.description ?? existing.description,
    release_date: body.releaseDate ?? existing.release_date,
    genres: JSON.stringify(body.genres ?? JSON.parse(existing.genres)),
    rating: body.rating ?? existing.rating,
    notes: body.notes ?? existing.notes,
    // Explicitement remis à null quand une recherche Prowlarr trouve des
    // résultats : `??` ignorerait ce null et garderait l'ancienne valeur.
    availability: body.availability !== undefined ? body.availability : existing.availability,
    source: existing.source,
    external_id: existing.external_id,
    id: req.params.id,
  };

  db.prepare(`
    UPDATE games SET
      title = @title, platforms = @platforms, status = @status, cover_url = @cover_url,
      description = @description, release_date = @release_date, genres = @genres,
      rating = @rating, notes = @notes, availability = @availability, updated_at = datetime('now')
    WHERE id = @id
  `).run(merged);

  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(req.params.id);
  res.json(serialize(row));
});

// Déclarée avant "/:id/refresh-metadata" : Express matcherait sinon "bulk" comme
// valeur de :id sur cette route dynamique, vu la structure de chemin identique.
// Séquentiel (pas de parallélisation) : on reste poli envers l'API du provider de
// métadonnées configuré plutôt que de l'arroser de requêtes simultanées pour une
// sélection potentiellement large.
gamesRouter.post("/bulk/refresh-metadata", async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }

  let updated = 0;
  const failed = [];
  for (const id of ids) {
    const existing = db.prepare("SELECT * FROM games WHERE id = ?").get(id);
    if (!existing) {
      failed.push({ id, title: null, error: "Jeu introuvable" });
      continue;
    }
    try {
      await enrichGame(serialize(existing));
      updated++;
    } catch (err) {
      failed.push({ id, title: existing.title, error: err.message });
    }
  }

  res.json({ updated, failed });
});

gamesRouter.post("/:id/refresh-metadata", async (req, res) => {
  const existing = db.prepare("SELECT * FROM games WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Game not found" });

  const { query, provider, externalId } = req.body || {};

  try {
    const updated = await enrichGame(serialize(existing), { query, providerId: provider, externalId });
    res.json(updated);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

gamesRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM games WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Game not found" });
  res.status(204).end();
});

// Actions groupées pour la sélection multiple dans la grille (bibliothèque fusionnée).
gamesRouter.patch("/bulk/status", (req, res) => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${STATUSES.join(", ")}` });
  }

  const stmt = db.prepare("UPDATE games SET status = ?, updated_at = datetime('now') WHERE id = ?");
  const applyAll = db.transaction((rows) => {
    for (const id of rows) stmt.run(status, id);
  });
  applyAll(ids);

  res.json({ updated: ids.length });
});

gamesRouter.post("/bulk-delete", (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }

  const stmt = db.prepare("DELETE FROM games WHERE id = ?");
  const applyAll = db.transaction((rows) => {
    for (const id of rows) stmt.run(id);
  });
  applyAll(ids);

  res.json({ deleted: ids.length });
});
