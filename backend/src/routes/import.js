import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { serializeGame } from "../models/game.js";
import { getLibraryDir } from "../config/libraryPaths.js";
import { enrichGame } from "../services/enrich.js";
import { getProvider, listProviders } from "../services/metadataProviders/index.js";
import { resolvePlatforms } from "../services/platformFallback.js";
import { findConfidentMatch } from "../services/titleMatch.js";

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

// Une archive "autonome" (zip/rar/7z/iso) représente, à elle seule, un jeu
// complet. Un volume de continuation (.r00, .7z.002, .part2.rar...) ne
// matche jamais ce motif (il se termine par un numéro, pas par l'extension),
// donc chaque release — même en plusieurs volumes — ne compte qu'une fois.
const STANDALONE_ARCHIVE_RE = /\.(zip|rar|7z|iso)$/i;

function classifyDir(absDir) {
  let dirents;
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return { files: 0, subdirs: 0, standaloneArchives: 0 };
  }
  let files = 0;
  let subdirs = 0;
  let standaloneArchives = 0;
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
      if (STANDALONE_ARCHIVE_RE.test(entry.name)) standaloneArchives++;
    }
  }
  return { files, subdirs, standaloneArchives };
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
//
// Cas limite que le comptage seul ne peut pas trancher : un vrai jeu avec une
// structure interne riche (langues, crack, patch nommé autrement que les noms
// génériques ci-dessus...) peut avoir plus de sous-dossiers que de fichiers à
// sa racine tout en étant UN seul jeu. Quand le comptage penche pour une
// catégorie, on vérifie donc en plus si le nom du dossier correspond
// exactement à une fiche existante (providerImpl, optionnel) : si oui, c'est
// très probablement ce jeu-là, et on ne descend pas dans ses sous-dossiers.
//
// Ce nom peut cependant coïncider par hasard avec un jeu obscur (ex: un
// dossier catégorie "CRACKED" matche littéralement un jeu indé nommé
// "Cracked" sur RAWG) : on ne tente donc cette vérification que si les
// sous-dossiers eux-mêmes NE ressemblent PAS déjà à des jeux individuels. Si
// la majorité en ont l'air, c'est que le dossier est une vraie catégorie,
// coïncidence de nom ou pas.
function subdirsLookLikeGames(absDir) {
  let dirents;
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return false;
  }
  const realSubdirs = dirents.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".") && !GENERIC_SUBFOLDER_NAMES.has(e.name.toLowerCase())
  );
  if (realSubdirs.length === 0) return false;
  const gameLike = realSubdirs.filter((e) => {
    const { files, subdirs } = classifyDir(path.join(absDir, e.name));
    return files > 0 && files > subdirs;
  }).length;
  return gameLike >= Math.ceil(realSubdirs.length / 2);
}

// Limite le nombre de recherches simultanées envoyées au fournisseur de
// métadonnées pendant un scan (poli vis-à-vis de l'API, évite d'ouvrir des
// dizaines de requêtes d'un coup sur une grosse ludothèque), et abandonne une
// recherche individuelle trop lente plutôt que de bloquer tout le scan dessus.
const SCAN_SEARCH_CONCURRENCY = 5;
const SCAN_SEARCH_TIMEOUT_MS = 4000;

function createLimiter(concurrency) {
  let active = 0;
  const queue = [];
  function runNext() {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      (value) => {
        active--;
        resolve(value);
        runNext();
      },
      (err) => {
        active--;
        reject(err);
        runNext();
      }
    );
  }
  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("search timeout")), ms)),
  ]);
}

