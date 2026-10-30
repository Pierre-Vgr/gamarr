import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { LIBRARY_DIR } from "../config/paths.js";
import { enrichGame } from "../services/enrich.js";
import { getProvider, listProviders } from "../services/metadataProviders/index.js";

export const importRouter = Router();

// Groupes de release/repack scène fréquents, accolés sans espace en préfixe
// (ex: "CODEX-Cities.Skylines...") ou en suffixe (ex: "Dragons.Dogma.2-Mephisto")
// une fois les points remplacés par des espaces. Liste volontairement limitée à
// des noms de groupes connus plutôt qu'un pattern générique sur "-mot final",
// pour ne pas tronquer un vrai titre du type "Half-Life".
const RELEASE_GROUPS = [
  "fitgirl",
  "codex",
  "plaza",
  "skidrow",
  "reloaded",
  "rune",
  "flt",
  "tenoke",
  "empress",
  "dodi",
  "elamigos",
  "razor1911",
  "hoodlum",
  "prophet",
  "cpy",
  "darksiders",
  "simplex",
  "fairlight",
  "mephisto",
  "goldberg",
  "repack",
  "p2p",
];
const RELEASE_GROUP_PATTERN = RELEASE_GROUPS.join("|");
const LEADING_GROUP_RE = new RegExp(`^(${RELEASE_GROUP_PATTERN})-`, "i");
const TRAILING_GROUP_RE = new RegExp(`-(${RELEASE_GROUP_PATTERN})$`, "i");

// Suffixes d'archive multi-volumes ("Game.part1.rar", "Game.7z.001") : il faut
// retirer tout le suffixe en un coup, sinon le numéro de volume reste collé au
// titre nettoyé (ex: "Game part1") et casse le matching.
const PART_ARCHIVE_RE = /\.part0*\d+\.(rar|zip|7z)$/i;
const VOLUME_ARCHIVE_RE = /\.(7z|zip)\.0*\d+$/i;

// "SteamRIP"/"GOG" peuvent être collés n'importe comment (espace, point,
// tiret...) selon la convention de nommage, contrairement aux tags de
// RELEASE_GROUPS qui ne sont retirés que s'ils sont accolés en préfixe/suffixe
// sans espace. Réservé aux marques assez distinctives pour être retirées
// n'importe où sans risquer de tronquer un vrai titre — à la différence de
// mots de RELEASE_GROUPS comme "reloaded" ou "darksiders" qui sont aussi de
// vrais mots/titres (ex: "The Matrix Reloaded"), donc volontairement laissés
// au cas accolé-sans-espace uniquement. Les séparateurs autour sont inclus
// dans le retrait pour ne pas laisser de tiret/point orphelin.
const DISTINCTIVE_BRAND_RE = /[\s._-]*\b(steam\s*rip(\.com)?|gog)\b[\s._-]*/gi;

// Bruit de fin fréquent sur les repacks, pas forcément entre crochets (déjà
// géré par le retrait de `[...]`/`(...)` ci-dessous) : numéro de version, de
// build, ou mention des DLC inclus. Le séparateur de version peut être un
// point OU un underscore selon que la conversion point/underscore -> espace a
// déjà eu lieu ou pas (cette fonction est appelée avant ET après). En boucle
// car ces segments peuvent se chaîner ("Game v1.2 + All DLCs").
const TRAILING_NOISE_RE =
  /[\s._-]+(v\d+([._]\d+)*|build\s*\d+|update\s*\d+|\+\s*(all\s+)?\d*\s*dlcs?(\s+included)?)$/i;

function stripTrailingNoise(title) {
  let previous;
  do {
    previous = title;
    title = title.replace(TRAILING_NOISE_RE, "").trim();
  } while (title !== previous);
  return title;
}

// Retire une extension de fichier plausible en fin de nom (.rar, .iso, .7z...).
// Rejette un suffixe purement numérique (".2042", ".23") : ce n'est jamais une
// vraie extension (même "7z" contient une lettre) mais presque toujours une
// année ou un numéro faisant partie du titre (ex: "Battlefield.2042"), qu'il
// ne faut pas perdre.
function stripFileExtension(name) {
  const match = name.match(/\.([a-zA-Z0-9]{1,4})$/);
  if (!match || /^\d+$/.test(match[1])) return name;
  return name.slice(0, -match[0].length);
}

