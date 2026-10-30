import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { LIBRARY_DIR } from "../config/paths.js";
import { enrichGame } from "../services/enrich.js";
import { getProvider, listProviders } from "../services/metadataProviders/index.js";

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

function normalizeTitle(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Un match n'est "fiable" que si le titre nettoyé du dossier/fichier correspond
// exactement (une fois normalisé) au titre d'un résultat de recherche. Pas de
// correspondance approximative : en cas de doute, on laisse l'entrée pour un
// tri manuel plutôt que de risquer d'associer les mauvaises métadonnées.
function findConfidentMatch(title, results) {
  const target = normalizeTitle(title);
  if (!target) return null;
  return results.find((r) => normalizeTitle(r.title) === target) || null;
}

function isDuplicateExternal(source, externalId) {
  if (!externalId) return false;
  return Boolean(
    db.prepare("SELECT id FROM games WHERE source = ? AND external_id = ?").get(source, externalId)
  );
}

// Import "intelligent" : scanne la ludothèque et n'ajoute automatiquement que les
// entrées sans ambiguïté — un match de titre exact chez le provider de métadonnées
// configuré, et pas déjà présentes en bibliothèque. Tout le reste (titre ambigu,
// pas de résultat, release déjà possédée sous un autre nom de dossier) est laissé
// de côté pour un tri manuel, pour éviter le travail fastidieux sur une grosse
// ludothèque tout en restant fiable.
importRouter.post("/smart", async (req, res) => {
  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const provider = listProviders().find((p) => p.configured);
  if (!provider) {
    return res.status(400).json({ error: "Aucun provider de métadonnées configuré" });
  }
  const providerImpl = getProvider(provider.id);

  const imported = alreadyImported();
  const scanned = [];
  scanDir(LIBRARY_DIR, "", imported, 0, scanned);

  const insert = db.prepare(`
    INSERT INTO games (title, platforms, status, genres, source, import_path)
    VALUES (@title, '[]', 'backlog', '[]', 'import', @import_path)
  `);

  const created = [];
  const skipped = [];

  for (const entry of scanned) {
    let results;
    try {
      results = await providerImpl.search(entry.title);
    } catch (err) {
      skipped.push({ name: entry.name, reason: `recherche échouée: ${err.message}` });
      continue;
    }

    const match = findConfidentMatch(entry.title, results);
    if (!match) {
      skipped.push({ name: entry.name, reason: "pas de correspondance fiable" });
      continue;
    }

    if (isDuplicateExternal(provider.id, match.externalId)) {
      skipped.push({ name: entry.name, reason: "déjà présent en bibliothèque" });
      continue;
    }

    const result = insert.run({ title: cleanTitle(path.basename(entry.name)), import_path: entry.name });
    let game = serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid));
    try {
      game = await enrichGame(game, { externalId: match.externalId, providerId: provider.id });
    } catch (err) {
      console.error(`Metadata enrichment failed for "${game.title}": ${err.message}`);
    }
    created.push(game);
  }

  res.status(201).json({ created, skipped, totalScanned: scanned.length });
});

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
