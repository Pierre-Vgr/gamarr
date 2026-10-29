const VALID_TIERS = ["platinum", "gold", "silver", "bronze", "borked", "pending"];

export function extractSteamAppId(stores) {
  const steamStore = stores.find((s) => s.slug === "steam" || s.name === "Steam");
  if (!steamStore?.url) return null;

  const match = steamStore.url.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

export async function getProtonTier(appId) {
  const res = await fetch(`https://www.protondb.com/api/v1/reports/summaries/${appId}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ProtonDB lookup failed: ${res.status}`);

  const data = await res.json();
  const tier = data.tier || data.trendingTier;
  return VALID_TIERS.includes(tier) ? tier : null;
}
