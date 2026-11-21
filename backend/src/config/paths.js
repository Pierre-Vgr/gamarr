import path from "node:path";

export const CONFIG_DIR = "/config";
export const LIBRARY_DIR = "/library";
// Dossier de dépôt des téléchargements qBittorrent avant hardlink vers LIBRARY_DIR —
// volontairement un sous-dossier DE LIBRARY_DIR plutôt qu'un volume séparé : un hardlink
// échoue avec "cross-device link" entre deux montages Docker distincts même s'ils
// pointent le même répertoire hôte (chaque "-v" crée son propre point de montage dans
// le conteneur). En restant sous LIBRARY_DIR, les deux chemins partagent le même
// montage, donc le même "device" vu du conteneur. Préfixé d'un point : déjà ignoré par
// le scanner d'import (voir GENERIC_SUBFOLDER_NAMES / startsWith(".") dans import.js).
// qBittorrent doit donc monter CE MÊME dossier hôte (celui de LIBRARY_DIR) et y
// sauvegarder ses téléchargements dans le sous-dossier ".downloads" (ex: une catégorie
// dédiée avec ce chemin de sauvegarde).
export const DOWNLOADS_DIR = path.join(LIBRARY_DIR, ".downloads");
