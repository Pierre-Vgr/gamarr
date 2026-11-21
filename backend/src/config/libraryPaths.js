import path from "node:path";
import { getSecret } from "./secrets.js";
import { DATA_DIR } from "./paths.js";

// Valeurs par défaut pensées pour une arborescence type TRaSH-guides (séparer les
// médias finaux des téléchargements en cours, même sous un montage unique) :
//   data/
//     media/games/...       <- bibliothèque (LIBRARY_SUBPATH)
//     torrents/games/...    <- dépôt qBittorrent avant hardlink (DOWNLOADS_SUBPATH)
export const DEFAULT_LIBRARY_SUBPATH = "media/games";
export const DEFAULT_DOWNLOADS_SUBPATH = "torrents/games";

// Lues dynamiquement (comme les autres réglages dans secrets.json) plutôt que figées au
// démarrage : un changement dans les Paramètres s'applique immédiatement, sans
// redémarrer le conteneur.
export function getLibraryDir() {
  return path.join(DATA_DIR, getSecret("LIBRARY_SUBPATH") || DEFAULT_LIBRARY_SUBPATH);
}

export function getDownloadsDir() {
  return path.join(DATA_DIR, getSecret("DOWNLOADS_SUBPATH") || DEFAULT_DOWNLOADS_SUBPATH);
}
