import { Router } from "express";
import { db } from "../db/index.js";
import { serializeGame as serialize } from "../models/game.js";

export const gamesRouter = Router();

const STATUSES = ["wishlist", "backlog", "playing", "completed", "abandoned"];

gamesRouter.get("/", (req, res) => {
  const { status, platform, search, sort = "title" } = req.query;

  const sortColumns = {
    title: "title COLLATE NOCASE ASC",
    created_at: "created_at DESC",
    release_date: "release_date DESC",
    rating: "rating DESC",
  };
  const orderBy = sortColumns[sort] || sortColumns.title;

  let rows = db.prepare("SELECT * FROM games").all();

  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter((r) => r.title.toLowerCase().includes(needle));
  }
  if (platform) {
    rows = rows.filter((r) => JSON.parse(r.platforms || "[]").includes(platform));
  }

  const games = rows.map(serialize);

  games.sort((a, b) => {
    if (sort === "created_at") return a.created_at < b.created_at ? 1 : -1;
    if (sort === "release_date") return (b.release_date || "") > (a.release_date || "") ? 1 : -1;
    if (sort === "rating") return (b.rating || 0) - (a.rating || 0);
    return a.title.localeCompare(b.title);
  });

  res.json(games);
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
    source: existing.source,
    external_id: existing.external_id,
    id: req.params.id,
  };

  db.prepare(`
    UPDATE games SET
      title = @title, platforms = @platforms, status = @status, cover_url = @cover_url,
      description = @description, release_date = @release_date, genres = @genres,
      rating = @rating, notes = @notes, updated_at = datetime('now')
    WHERE id = @id
  `).run(merged);

  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(req.params.id);
  res.json(serialize(row));
});

gamesRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM games WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Game not found" });
  res.status(204).end();
});
