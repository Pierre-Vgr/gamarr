# Gamarr

Gestionnaire de bibliothèque de jeux auto-hébergé, dockerisé, pour organiser des jeux
**non installés** (wishlist, backlog, suivi de progression) — pensé comme une alternative
web à Playnite. Mono-utilisateur, sans authentification, pensé pour un usage sur réseau local.

## Fonctionnalités

- Ajout manuel de jeux ou recherche automatique des métadonnées (cover, description,
  date de sortie, genres, plateformes) via [RAWG](https://rawg.io/apidocs).
- Support optionnel d'[IGDB](https://api-docs.igdb.com/) comme source alternative.
- **Import depuis un dossier** : pointe l'app vers le dossier contenant tes jeux non
  installés, elle liste les éléments non encore importés et crée une entrée par jeu
  sélectionné (titre déduit du nom de fichier/dossier).
- Statuts : envie, à jouer, en cours, terminé, abandonné.
- Recherche, filtre par statut/plateforme, tri par titre / date d'ajout / date de sortie / note.
- Notes personnelles et note sur 5.

## Démarrage rapide

L'app ne se configure qu'avec deux volumes, aucune variable d'environnement n'est requise.

```bash
mkdir -p config data/media/games data/torrents/games
cp secrets.json.example config/secrets.json
# renseigner RAWG_API_KEY dans config/secrets.json (clé gratuite sur https://rawg.io/apidocs)
# place tes jeux non installés dans data/media/games (ou configure un autre chemin,
# relatif à /data, dans Paramètres -> Stockage une fois l'app lancée)
docker compose up --build
# ou : podman compose up --build
```

L'application est accessible sur http://localhost:3000.

## Configuration

Deux volumes, et rien d'autre :

| Volume | Monté sur | Contenu |
|---|---|---|
| `./config` | `/config` | Base SQLite (`gamarr.db`) et `secrets.json` (clés API). |
| `./data` | `/data` (lecture-écriture) | Bibliothèque et dépôt des téléchargements qBittorrent avant hardlink (voir plus bas), chacun dans un sous-dossier configurable. |

`/data` est en lecture-écriture (nécessaire au hardlink qBittorrent → bibliothèque). Le
sous-dossier exact de la bibliothèque et des téléchargements, lui, se configure dans
Paramètres → Stockage (par défaut `media/games` et `torrents/games`) — mais les deux
doivent toujours rester sous ce même montage `/data` : un hardlink échoue entre deux
volumes Docker distincts, même s'ils pointent le même dossier hôte.

### Organisation de la bibliothèque et détection des Roms

Dans le dossier de la bibliothèque, un jeu rangé sous un sous-dossier
`Roms/<plateforme>` (ex: `Roms/Switch/Jeu`, `Roms/Game Boy Color/Jeu`) est reconnu comme
une Rom de cette plateforme, quoi qu'en dise la métadonnée RAWG/IGDB — utile pour un
titre qui existe sur plusieurs plateformes (ex: une version Game Boy Color et une
version N64 du même jeu), où une recherche par titre seule ne peut pas lever
l'ambiguïté. Tout ce qui est en dehors de `Roms/` est traité comme un jeu PC, selon la
métadonnée.

```
data/
  media/games/
    Cyberpunk 2077 [GOG]/
    Hollow Knight [SteamRip]/
    Roms/
      Switch/
        The Legend of Zelda - Tears of the Kingdom/
      Game Boy Color/
        Pokemon Crystal/
  torrents/games/
    (dépôt qBittorrent avant hardlink)
```

Édite directement les chemins hôtes dans `docker-compose.yml` (par défaut `./config` et
`./data`, relatifs au dépôt) pour les faire pointer où tu veux.

### Secrets (`config/secrets.json`)

Copié depuis `secrets.json.example`, exclu de git par `.gitignore` — ne le commite jamais.

| Clé | Description | Obligatoire |
|---|---|---|
| `RAWG_API_KEY` | Clé API RAWG pour la recherche de métadonnées | Recommandé |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | Identifiants d'une app Twitch Developer pour activer IGDB | Optionnel |

Sans clé API, l'ajout manuel de jeux reste pleinement fonctionnel ; seule la recherche
automatique de métadonnées est désactivée.

### Import depuis un dossier

Le bouton "Importer" scanne le contenu du dossier de la bibliothèque (un niveau, pas récursif) et affiche
les dossiers/fichiers pas encore importés. Sélectionne ceux à ajouter : une entrée est créée
par élément, avec un titre déduit du nom (extension et tags entre crochets/parenthèses
retirés). Tu peux ensuite enrichir chaque entrée via la recherche de métadonnées, comme pour
un ajout manuel. Les éléments déjà importés ne sont jamais réimportés en double.

## Développement local

Pour itérer sans rebuild d'image à chaque changement :

```bash
docker compose -f docker-compose.dev.yml up
# ou : podman compose -f docker-compose.dev.yml up
```

Backend sur http://localhost:3000 (redémarre auto sur les changements), frontend sur
http://localhost:5173 (hot-reload Vite, proxy `/api` vers le backend). C'est le port
**5173** qu'il faut ouvrir en dev.

## Architecture

- `backend/` — API Express + SQLite (better-sqlite3), sert aussi le build du frontend en
  production (mono-container). `/config` et le point de montage `/data` sont fixes dans
  le code (`backend/src/config/paths.js`) ; les sous-chemins de la bibliothèque et des
  téléchargements sous `/data` sont configurables (`backend/src/config/libraryPaths.js`,
  réglages `LIBRARY_SUBPATH`/`DOWNLOADS_SUBPATH` dans Paramètres → Stockage).
- `frontend/` — React + Vite + Tailwind.
- Un seul `Dockerfile` multi-stage : build du frontend puis image finale avec le backend
  qui sert l'API (`/api/*`) et les fichiers statiques du frontend.
