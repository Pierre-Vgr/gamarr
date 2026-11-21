import { db } from "../db/index.js";
import { isConfigured as isQbittorrentConfigured } from "./qbittorrent.js";

const insertHistory = db.prepare(`
  INSERT INTO history
    (type, game_id, game_title, query, result_count, release_title, indexer, size_bytes, hardlink_status)
  VALUES
    (@type, @game_id, @game_title, @query, @result_count, @release_title, @indexer, @size_bytes, @hardlink_status)
`);

export function logSearch({ gameId = null, gameTitle = null, query, resultCount }) {
  insertHistory.run({
    type: "search",
    game_id: gameId,
    game_title: gameTitle,
    query,
    result_count: resultCount,
    release_title: null,
    indexer: null,
    size_bytes: null,
    hardlink_status: null,
  });
}

export function logGrab({ gameId = null, gameTitle = null, releaseTitle, indexer = null, sizeBytes = null }) {
  // Rien à suivre si qBittorrent n'est pas configuré : la ligne reste un simple journal,
  // sans jamais passer par le poller de hardlink (voir services/hardlink.js).
  insertHistory.run({
    type: "grab",
    game_id: gameId,
    game_title: gameTitle,
    query: null,
    result_count: null,
    release_title: releaseTitle,
    indexer,
    size_bytes: sizeBytes,
    hardlink_status: isQbittorrentConfigured() ? "pending" : null,
  });
}

export function listHistory(limit = 200) {
  return db.prepare("SELECT * FROM history ORDER BY created_at DESC, id DESC LIMIT ?").all(limit);
}
