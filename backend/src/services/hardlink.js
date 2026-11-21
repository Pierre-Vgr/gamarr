import fs from "node:fs";
import path from "node:path";
import { db } from "../db/index.js";
import { getLibraryDir, getDownloadsDir } from "../config/libraryPaths.js";
import { isConfigured, listTorrents } from "./qbittorrent.js";
import { findConfidentMatch } from "./titleMatch.js";

function sanitizeFolderName(name) {
  const cleaned = (name || "").replace(/[/\\]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Jeu";
}

// qBittorrent renvoie content_path en absolu depuis SON propre point de vue : ça ne
// pointe vers un fichier valide ici que si qBittorrent a sauvegardé ce téléchargement
// dans le dossier de téléchargement configuré (voir config/libraryPaths.js — même
// montage Docker que la bibliothèque, requis pour que le hardlink ne traverse pas deux
// montages distincts). Un chemin hors de ce dossier indique presque sûrement une
// catégorie/chemin de sauvegarde qBittorrent mal configuré : remonté comme échec
// explicite plutôt que deviné.
function resolveContentPath(torrent) {
  const resolved = torrent.contentPath || (torrent.savePath && path.join(torrent.savePath, torrent.name));
  const downloadsDir = getDownloadsDir();
  if (resolved && !path.resolve(resolved).startsWith(path.resolve(downloadsDir) + path.sep)) {
    throw new Error(
      `qBittorrent a sauvegardé "${torrent.name}" dans "${resolved}", hors de ${downloadsDir} ` +
        "— configure une catégorie qBittorrent dédiée dont le chemin de sauvegarde est exactement " +
        `${downloadsDir} (sur le même volume que la bibliothèque Gamarr).`
    );
  }
  return resolved;
}

// Un hardlink ne porte que sur un fichier (impossible de hardlinker un dossier sous
// Unix) : on recrée donc l'arborescence du téléchargement dans la bibliothèque et on
// lie chaque fichier individuellement. Même espace disque, le client de téléchargement
// peut continuer à seeder depuis le dossier de téléchargement sans rien dupliquer.
function hardlinkRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      hardlinkRecursive(srcPath, destPath);
    } else {
      fs.linkSync(srcPath, destPath);
    }
  }
}

const markLinked = db.prepare("UPDATE history SET hardlink_status = 'linked' WHERE id = ?");
const markFailed = db.prepare("UPDATE history SET hardlink_status = 'failed', hardlink_error = ? WHERE id = ?");
const updateGame = db.prepare(`
  UPDATE games SET
    import_path = ?,
    status = CASE WHEN status = 'wishlist' THEN 'backlog' ELSE status END,
    availability = NULL,
    updated_at = datetime('now')
  WHERE id = ?
`);

function linkOne(row, torrent) {
  const srcPath = resolveContentPath(torrent);
  if (!srcPath || !fs.existsSync(srcPath)) {
    throw new Error(
      `Téléchargement introuvable à "${srcPath || "(chemin inconnu)"}" depuis Gamarr — vérifie que ` +
        "qBittorrent et Gamarr montent le même dossier de téléchargement au même chemin."
    );
  }

  const folderName = sanitizeFolderName(row.game_title || torrent.name);
  const destPath = path.join(getLibraryDir(), folderName);
  if (fs.existsSync(destPath)) {
    throw new Error(`"${folderName}" existe déjà dans la bibliothèque, lien ignoré.`);
  }

  if (fs.statSync(srcPath).isDirectory()) {
    hardlinkRecursive(srcPath, destPath);
  } else {
    fs.mkdirSync(destPath, { recursive: true });
    fs.linkSync(srcPath, path.join(destPath, path.basename(srcPath)));
  }

  markLinked.run(row.id);
  if (row.game_id) updateGame.run(folderName, row.game_id);
}

// Appelé périodiquement (voir server.js) : pour chaque grab en attente, cherche le
// torrent qBittorrent correspondant par titre (même correspondance exacte-normalisée
// que l'import, pas d'association approximative) et crée le hardlink une fois le
// téléchargement terminé (progress 100%).
export async function processPendingHardlinks() {
  if (!isConfigured()) return;

  const pending = db
    .prepare("SELECT * FROM history WHERE type = 'grab' AND hardlink_status = 'pending'")
    .all();
  if (pending.length === 0) return;

  let torrents;
  try {
    torrents = await listTorrents();
  } catch (err) {
    console.error(`Hardlink: impossible de joindre qBittorrent (${err.message})`);
    return;
  }
  const searchable = torrents.map((t) => ({ ...t, title: t.name }));

  for (const row of pending) {
    const match = findConfidentMatch(row.release_title, searchable);
    if (!match || match.progress < 1) continue; // pas encore vu, ou toujours en téléchargement

    try {
      linkOne(row, match);
    } catch (err) {
      markFailed.run(err.message, row.id);
      console.error(`Hardlink pour "${row.release_title}" échoué : ${err.message}`);
    }
  }
}