function cleanTitle(name) {
  let title = name.replace(PART_ARCHIVE_RE, "").replace(VOLUME_ARCHIVE_RE, "");
  title = stripFileExtension(title);
  // Avant la conversion point/underscore -> espace, tant que "v1.12" a encore
  // son point littéral (sinon le motif de version ne matche plus du tout).
  title = stripTrailingNoise(title);
  title = title.replace(DISTINCTIVE_BRAND_RE, " ");
  title = title.replace(/[._]+/g, " ");
  title = title.replace(/\s*[[(][^\])]*[\])]\s*/g, " ");
  title = title.replace(LEADING_GROUP_RE, "");
  title = title.replace(TRAILING_GROUP_RE, "");
  title = title.replace(/\s+/g, " ").trim();
  // Et une deuxième fois après, pour le bruit qui n'apparaît qu'une fois les
  // séparateurs convertis en espaces (ex: bruit introduit par le retrait des
  // crochets, ou un tag de groupe qui en cachait un autre derrière).
  title = stripTrailingNoise(title);
  return title || name;
}

// Un seul fichier doit représenter toute une archive multi-volumes à l'import
// ("Game.part1.rar" ou "Game.rar"+.r00/.r01..., "Game.7z.001"+.002...) : les
// volumes suivants sont ignorés pour ne pas lister la même release plusieurs
// fois ni fausser le compte de jeux détectés.
function isNonFirstArchiveVolume(name) {
  const partMatch = name.match(/\.part0*(\d+)\.(rar|zip|7z)$/i);
  if (partMatch) return Number(partMatch[1]) > 1;

  const volumeMatch = name.match(/\.(7z|zip)\.0*(\d+)$/i);
  if (volumeMatch) return Number(volumeMatch[2]) > 1;

  // Game.r00, Game.r01... (suite d'un .rar classique) : jamais le premier volume.
  return /\.r\d{2,3}$/i.test(name);
}

function alreadyImported() {
  return new Set(
    db
      .prepare("SELECT import_path FROM games WHERE import_path IS NOT NULL")
      .all()
      .map((r) => r.import_path)
  );
}

// Un dossier déjà importé représente tout son contenu : si relPath est déjà
// importé, en est un sous-élément, ou en est le parent, c'est un doublon —
// aucun des trois ne doit être proposé ou accepté à l'import une deuxième fois.
function pathOverlapReason(relPath, importedSet) {
  for (const imported of importedSet) {
    if (imported === relPath) return "already imported";
    if (imported.startsWith(`${relPath}/`)) return "un sous-élément de ce chemin est déjà importé";
    if (relPath.startsWith(`${imported}/`)) return "le dossier parent est déjà importé";
  }
  return null;
}

// Variante utilisée avant de décider de descendre dans un dossier catégorie :
// seuls le match exact et le cas "parent déjà importé" rendent toute
// l'arborescence redondante et justifient de ne pas la parcourir du tout. Le
// cas "contient un sous-élément déjà importé" ne doit lui PAS bloquer la
// descente, sous peine de cacher les autres éléments pas encore importés.
function isFullyCovered(relPath, importedSet) {
  for (const imported of importedSet) {
    if (imported === relPath) return true;
    if (relPath.startsWith(`${imported}/`)) return true;
  }
  return false;
}

// Limite la profondeur pour éviter une récursion incontrôlée (arborescence très
// profonde, lien symbolique en boucle, etc.).
const MAX_SCAN_DEPTH = 6;

// Noms de sous-dossiers génériques qu'on trouve à l'intérieur d'UN jeu déjà
// installé/extrait (assets, support, extras...), par opposition à un vrai
// dossier catégorie dont les sous-dossiers sont d'AUTRES jeux. Un jeu avec
// beaucoup de ces sous-dossiers (Data/, bin/, Textures/...) peut facilement
// avoir plus de sous-dossiers que de fichiers à sa racine ; sans ça, il serait
// à tort traité comme une catégorie et chacun de ses sous-dossiers scanné comme
// un jeu séparé.
const GENERIC_SUBFOLDER_NAMES = new Set([
  "data",
  "bin",
  "binaries",
  "docs",
  "documentation",
  "help",
  "manual",
  "manuals",
  "music",
  "musics",
  "textures",
  "texture",
  "sounds",
  "sound",
  "system",
  "support",
  "resources",
  "resource",
  "mods",
  "mod",
  "saves",
  "save",
  "savegames",
  "patch",
  "patches",
  "crack",
  "cracks",
  "keygen",
  "keygens",
  "md5",
  "redist",
  "redistributables",
  "dlc",
  "dlcs",
  "extras",
  "extra",
  "bonus",
  "soundtrack",
  "soundtracks",
  "localisation",
  "localization",
  "language",
  "languages",
  "locale",
  "locales",
  "config",
  "configs",
  "settings",
  "cache",
  "logs",
  "temp",
  "wallpapers",
  "wallpaper",
  "artwork",
  "art",
  "screenshots",
  "videos",
  "movies",
  "trailers",
  "fonts",
]);

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
    if (entry.isDirectory()) {
      // Un sous-dossier générique (assets/support d'un jeu) ne compte pas comme
      // "un autre jeu" dans la comparaison fichiers/sous-dossiers ci-dessous.
      if (!GENERIC_SUBFOLDER_NAMES.has(entry.name.toLowerCase())) subdirs++;
    } else if (!isNonFirstArchiveVolume(entry.name)) {
      // Les volumes suivants d'une même archive (.part2.rar, .r01, .7z.002...)
      // ne comptent pas comme des fichiers distincts : c'est une seule release.
      files++;
    }
  }
  return { files, subdirs };
}

