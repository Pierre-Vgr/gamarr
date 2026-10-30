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

function addColumnIfMissing(name, definition) {
  const exists = db
    .prepare("PRAGMA table_info(games)")
    .all()
    .some((col) => col.name === name);
  if (!exists) {
    db.exec(`ALTER TABLE games ADD COLUMN ${name} ${definition}`);
  }
}

addColumnIfMissing("import_path", "TEXT");
addColumnIfMissing("stores", "TEXT NOT NULL DEFAULT '[]'");
addColumnIfMissing("steam_app_id", "TEXT");
addColumnIfMissing("proton_tier", "TEXT");
addColumnIfMissing("metacritic_score", "INTEGER");
addColumnIfMissing("community_rating", "INTEGER");
addColumnIfMissing("ratings_count", "INTEGER");

db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_games_import_path ON games(import_path) WHERE import_path IS NOT NULL"
);
