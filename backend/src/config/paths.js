import path from "node:path";

export const CONFIG_DIR = "/config";

// LIBRARY_DIR et DOWNLOADS_DIR doivent vivre sous le MÊME montage Docker ("/data") pour
// que le hardlink qBittorrent -> bibliothèque fonctionne : un hardlink échoue avec
// "cross-device link" entre deux montages distincts même s'ils pointent le même
// répertoire hôte (chaque "-v" crée son propre point de montage dans le conteneur).
// qBittorrent doit donc lui aussi monter ce même dossier hôte "/data" et sauvegarder ses
// téléchargements dans le sous-dossier "downloads" (ex: une catégorie dédiée avec ce
// chemin de sauvegarde) — hors de LIBRARY_DIR, donc jamais vu par le scanner d'import.
const DATA_DIR = "/data";
export const LIBRARY_DIR = path.join(DATA_DIR, "library");
export const DOWNLOADS_DIR = path.join(DATA_DIR, "downloads");
