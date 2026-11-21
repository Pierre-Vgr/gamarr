// Reconnaît le nom d'une plateforme dans un segment de chemin (ex: le dossier
// "Game Boy Color" sous "Roms/") et le normalise vers un libellé commun.
const PLATFORM_PATH_HINTS = [
  { re: /\bnes\b/i, platform: "NES" },
  { re: /\bsnes\b|super\s*nintendo/i, platform: "SNES" },
  { re: /\bn64\b|nintendo\s*64/i, platform: "Nintendo 64" },
  { re: /gamecube/i, platform: "GameCube" },
  { re: /\bwii\s*u\b/i, platform: "Wii U" },
  { re: /\bwii\b/i, platform: "Wii" },
  { re: /game\s*boy\s*advance|\bgba\b/i, platform: "Game Boy Advance" },
  { re: /game\s*boy\s*color|\bgbc\b/i, platform: "Game Boy Color" },
  { re: /game\s*boy\b|\bgb\b/i, platform: "Game Boy" },
  { re: /nintendo\s*ds\b|\bnds\b/i, platform: "Nintendo DS" },
  { re: /\b3ds\b/i, platform: "Nintendo 3DS" },
  { re: /famicom/i, platform: "NES" },
  { re: /nintendo\s*switch\s*2|\bswitch\s*2\b/i, platform: "Nintendo Switch 2" },
  { re: /nintendo\s*switch|\bswitch\b/i, platform: "Nintendo Switch" },

  { re: /mega\s*drive|genesis/i, platform: "Genesis" },
  { re: /master\s*system|mark\s*iii/i, platform: "SEGA Master System" },
  { re: /sega\s*cd|mega[\s-]*cd/i, platform: "SEGA CD" },
  { re: /\b32x\b/i, platform: "SEGA 32X" },
  { re: /saturn/i, platform: "SEGA Saturn" },
  { re: /dreamcast/i, platform: "Dreamcast" },
  { re: /game\s*gear/i, platform: "Game Gear" },

  { re: /playstation\s*5|\bps5\b/i, platform: "PlayStation 5" },
  { re: /playstation\s*4|\bps4\b/i, platform: "PlayStation 4" },
  { re: /playstation\s*2|\bps2\b/i, platform: "PlayStation 2" },
  { re: /playstation\s*3|\bps3\b/i, platform: "PlayStation 3" },
  { re: /playstation\s*portable|\bpsp\b/i, platform: "PSP" },
  { re: /playstation\s*vita|\bps\s*vita\b/i, platform: "PS Vita" },
  { re: /playstation\b|\bps1\b|\bpsx\b/i, platform: "PlayStation" },

  { re: /neo\s*geo/i, platform: "Neo Geo" },
  { re: /\b3do\b/i, platform: "3DO" },
  { re: /\bjaguar\b/i, platform: "Jaguar" },
  { re: /colecovision/i, platform: "ColecoVision" },
  { re: /intellivision/i, platform: "Intellivision" },

  { re: /atari\s*2600/i, platform: "Atari 2600" },
  { re: /atari\s*5200/i, platform: "Atari 5200" },
  { re: /atari\s*7800/i, platform: "Atari 7800" },
  { re: /atari\s*lynx|\blynx\b/i, platform: "Atari Lynx" },
  { re: /atari\s*st\b/i, platform: "Atari ST" },
  { re: /atari\s*8-?bit/i, platform: "Atari 8-bit" },
  { re: /atari\s*xegs/i, platform: "Atari XEGS" },

  { re: /commodore|amiga/i, platform: "Commodore / Amiga" },
  { re: /apple\s*ii\b/i, platform: "Apple II" },
];

function normalizePlatformName(segment) {
  const hint = PLATFORM_PATH_HINTS.find((h) => h.re.test(segment));
  return hint ? hint.platform : segment;
}

// Un projet de "recompilation statique" (Zelda64Recomp, sm64coopdx...) compile le jeu
// console d'origine en un exécutable PC natif : malgré un chemin qui mentionne souvent
// encore la console d'origine (ex: "N64/Zelda OOT Recomp"), il doit être classé PC et
// non comme Rom.
export function isRecompPort(relPath, title) {
  return /recomp/i.test(relPath || "") || /recomp/i.test(title || "");
}

// Un jeu rangé sous un dossier "Roms/<Plateforme>" (ex: "Roms/Nintendo Switch/Jeu") est
// toujours considéré comme une Rom de CETTE plateforme — le rangement choisi par
// l'utilisateur prime sur la métadonnée. Un même titre existe souvent sur plusieurs
// plateformes (une version Game Boy Color et une version N64 du même jeu, par exemple)
// et une recherche par titre ne peut pas lever cette ambiguïté ; la place du fichier le
// peut. Renvoie null si le chemin n'a pas de segment "Roms" suivi d'un sous-dossier.
export function detectRomsFolderPlatform(relPath) {
  if (!relPath) return null;
  const segments = relPath.split("/");
  const romsIndex = segments.findIndex((s) => s.toLowerCase() === "roms");
  if (romsIndex === -1 || romsIndex + 1 >= segments.length) return null;
  return normalizePlatformName(segments[romsIndex + 1]);
}

// Détermine la plateforme définitive d'un jeu importé. Priorité au rangement sur
// disque : "Roms/<plateforme>" ou un nom de recompilation l'emportent toujours, quoi
// que dise la métadonnée. En dehors de ces deux cas, la métadonnée (RAWG/IGDB) reste
// seule autorité — c'est elle qui décide si un jeu est PC, macOS, Linux, ou même une
// console exclusive non rangée sous "Roms".
export function resolvePlatforms(relPath, title, metadataPlatforms) {
  if (isRecompPort(relPath, title)) return ["PC"];
  const romsPlatform = detectRomsFolderPlatform(relPath);
  if (romsPlatform) return [romsPlatform];
  return metadataPlatforms || [];
}