async function scanDir(absDir, relPrefix, imported, depth, entries, providerImpl, limiter) {
  let dirents;
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  const toRecurse = [];
  const pendingChecks = [];

  for (const entry of dirents) {
    if (entry.name.startsWith(".")) continue;

    const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const absPath = path.join(absDir, entry.name);

    if (entry.isDirectory()) {
      if (isFullyCovered(relPath, imported)) continue;

      // Un dossier générique (DLC, Crack, Patch, Data...) fait partie du jeu
      // parent : on ne l'explore jamais comme une catégorie séparée, sinon ses
      // propres sous-dossiers (ex: chaque pack de DLC) ressortent comme autant
      // de faux jeux individuels.
      if (GENERIC_SUBFOLDER_NAMES.has(entry.name.toLowerCase())) continue;

      const { files, subdirs, standaloneArchives } = classifyDir(absPath);
      if (files === 0 && subdirs === 0) continue;

      // Plusieurs archives autonomes côte à côte (ex: "GOG/Jeu1.zip",
      // "GOG/Jeu2.zip"...) sont plusieurs jeux différents, même sans aucun
      // sous-dossier : il ne faut pas fusionner tout le dossier "GOG" en une
      // seule fausse fiche cherchant littéralement "GOG" ou "STEAMRIP".
      const looksLikeArchiveCategory = standaloneArchives > 1;

      const structuralLeaf = depth >= MAX_SCAN_DEPTH || (files > subdirs && !looksLikeArchiveCategory);

      if (structuralLeaf) {
        if (!pathOverlapReason(relPath, imported)) {
          entries.push({ name: relPath, title: cleanTitle(entry.name), isDirectory: true, sizeBytes: null });
        }
        continue;
      }

      // Cas ambigu (ratio fichiers/sous-dossiers en faveur d'une catégorie) : on
      // reporte la vérification par le nom à plus tard pour la paralléliser avec
      // les autres dossiers du même niveau plutôt que d'attendre une par une.
      if (depth < MAX_SCAN_DEPTH && providerImpl && !subdirsLookLikeGames(absPath)) {
        pendingChecks.push({ absPath, relPath, name: entry.name });
      } else {
        toRecurse.push({ absPath, relPath });
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

  // Vérifications réseau des dossiers ambigus de ce niveau : en parallèle (limite
  // de concurrence partagée sur tout le scan), pas une par une. Une recherche en
  // échec ou trop lente retombe sur la décision structurelle (catégorie).
  if (pendingChecks.length > 0) {
    await Promise.all(
      pendingChecks.map(async ({ absPath, relPath, name }) => {
        const title = cleanTitle(name);
        try {
          const results = await limiter(() => withTimeout(providerImpl.search(title), SCAN_SEARCH_TIMEOUT_MS));
          if (findConfidentMatch(title, results)) {
            if (!pathOverlapReason(relPath, imported)) {
              entries.push({ name: relPath, title, isDirectory: true, sizeBytes: null });
            }
            return;
          }
        } catch {
          // Recherche échouée ou trop lente : on garde la décision structurelle.
        }
        toRecurse.push({ absPath, relPath });
      })
    );
  }

  await Promise.all(
    toRecurse.map(({ absPath, relPath }) =>
      scanDir(absPath, relPath, imported, depth + 1, entries, providerImpl, limiter)
    )
  );
}

// path (optionnel) : limite le scan heuristique à un sous-dossier donné plutôt
// que toute la ludothèque, utilisé quand on coche un dossier dans l'arborescence
// navigable pour en sélectionner le contenu détecté sans importer le dossier
// lui-même.
importRouter.get("/scan", async (req, res) => {
  const relPath = typeof req.query.path === "string" ? req.query.path : "";

  if (!fs.existsSync(getLibraryDir())) {
    return res.json({ libraryDir: getLibraryDir(), exists: false, entries: [] });
  }

  const absPath = relPath === "" ? path.resolve(getLibraryDir()) : resolveLibraryPath(relPath);
  if (!absPath || !fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    return res.status(400).json({ error: "invalid path" });
  }

  // Pas de vérification réseau ici : /scan doit rester instantané pour la simple
  // navigation/comptage (bouton "Sélectionner ce dossier" inclus). La
  // désambiguïsation par métadonnées plus coûteuse n'est faite que par
  // /smart et /preview, qui font de toute façon déjà des recherches réseau.
  const imported = alreadyImported();
  const entries = [];
  await scanDir(absPath, relPath, imported, 0, entries, null, null);
  entries.sort((a, b) => a.title.localeCompare(b.title));

  res.json({ libraryDir: getLibraryDir(), exists: true, entries });
});

// Liste le contenu d'un seul niveau de la ludothèque (pas de récursion), pour
// une navigation façon explorateur de fichiers. Contrairement à /scan (qui
// devine quels dossiers représentent un jeu entier), chaque fichier et chaque
// dossier est toujours listé tel qu'il est sur le disque : aucune heuristique
// ne peut donc faire disparaître une archive ou un sous-dossier.
importRouter.get("/browse", (req, res) => {
  const relPath = typeof req.query.path === "string" ? req.query.path : "";

  if (!fs.existsSync(getLibraryDir())) {
    return res.json({ libraryDir: getLibraryDir(), exists: false, path: "", parent: null, entries: [] });
  }

  const absPath = relPath === "" ? path.resolve(getLibraryDir()) : resolveLibraryPath(relPath);
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

  res.json({ libraryDir: getLibraryDir(), exists: true, path: relPath, parent, entries });
});

// Accepte un chemin relatif éventuellement composé de plusieurs segments
// (ex: "Action/Baldurs Gate 3") pour supporter les sous-dossiers, tout en
// rejetant tout segment "." / ".." ou chemin absolu (path traversal).
function isSafeRelativePath(name) {
  if (typeof name !== "string" || name.length === 0 || path.isAbsolute(name)) return false;
  const segments = name.split("/");
  return segments.every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

// Pour le diagnostic affiché à l'utilisateur quand aucun match fiable n'est
// trouvé : les quelques résultats les plus proches, pour voir en un coup
// d'œil pourquoi le titre recherché ne matche "exactement" aucun d'entre eux
// (édition, sous-titre, orthographe...) sans avoir à relancer une recherche.
function topCandidates(results, limit = 3) {
  return results.slice(0, limit).map((r) => ({ title: r.title, releaseDate: r.releaseDate || null }));
}

function isDuplicateExternal(source, externalId) {
  if (!externalId) return false;
  return Boolean(
    db.prepare("SELECT id FROM games WHERE source = ? AND external_id = ?").get(source, externalId)
  );
}

// Si une fiche avec ce (source, externalId) existe déjà EN WISHLIST, on la fait
// passer en bibliothèque réelle (statut + chemin d'import) au lieu de se
// contenter d'ignorer l'entrée détectée : elle n'est plus seulement "demandée",
// elle est maintenant possédée. Si elle existe déjà hors wishlist (déjà
// possédée sous un autre dossier), on ne touche à rien et on le signale.
function resolveDuplicateExternal(source, externalId, importPath) {
  if (!externalId) return null;
  const existing = db.prepare("SELECT * FROM games WHERE source = ? AND external_id = ?").get(source, externalId);
  if (!existing) return null;

  if (existing.status === "wishlist") {
    // Le jeu a pu être wishlisté avec une plateforme purement issue de la métadonnée ;
    // l'import révèle maintenant son vrai rangement sur disque (Roms/<plateforme>...).
    const resolvedPlatforms = resolvePlatforms(importPath, existing.title, JSON.parse(existing.platforms || "[]"));
    db.prepare(
      "UPDATE games SET status = 'backlog', import_path = ?, platforms = ?, availability = NULL, updated_at = datetime('now') WHERE id = ?"
    ).run(importPath, JSON.stringify(resolvedPlatforms), existing.id);
    return { upgraded: true, game: serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(existing.id)) };
  }
  return { upgraded: false, game: serializeGame(existing) };
}

// Résout un chemin relatif vers un chemin absolu sous la bibliothèque, en
// re-vérifiant (en plus de isSafeRelativePath) que le résultat reste bien
// à l'intérieur. Renvoie null si le nom est invalide ou hors limites.
function resolveLibraryPath(name) {
  if (!isSafeRelativePath(name)) return null;
  const libraryRoot = path.resolve(getLibraryDir());
  const absPath = path.resolve(libraryRoot, name);
  if (absPath !== libraryRoot && !absPath.startsWith(libraryRoot + path.sep)) return null;
  return absPath;
}

const insertImported = db.prepare(`
  INSERT INTO games (title, platforms, status, genres, source, import_path)
  VALUES (@title, '[]', 'backlog', '[]', 'import', @import_path)
`);

// Appliqué après l'éventuel enrichissement métadonnées : le rangement sur disque
// (Roms/<plateforme>, recomp) prime toujours sur ce que la métadonnée a renseigné —
// voir services/platformFallback.js. Logique partagée avec l'actualisation des
// métadonnées (services/enrich.js).
function applyPlatformFallback(game, relPath) {
  const resolved = resolvePlatforms(relPath, game.title, game.platforms);
  if (JSON.stringify(resolved) === JSON.stringify(game.platforms || [])) return game;
  db.prepare("UPDATE games SET platforms = ? WHERE id = ?").run(JSON.stringify(resolved), game.id);
  return { ...game, platforms: resolved };
}

// Import d'une entrée unique avec contrôle fin : titre et correspondance de
// métadonnées choisis à la main (vue de revue dédiée), au lieu du matching
// automatique de l'import classique/intelligent.
importRouter.post("/entry", async (req, res) => {
  const { name, title, provider, externalId } = req.body || {};

  if (!fs.existsSync(getLibraryDir())) {
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
  if (provider && externalId) {
    const duplicate = resolveDuplicateExternal(provider, externalId, name);
    if (duplicate) {
      if (duplicate.upgraded) return res.status(200).json(duplicate.game);
      return res.status(409).json({ error: "Ce jeu est déjà dans la bibliothèque" });
    }
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

  game = applyPlatformFallback(game, name);
  res.status(201).json(game);
});

// Aperçu avant import : même matching que l'import intelligent (recherche +
// match exact) sur toute la ludothèque (ou un sous-dossier via ?path=), mais
// sans rien écrire en base. Permet de revoir/corriger le titre et la
// correspondance proposés avant de confirmer réellement l'import, un par un
// via POST /entry.
importRouter.post("/preview", async (req, res) => {
  const relPath = typeof req.query.path === "string" ? req.query.path : "";

  if (!fs.existsSync(getLibraryDir())) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const absPath = relPath === "" ? path.resolve(getLibraryDir()) : resolveLibraryPath(relPath);
  if (!absPath || !fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
    return res.status(400).json({ error: "invalid path" });
  }

  const provider = listProviders().find((p) => p.configured);
  const providerImpl = provider ? getProvider(provider.id) : null;
  const limiter = createLimiter(SCAN_SEARCH_CONCURRENCY);

  const imported = alreadyImported();
  const scanned = [];
  await scanDir(absPath, relPath, imported, 0, scanned, providerImpl, limiter);

  // Aucune écriture en base ici (juste une lecture pour isDuplicateExternal) : chaque
  // entrée peut être traitée en parallèle (borné par le même limiteur que le scan),
  // contrairement à /smart et au bulk import qui doivent rester séquentiels sur la
  // partie écriture.
  const items = await Promise.all(
    scanned.map((entry) =>
      limiter(async () => {
        const item = {
          name: entry.name,
          title: entry.title,
          provider: provider?.id || null,
          match: null,
          query: entry.title,
          candidates: [],
        };

        if (providerImpl) {
          try {
            const results = await providerImpl.search(entry.title);
            const match = findConfidentMatch(entry.title, results);
            if (match && !isDuplicateExternal(provider.id, match.externalId)) {
              item.match = {
                externalId: match.externalId,
                title: match.title,
                coverUrl: match.coverUrl || null,
                releaseDate: match.releaseDate || null,
              };
            } else {
              item.candidates = topCandidates(results, 5);
            }
          } catch (err) {
            item.error = err.message;
          }
        }

        return item;
      })
    )
  );

  res.json({ items });
});

// Import "intelligent" : scanne la ludothèque et n'ajoute automatiquement que les
// entrées sans ambiguïté — un match de titre exact chez le provider de métadonnées
// configuré, et pas déjà présentes en bibliothèque. Tout le reste (titre ambigu,
// pas de résultat, release déjà possédée sous un autre nom de dossier) est laissé
// de côté pour un tri manuel, pour éviter le travail fastidieux sur une grosse
// ludothèque tout en restant fiable.
importRouter.post("/smart", async (req, res) => {
  if (!fs.existsSync(getLibraryDir())) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const provider = listProviders().find((p) => p.configured);
  if (!provider) {
    return res.status(400).json({ error: "Aucun provider de métadonnées configuré" });
  }
  const providerImpl = getProvider(provider.id);
  const limiter = createLimiter(SCAN_SEARCH_CONCURRENCY);

  const imported = alreadyImported();
  const scanned = [];
  await scanDir(getLibraryDir(), "", imported, 0, scanned, providerImpl, limiter);

  // Les recherches sont bornées en parallèle (même limiteur que le scan) avant le
  // traitement séquentiel ci-dessous : c'est la recherche réseau qui domine le temps
  // total sur une grosse ludothèque, pas les écritures en base qui, elles, doivent
  // rester séquentielles (vérification de doublon par external_id).
  const searchResults = await Promise.all(
    scanned.map((entry) =>
      limiter(() => providerImpl.search(entry.title)).then(
        (results) => ({ entry, results, error: null }),
        (error) => ({ entry, results: null, error })
      )
    )
  );

  const created = [];
  const skipped = [];

  for (const { entry, results, error } of searchResults) {
    if (error) {
      skipped.push({ name: entry.name, reason: `recherche échouée: ${error.message}`, query: entry.title });
      continue;
    }

    const match = findConfidentMatch(entry.title, results);
    if (!match) {
      skipped.push({
        name: entry.name,
        reason: "pas de correspondance fiable",
        query: entry.title,
        candidates: topCandidates(results),
      });
      continue;
    }

    const duplicate = resolveDuplicateExternal(provider.id, match.externalId, entry.name);
    if (duplicate) {
      if (duplicate.upgraded) {
        created.push(duplicate.game);
      } else {
        skipped.push({
          name: entry.name,
          reason: "déjà présent en bibliothèque",
          query: entry.title,
          matchedTitle: match.title,
        });
      }
      continue;
    }

    const result = insertImported.run({ title: cleanTitle(path.basename(entry.name)), import_path: entry.name });
    let game = serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid));
    try {
      game = await enrichGame(game, { externalId: match.externalId, providerId: provider.id });
    } catch (err) {
      console.error(`Metadata enrichment failed for "${game.title}": ${err.message}`);
    }
    game = applyPlatformFallback(game, entry.name);
    created.push(game);
  }

  res.status(201).json({ created, skipped, totalScanned: scanned.length });
});

importRouter.post("/", async (req, res) => {
  const { names } = req.body;
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "names must be a non-empty array" });
  }

  if (!fs.existsSync(getLibraryDir())) {
    return res.status(400).json({ error: "libraryDir is not accessible" });
  }

  const imported = alreadyImported();
  const provider = listProviders().find((p) => p.configured);
  const providerImpl = provider ? getProvider(provider.id) : null;
  const limiter = createLimiter(SCAN_SEARCH_CONCURRENCY);

  const created = [];
  const skipped = [];

  // Première passe (synchrone, pas de réseau) : valide chaque nom et filtre les
  // chevauchements, dans l'ordre de la requête — un nom qui chevauche un autre nom de
  // CE MÊME lot doit encore être détecté, donc "imported" est mis à jour ici, avant
  // toute recherche réseau. Rien n'échoue plus loin pour une entrée qui passe ce filtre
  // (elle finit toujours en "created", via une mise à jour ou un nouvel import), donc
  // avancer "imported" à ce stade plutôt qu'après écriture ne change rien au résultat.
  const toProcess = [];
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
    imported.add(name);
    toProcess.push({ name, title: cleanTitle(path.basename(name)) });
  }

  // Recherches bornées en parallèle (même limiteur que le scan) : c'est la recherche
  // réseau qui domine le temps total sur un gros lot, pas les écritures qui suivent.
  const searchResults = providerImpl
    ? await Promise.all(
        toProcess.map(({ name, title }) =>
          limiter(() => providerImpl.search(title)).then(
            (results) => ({ name, title, results, error: null }),
            (error) => ({ name, title, results: null, error })
          )
        )
      )
    : toProcess.map(({ name, title }) => ({ name, title, results: null, error: null }));

  // Deuxième passe (séquentielle) : traite les écritures en base à partir des
  // résultats déjà récupérés. Même prudence que l'import intelligent : seule une
  // correspondance de titre exacte (et pas déjà utilisée par un autre jeu) est
  // attachée. L'entrée est importée dans tous les cas — c'est l'intérêt de "Tout
  // importer" — mais sans métadonnées erronées en cas de doute, modifiable plus tard
  // depuis la fiche.
  for (const { name, title, results, error } of searchResults) {
    let match = null;
    let matchDiagnostic = null;
    let duplicateUpgrade = null;

    if (providerImpl) {
      if (error) {
        console.error(`Metadata search failed for "${title}": ${error.message}`);
      } else {
        const candidate = findConfidentMatch(title, results);
        if (candidate) {
          const duplicate = resolveDuplicateExternal(provider.id, candidate.externalId, name);
          if (duplicate?.upgraded) {
            duplicateUpgrade = duplicate.game;
          } else if (!duplicate) {
            match = candidate;
          } else {
            matchDiagnostic = { query: title, candidates: topCandidates(results) };
          }
        } else {
          matchDiagnostic = { query: title, candidates: topCandidates(results) };
        }
      }
    }

    if (duplicateUpgrade) {
      // Le jeu était déjà en wishlist : on vient de le faire passer en possédé
      // (statut + chemin d'import) plutôt que de créer une deuxième fiche pour
      // le même jeu.
      created.push(duplicateUpgrade);
      continue;
    }

    const result = insertImported.run({ title, import_path: name });
    let game = serializeGame(db.prepare("SELECT * FROM games WHERE id = ?").get(result.lastInsertRowid));
    if (match) {
      try {
        game = await enrichGame(game, { externalId: match.externalId, providerId: provider.id });
      } catch (err) {
        console.error(`Metadata enrichment failed for "${game.title}": ${err.message}`);
      }
    } else if (matchDiagnostic) {
      // Pas persisté en base, juste pour le diagnostic affiché côté import.
      game.matchDiagnostic = matchDiagnostic;
    }
    game = applyPlatformFallback(game, name);
    created.push(game);
  }

  res.status(201).json({ created, skipped });
});
