// Normalise les variantes de nom selon la source (RAWG, IGDB, ...) vers un libellé commun.
const PC_ALIASES = {
  PC: "PC",
  "PC (Microsoft Windows)": "PC",
  macOS: "macOS",
  Mac: "macOS",
  Linux: "Linux",
};

export function filterPcPlatforms(platforms) {
  const seen = new Set();
  const result = [];
  for (const raw of platforms) {
    const canonical = PC_ALIASES[raw];
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
}
