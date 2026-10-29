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

```bash
cp .env.example .env
# renseigner GAMES_PATH (dossier contenant tes jeux non installés)
# et RAWG_API_KEY (clé gratuite sur https://rawg.io/apidocs)

docker compose up --build
# ou : podman compose up --build
```

L'application est accessible sur http://localhost:3000.

## Configuration

| Variable | Description | Obligatoire |
|---|---|---|
| `GAMES_PATH` | Chemin hôte vers le dossier de jeux non installés, monté en lecture seule sur `/games` | Pour l'import |
| `RAWG_API_KEY` | Clé API RAWG pour la recherche de métadonnées | Recommandé |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | Identifiants d'une app Twitch Developer pour activer IGDB | Optionnel |

Sans clé API, l'ajout manuel de jeux reste pleinement fonctionnel ; seule la recherche
automatique de métadonnées est désactivée.

### Import depuis un dossier

Le bouton "Importer" scanne le contenu de `GAMES_DIR` (un niveau, pas récursif) et affiche
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
  production (mono-container).
- `frontend/` — React + Vite + Tailwind.
- Un seul `Dockerfile` multi-stage : build du frontend puis image finale avec le backend
  qui sert l'API (`/api/*`) et les fichiers statiques du frontend.
- Les données persistent dans `/data/gamarr.db` (volume Docker, voir `docker-compose.yml`).
- `GAMES_PATH` (hôte) est monté en lecture seule sur `/games` : c'est ce dossier que
  l'import scanne.