// Un dossier est traité comme un "dossier de jeu" (ex: Action/Baldurs Gate 3/
// avec ses .exe) dès qu'il contient strictement plus de fichiers directs que
// de "vrais" sous-dossiers (hors noms génériques ci-dessus) : son contenu
// représente alors un seul jeu. En cas d'égalité (ex: une catégorie avec un
// seul jeu en dossier et un seul en archive), on privilégie la catégorie
// plutôt que de risquer d'avaler les deux dans un seul "jeu" fantôme. Un
// dossier qui contient surtout d'autres dossiers de jeux (ex: Action/, RPG/...)
// est traité comme une simple catégorie et on continue à descendre dedans ;
// les fichiers isolés qu'il contient malgré tout (archives) sont listés
// individuellement.
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
      if (isFullyCovered(relPath, imported)) continue;

      const { files, subdirs } = classifyDir(absPath);
      if (files === 0 && subdirs === 0) continue;

      if (depth >= MAX_SCAN_DEPTH || files > subdirs) {
        if (!pathOverlapReason(relPath, imported)) {
          entries.push({ name: relPath, title: cleanTitle(entry.name), isDirectory: true, sizeBytes: null });
        }
      } else {
        scanDir(absPath, relPath, imported, depth + 1, entries);
      }
    } else {
      if (isNonFirstArchiveVolume(entry.name)) continue;
      if (pathOverlapReason(relPath, imported)) continue;
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

// path (optionnel) : limite le scan heuristique à un sous-dossier donné plutôt
// que toute la ludothèque, utilisé quand on coche un dossier dans l'arborescence
// navigable pour en sélectionner le contenu détecté sans importer le dossier
// lui-même.
importRouter.get("/scan", (req, res) => {
  const relPath = typeof req.query.path === "string" ? req.query.path : "";

  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.json({ libraryDir: LIBRARY_DIR, exists: false, entries: [] });
  }

  const absPath = relPath === "" ? path.resolve(LIBRARY_DIR) : resolveLibraryPath(relPath);
  if (!absPath || !fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    return res.status(400).json({ error: "invalid path" });
  }

  const imported = alreadyImported();
  const entries = [];
  scanDir(absPath, relPath, imported, 0, entries);
  entries.sort((a, b) => a.title.localeCompare(b.title));

  res.json({ libraryDir: LIBRARY_DIR, exists: true, entries });
});

