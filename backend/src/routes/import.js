import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { LIBRARY_DIR } from "../config/paths.js";

export const importRouter = Router();

function cleanTitle(name) {
  let title = name.replace(/\.[a-zA-Z0-9]{1,4}$/, "");
  title = title.replace(/[._]+/g, " ");
  title = title.replace(/\s*[[(][^\])]*[\])]\s*/g, " ");
  title = title.replace(/\s+/g, " ").trim();
  return title || name;
}

function alreadyImported() {
  return new Set(
    db
      .prepare("SELECT import_path FROM games WHERE import_path IS NOT NULL")
      .all()
      .map((r) => r.import_path)
  );
}

importRouter.get("/scan", (req, res) => {
  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.json({ libraryDir: LIBRARY_DIR, exists: false, entries: [] });
  }

  const imported = alreadyImported();

  const entries = fs
    .readdirSync(LIBRARY_DIR, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => !imported.has(entry.name))
    .map((entry) => {
      const isDirectory = entry.isDirectory();
      let sizeBytes = null;
      if (!isDirectory) {
        try {
          sizeBytes = fs.statSync(path.join(LIBRARY_DIR, entry.name)).size;
        } catch {
          sizeBytes = null;
        }
      }
      return {
        name: entry.name,
        title: cleanTitle(entry.name),
        isDirectory,
        sizeBytes,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  res.json({ libraryDir: LIBRARY_DIR, exists: true, entries });
});

importRouter.post("/", (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "names must be a non-empty array" });
  }

  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const onDisk = new Set(fs.readdirSync(LIBRARY_DIR));
  const imported = alreadyImported();

  const insert = db.prepare(`
    INSERT INTO games (title, platforms, status, genres, source, import_path)
    VALUES (@title, '[]', 'backlog', '[]', 'import', @import_path)
  `);

  const created = [];
  const skipped = [];

  for (const name of names) {
    if (typeof name !== "string" || name.includes("/") || name.includes("..")) {
      skipped.push({ name, reason: "invalid name" });
      continue;
    }
    if (!onDisk.has(name)) {
      skipped.push({ name, reason: "not found in libraryDir" });
      continue;
    }
    if (imported.has(name)) {
      skipped.push({ name, reason: "already imported" });
      continue;
    }

    const result = insert.run({ title: cleanTitle(name), import_path: name });
    created.push(
      serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid))
    );
  }

  res.status(201).json({ created, skipped });
});
