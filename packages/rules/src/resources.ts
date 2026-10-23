export const RESOURCES = ['alloy', 'plasma', 'relics'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Resources = Record<Resource, number>;

export const RESOURCE_NAMES: Record<Resource, string> = {
  alloy: 'Alloy',
  plasma: 'Plasma',
  relics: 'Relic Shards',
};

export const res = (alloy = 0, plasma = 0, relics = 0): Resources => ({ alloy, plasma, relics });
export const ZERO: Resources = res();

const PRODUCTION_BASE: Resources = res(30, 20, 1);
/** Free income every base gets, so nobody can get stuck with no producers. */
export const BASE_TRICKLE: Resources = res(20, 10, 0);
/** Relic storage and protection are this fraction of the Alloy/Plasma figures. */
const RELIC_SHARE = 1 / 20;

/** Output per hour of a producer building at `level` (0 = not built): `base · L · 1.1^L`. */
export function productionPerHour(resource: Resource, level: number): number {
  if (level <= 0) return 0;
  return PRODUCTION_BASE[resource] * level * 1.1 ** level;
}

export interface ProducerLevels {
  alloyExtractor: number;
  plasmaTap: number;
  relicDigSite: number;
}

/** Total income per hour, including the trickle. `boost` is the Frontier Boost multiplier. */
export function ratesPerHour(levels: ProducerLevels, boost = 1): Resources {
  return {
    alloy: (BASE_TRICKLE.alloy + productionPerHour('alloy', levels.alloyExtractor)) * boost,
    plasma: (BASE_TRICKLE.plasma + productionPerHour('plasma', levels.plasmaTap)) * boost,
    relics: (BASE_TRICKLE.relics + productionPerHour('relics', levels.relicDigSite)) * boost,
  };
}

/** Storage cap per resource for a Depot at `level`: `5,000 · 1.3^(L−1)`. */
export function depotCapacity(level: number): Resources {
  const cap = 5000 * 1.3 ** (Math.max(1, level) - 1);
  return res(cap, cap, cap * RELIC_SHARE);
}

/** Amount of each resource raiders can never take, for a Vault at `level`: `1,000 · 1.3^(L−1)`. */
export function vaultProtection(level: number): Resources {
  if (level <= 0) return ZERO;
  const safe = 1000 * 1.3 ** (level - 1);
  return res(safe, safe, safe * RELIC_SHARE);
}

/**
 * Resources after `seconds` of production. Production stops at the cap, but anything already
 * above the cap (e.g. loot that just came home) is kept.
 */
export function accrue(stored: Resources, perHour: Resources, seconds: number, cap: Resources): Resources {
  const out = { ...stored };
  for (const r of RESOURCES) {
    if (stored[r] < cap[r]) out[r] = Math.min(cap[r], stored[r] + (perHour[r] * seconds) / 3600);
  }
  return out;
}

export const FRONTIER_BOOST_DAYS = 7;

/**
 * Late-joiner production multiplier: +1% per day the season had run when the player joined (max +100%),
 * lasting 7 days from joining.
 */
export function frontierBoost(seasonDayAtJoin: number, daysSinceJoin: number): number {
  if (daysSinceJoin >= FRONTIER_BOOST_DAYS) return 1;
  return 1 + Math.min(100, Math.max(0, Math.floor(seasonDayAtJoin))) / 100;
}

export function addResources(a: Resources, b: Resources): Resources {
  return res(a.alloy + b.alloy, a.plasma + b.plasma, a.relics + b.relics);
}

export function scaleResources(a: Resources, k: number): Resources {
  return res(a.alloy * k, a.plasma * k, a.relics * k);
}

export function canAfford(stored: Resources, cost: Resources): boolean {
  return RESOURCES.every((r) => stored[r] >= cost[r]);
}
