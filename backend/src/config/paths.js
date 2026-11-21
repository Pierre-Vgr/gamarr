export const CONFIG_DIR = "/config";

// Point de montage Docker fixe (volume défini dans docker-compose.yml, ne peut pas
// changer sans redémarrer le conteneur). Les sous-chemins réels pour la bibliothèque et
// les téléchargements sont configurables (voir config/libraryPaths.js) et doivent rester
// sous CE MÊME montage pour que le hardlink qBittorrent -> bibliothèque fonctionne : un
// hardlink échoue avec "cross-device link" entre deux montages distincts même s'ils
// pointent le même répertoire hôte (chaque "-v" crée son propre point de montage dans le
// conteneur).
export const DATA_DIR = "/data";
