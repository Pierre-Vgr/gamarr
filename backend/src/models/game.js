export function serializeGame(row) {
  return {
    ...row,
    platforms: JSON.parse(row.platforms || "[]"),
    genres: JSON.parse(row.genres || "[]"),
    stores: JSON.parse(row.stores || "[]"),
  };
}
