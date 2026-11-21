import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "../config/paths.js";

const DB_PATH = path.join(CONFIG_DIR, "gamarr.db");

fs.mkdirSync(CONFIG_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    platforms TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'backlog',
    cover_url TEXT,
    description TEXT,
    release_date TEXT,
    genres TEXT NOT NULL DEFAULT '[]',
    rating REAL,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT,
    import_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
  CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);
`);

function addColumnIfMissing(table, name, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((col) => col.name === name);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

addColumnIfMissing("games", "import_path", "TEXT");
addColumnIfMissing("games", "stores", "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing("games", "steam_app_id", "TEXT");
addColumnIfMissing("games", "proton_tier", "TEXT");
addColumnIfMissing("games", "metacritic_score", "INTEGER");
addColumnIfMissing("games", "community_rating", "INTEGER");
addColumnIfMissing("games", "ratings_count", "INTEGER");
// Vu après une recherche Prowlarr explicite depuis la fiche sans aucun résultat :
// 'unavailable', ou NULL si jamais vérifié / des résultats ont été trouvés.
addColumnIfMissing("games", "availability", "TEXT");

db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_games_import_path ON games(import_path) WHERE import_path IS NOT NULL"
);

// Journal des recherches Prowlarr effectuées et des releases envoyées au
// client de téléchargement, consultable depuis l'onglet Historique.
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'search' | 'grab'
    game_id INTEGER,
    game_title TEXT,
    query TEXT,
    result_count INTEGER,
    release_title TEXT,
    indexer TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at);
`);

// 'pending' (qBittorrent configuré, en attente de fin de téléchargement), 'linked'
// (hardlink créé dans /library), 'failed' (voir hardlink_error), ou NULL pour une
// ligne 'search', ou un grab fait sans qBittorrent configuré (rien à suivre).
addColumnIfMissing("history", "hardlink_status", "TEXT");
addColumnIfMissing("history", "hardlink_error", "TEXT");
