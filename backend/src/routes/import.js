import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { LIBRARY_DIR } from "../config/paths.js";
import { enrichGame } from "../services/enrich.js";

export const importRouter = Router();

async function tryEnrich(game) {
  try {
    return await enrichGame(game);
  } catch (err) {
    console.error(`Metadata enrichment failed for "${game.title}": ${err.message}`);
    return game;
  }
}

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

// Limite la profondeur pour éviter une récursion incontrôlée (arborescence très
// profonde, lien symbolique en boucle, etc.).
const MAX_SCAN_DEPTH = 6;

function classifyDir(absDir) {
  let dirents;
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return { files: 0, subdirs: 0 };
  }
  let files = 0;
  let subdirs = 0;
  for (const entry of dirents) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) subdirs++;
    else files++;
  }
  return { files, subdirs };
}

// Un dossier est traité comme un "dossier de jeu" (ex: Action/Baldurs Gate 3/
// avec ses .exe) dès qu'il contient au moins autant de fichiers directs que de
// sous-dossiers : son contenu représente alors un seul jeu (les quelques
// sous-dossiers éventuels, type Crack/Patch, sont ignorés). Un dossier qui
// contient surtout des sous-dossiers (ex: Action/, RPG/...) est traité comme
// une simple catégorie et on continue à descendre dedans ; les fichiers isolés
// qu'il contient malgré tout (archives) sont listés individuellement.
function scanDir(absDir, relPrefix, imported, depth, entries) {
  let dirents;
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of dirents) {
    if (entry.name.startsWith(".")) continue;

    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const absPath = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      const { files, subdirs } = classifyDir(absPath);
      if (files === 0 && subdirs === 0) continue;

      if (depth >= MAX_SCAN_DEPTH || files >= subdirs) {
        if (!imported.has(relPath)) {
          entries.push({ name: relPath, title: cleanTitle(entry.name), isDirectory: true, sizeBytes: null });
        }
      } else {
        scanDir(absPath, relPath, imported, depth + 1, entries);
      }
    } else {
      if (imported.has(relPath)) continue;
      let sizeBytes = null;
      try {
        sizeBytes = fs.statSync(absPath).size;
      } catch {
        sizeBytes = null;
      }
      entries.push({ name: relPath, title: cleanTitle(entry.name), isDirectory: false, sizeBytes });
    }
  }
}

importRouter.get("/scan", (req, res) => {
  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.json({ libraryDir: LIBRARY_DIR, exists: false, entries: [] });
  }

  const imported = alreadyImported();
  const entries = [];
  scanDir(LIBRARY_DIR, "", imported, 0, entries);
  entries.sort((a, b) => a.title.localeCompare(b.title));

  res.json({ libraryDir: LIBRARY_DIR, exists: true, entries });
});

// Accepte un chemin relatif éventuellement composé de plusieurs segments
// (ex: "Action/Baldurs Gate 3") pour supporter les sous-dossiers, tout en
// rejetant tout segment "." / ".." ou chemin absolu (path traversal).
function isSafeRelativePath(name) {
  if (typeof name !== "string" || name.length === 0 || path.isAbsolute(name)) return false;
  const segments = name.split("/");
  return segments.every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

importRouter.post("/", async (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "names must be a non-empty array" });
  }

  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const libraryRoot = path.resolve(LIBRARY_DIR);
  const imported = alreadyImported();

  const insert = db.prepare(`
    INSERT INTO games (title, platforms, status, genres, source, import_path)
    VALUES (@title, '[]', 'backlog', '[]', 'import', @import_path)
  `);

  const created = [];
  const skipped = [];

  for (const name of names) {
    if (!isSafeRelativePath(name)) {
      skipped.push({ name, reason: "invalid name" });
      continue;
    }

    const absPath = path.resolve(libraryRoot, name);
    if (absPath !== libraryRoot && !absPath.startsWith(libraryRoot + path.sep)) {
      skipped.push({ name, reason: "invalid name" });
      continue;
    }
    if (!fs.existsSync(absPath)) {
      skipped.push({ name, reason: "not found in libraryDir" });
      continue;
    }
    if (imported.has(name)) {
      skipped.push({ name, reason: "already imported" });
      continue;
    }

    const title = cleanTitle(path.basename(name));
    const result = insert.run({ title, import_path: name });
    const game = serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid));
    created.push(await tryEnrich(game));
  }

  res.status(201).json({ created, skipped });
});