// Liste le contenu d'un seul niveau de la ludothèque (pas de récursion), pour
// une navigation façon explorateur de fichiers. Contrairement à /scan (qui
// devine quels dossiers représentent un jeu entier), chaque fichier et chaque
// dossier est toujours listé tel qu'il est sur le disque : aucune heuristique
// ne peut donc faire disparaître une archive ou un sous-dossier.
importRouter.get("/browse", (req, res) => {
  const relPath = typeof req.query.path === "string" ? req.query.path : "";

  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.json({ libraryDir: LIBRARY_DIR, exists: false, path: "", parent: null, entries: [] });
  }

  const absPath = relPath === "" ? path.resolve(LIBRARY_DIR) : resolveLibraryPath(relPath);
  if (!absPath || !fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    return res.status(400).json({ error: "invalid path" });
  }

  const imported = alreadyImported();
  let dirents;
  try {
    dirents = fs.readdirSync(absPath, { withFileTypes: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const entries = dirents
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => {
      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const isDirectory = entry.isDirectory();
      let sizeBytes = null;
      if (!isDirectory) {
        try {
          sizeBytes = fs.statSync(path.join(absPath, entry.name)).size;
        } catch {
          sizeBytes = null;
        }
      }
      return {
        name: entryRelPath,
        title: cleanTitle(entry.name),
        isDirectory,
        sizeBytes,
        alreadyImported: imported.has(entryRelPath),
      };
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

  const parent = relPath ? relPath.split("/").slice(0, -1).join("/") : null;

  res.json({ libraryDir: LIBRARY_DIR, exists: true, path: relPath, parent, entries });
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
    // Les apostrophes sont supprimées (pas remplacées par un espace) pour que
    // "Dragon's Dogma" et "Dragons Dogma" (nom de dossier sans apostrophe,
    // très fréquent) se normalisent tous les deux en "dragons dogma".
    .replace(/['’`]/g, "")
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

// Résout un chemin relatif vers un chemin absolu sous LIBRARY_DIR, en
// re-vérifiant (en plus de isSafeRelativePath) que le résultat reste bien
// dans LIBRARY_DIR. Renvoie null si le nom est invalide ou hors limites.
function resolveLibraryPath(name) {
  if (!isSafeRelativePath(name)) return null;
  const libraryRoot = path.resolve(LIBRARY_DIR);
  const absPath = path.resolve(libraryRoot, name);
  if (absPath !== libraryRoot && !absPath.startsWith(libraryRoot + path.sep)) return null;
  return absPath;
}

const insertImported = db.prepare(`
  INSERT INTO games (title, platforms, status, genres, source, import_path)
  VALUES (@title, '[]', 'backlog', '[]', 'import', @import_path)
`);

// Import d'une entrée unique avec contrôle fin : titre et correspondance de
// métadonnées choisis à la main (vue de revue dédiée), au lieu du matching
// automatique de l'import classique/intelligent.
importRouter.post("/entry", async (req, res) => {
  const { name, title, provider, externalId } = req.body || {};

  if (!fs.existsSync(LIBRARY_DIR)) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const absPath = resolveLibraryPath(name);
  if (!absPath) {
    return res.status(400).json({ error: "invalid name" });
  }
  if (!fs.existsSync(absPath)) {
    return res.status(400).json({ error: "not found in libraryDir" });
  }
  const overlap = pathOverlapReason(name, alreadyImported());
  if (overlap) {
    return res.status(409).json({
      error:
        overlap === "already imported"
          ? "Ce chemin a déjà été importé"
          : `Ce chemin fait double emploi avec un import existant (${overlap})`,
    });
  }
  if (provider && externalId && isDuplicateExternal(provider, externalId)) {
    return res.status(409).json({ error: "Ce jeu est déjà dans la bibliothèque" });
  }

  const finalTitle = (title && title.trim()) || cleanTitle(path.basename(name));
  const result = insertImported.run({ title: finalTitle, import_path: name });
  let game = serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid));

  if (provider && externalId) {
    try {
      game = await enrichGame(game, { providerId: provider, externalId });
    } catch (err) {
      console.error(`Metadata enrichment failed for "${game.title}": ${err.message}`);
    }
  }

  res.status(201).json(game);
});

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

    const result = insertImported.run({ title: cleanTitle(path.basename(entry.name)), import_path: entry.name });
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

  const imported = alreadyImported();
  const provider = listProviders().find((p) => p.configured);
  const providerImpl = provider ? getProvider(provider.id) : null;

  const created = [];
  const skipped = [];

  for (const name of names) {
    const absPath = resolveLibraryPath(name);
    if (!absPath) {
      skipped.push({ name, reason: "invalid name" });
      continue;
    }
    if (!fs.existsSync(absPath)) {
      skipped.push({ name, reason: "not found in libraryDir" });
      continue;
    }
    const overlap = pathOverlapReason(name, imported);
    if (overlap) {
      skipped.push({ name, reason: overlap });
      continue;
    }

    const title = cleanTitle(path.basename(name));

    // Même prudence que l'import intelligent : seule une correspondance de
    // titre exacte (et pas déjà utilisée par un autre jeu) est attachée.
    // L'entrée est importée dans tous les cas — c'est l'intérêt de "Tout
    // importer" — mais sans métadonnées erronées en cas de doute, modifiable
    // plus tard depuis la fiche.
    let match = null;
    if (providerImpl) {
      try {
        const results = await providerImpl.search(title);
        const candidate = findConfidentMatch(title, results);
        if (candidate && !isDuplicateExternal(provider.id, candidate.externalId)) {
          match = candidate;
        }
      } catch (err) {
        console.error(`Metadata search failed for "${title}": ${err.message}`);
      }
    }

    const result = insertImported.run({ title, import_path: name });
    let game = serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid));
    if (match) {
      try {
        game = await enrichGame(game, { externalId: match.externalId, providerId: provider.id });
      } catch (err) {
        console.error(`Metadata enrichment failed for "${game.title}": ${err.message}`);
      }
    }
    imported.add(name);
    created.push(game);
  }

  res.status(201).json({ created, skipped });
});
