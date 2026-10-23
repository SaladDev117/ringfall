import { res, type Resources } from './resources';
import type { UnitClass } from './units';

const MIN = 60;
const HOUR = 3600;

/** Cost and build time both grow by this factor per level. */
export const LEVEL_GROWTH = 1.45;

export interface BuildingDef {
  name: string;
  /** Command Center level needed to build level 1. */
  unlockCC: number;
  maxLevel: number;
  /** Level in a brand-new base. */
  startLevel: number;
  /** Level 1 cost. */
  cost: Resources;
  /** Level 1 build time in seconds. */
  seconds: number;
  /** Explicit build time per level (index 0 = level 1), overriding the growth formula. */
  secondsByLevel?: readonly number[];
}

export const BUILDINGS = {
  commandCenter: { name: 'Command Center', unlockCC: 1, maxLevel: 20, startLevel: 1, cost: res(250, 150), seconds: 2 * MIN },
  alloyExtractor: { name: 'Alloy Extractor', unlockCC: 1, maxLevel: 20, startLevel: 1, cost: res(60, 30), seconds: 1 * MIN },
  plasmaTap: { name: 'Plasma Tap', unlockCC: 1, maxLevel: 20, startLevel: 1, cost: res(70, 20), seconds: 1 * MIN },
  relicDigSite: { name: 'Relic Dig Site', unlockCC: 5, maxLevel: 20, startLevel: 0, cost: res(500, 400), seconds: 10 * MIN },
  depot: { name: 'Depot', unlockCC: 1, maxLevel: 20, startLevel: 1, cost: res(100, 50), seconds: 1 * MIN },
  vault: { name: 'Vault', unlockCC: 3, maxLevel: 20, startLevel: 0, cost: res(150, 100), seconds: 2 * MIN },
  habitat: { name: 'Habitat', unlockCC: 1, maxLevel: 20, startLevel: 1, cost: res(80, 40), seconds: 1 * MIN },
  barracks: { name: 'Barracks', unlockCC: 1, maxLevel: 20, startLevel: 1, cost: res(120, 60), seconds: 2 * MIN },
  vehicleBay: { name: 'Vehicle Bay', unlockCC: 3, maxLevel: 20, startLevel: 0, cost: res(400, 250), seconds: 5 * MIN },
  hangar: { name: 'Hangar', unlockCC: 8, maxLevel: 10, startLevel: 0, cost: res(1500, 1200, 40), seconds: 30 * MIN },
  titanForge: {
    name: 'Titan Forge', unlockCC: 12, maxLevel: 5, startLevel: 0, cost: res(8000, 6000, 300), seconds: 4 * HOUR,
    secondsByLevel: [4 * HOUR, 8 * HOUR, 16 * HOUR, 24 * HOUR, 36 * HOUR],
  },
  sensorArray: { name: 'Sensor Array', unlockCC: 2, maxLevel: 20, startLevel: 0, cost: res(150, 150), seconds: 2 * MIN },
  repairBay: { name: 'Repair Bay', unlockCC: 4, maxLevel: 20, startLevel: 0, cost: res(300, 300), seconds: 5 * MIN },
  sentryTurret: { name: 'Sentry Turret', unlockCC: 2, maxLevel: 20, startLevel: 0, cost: res(100, 50), seconds: 3 * MIN },
  railTurret: { name: 'Rail Turret', unlockCC: 5, maxLevel: 20, startLevel: 0, cost: res(200, 120), seconds: 6 * MIN },
  flakTurret: { name: 'Flak Turret', unlockCC: 8, maxLevel: 20, startLevel: 0, cost: res(250, 180), seconds: 10 * MIN },
  perimeterWall: { name: 'Perimeter Wall', unlockCC: 2, maxLevel: 20, startLevel: 0, cost: res(250, 0), seconds: 2 * MIN },
  shieldGenerator: { name: 'Shield Generator', unlockCC: 10, maxLevel: 10, startLevel: 0, cost: res(1500, 1500, 50), seconds: 1 * HOUR },
} satisfies Record<string, BuildingDef>;

export type BuildingType = keyof typeof BUILDINGS;
export type BuildingLevels = Record<BuildingType, number>;
export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];

const def = (type: BuildingType): BuildingDef => BUILDINGS[type];

/** Levels of a brand-new base. */
export function startingLevels(): BuildingLevels {
  return Object.fromEntries(BUILDING_TYPES.map((t) => [t, def(t).startLevel])) as BuildingLevels;
}

/** Cost to upgrade to `level`: `L1 cost × 1.45^(L−1)`. The Command Center also costs Relics above L10. */
export function upgradeCost(type: BuildingType, level: number): Resources {
  const k = LEVEL_GROWTH ** (level - 1);
  const { cost } = def(type);
  const out = res(Math.round(cost.alloy * k), Math.round(cost.plasma * k), Math.round(cost.relics * k));
  if (type === 'commandCenter' && level > 10) out.relics += Math.round(20 * LEVEL_GROWTH ** (level - 10));
  return out;
}

/** Build time in seconds to upgrade to `level`. */
export function upgradeSeconds(type: BuildingType, level: number): number {
  const d = def(type);
  const explicit = d.secondsByLevel?.[level - 1];
  if (explicit !== undefined) return explicit;
  return Math.round(d.seconds * LEVEL_GROWTH ** (level - 1));
}

/**
 * Command Center level needed to upgrade `type` to `level`. Nothing may be higher than the CC,
 * and the CC itself only needs to be at the level below.
 */
export function requiredCC(type: BuildingType, level: number): number {
  if (type === 'commandCenter') return level - 1;
  return Math.max(def(type).unlockCC, level);
}

export type UpgradeBlock = 'max_level' | 'needs_command_center';

export function checkUpgrade(levels: BuildingLevels, type: BuildingType): { ok: true } | { ok: false; reason: UpgradeBlock } {
  const next = levels[type] + 1;
  if (next > def(type).maxLevel) return { ok: false, reason: 'max_level' };
  if (levels.commandCenter < requiredCC(type, next)) return { ok: false, reason: 'needs_command_center' };
  return { ok: true };
}

// ── Building effects ──────────────────────────────────────────────────────────

/** Supply cap from the Habitat: `20·L + 5·L²`. */
export const supplyCap = (habitatLevel: number): number => 20 * habitatLevel + 5 * habitatLevel ** 2;

/** Training-time multiplier for Barracks, Vehicle Bay and Hangar: −2% per level above 1. */
export const trainingTimeFactor = (buildingLevel: number): number => 1 - 0.02 * (Math.max(1, buildingLevel) - 1);

/** Titans a base may own: 1 at Forge L1, 2 at L3, 3 at L5. */
export const titanCap = (forgeLevel: number): number => (forgeLevel <= 0 ? 0 : 1 + Math.floor((forgeLevel - 1) / 2));

/** Share of a defender's destroyed units that the Repair Bay brings back: `10% + 1%·L`. */
export const repairFraction = (repairBayLevel: number): number => (repairBayLevel <= 0 ? 0 : 0.1 + 0.01 * repairBayLevel);

/** Construction slots: a second builder unlocks at CC 10. */
export const builderSlots = (ccLevel: number): number => (ccLevel >= 10 ? 2 : 1);

/** Armies that can be away from home at once. */
export const maxArmiesOut = (ccLevel: number): number => 2 + Math.floor(ccLevel / 5);

// ── Defensive structures ──────────────────────────────────────────────────────

export interface TurretDef {
  name: string;
  atkPerLevel: number;
  hpPerLevel: number;
  vs: Partial<Record<UnitClass, number>>;
}

export const TURRETS = {
  sentryTurret: { name: 'Sentry Turret', atkPerLevel: 25, hpPerLevel: 250, vs: { infantry: 2, air: 0.5 } },
  railTurret: { name: 'Rail Turret', atkPerLevel: 60, hpPerLevel: 400, vs: { vehicle: 2, titan: 2, air: 0.5 } },
  flakTurret: { name: 'Flak Turret', atkPerLevel: 40, hpPerLevel: 300, vs: { infantry: 0.3, vehicle: 0.3, titan: 0.3, air: 3 } },
} satisfies Record<string, TurretDef>;

export type TurretType = keyof typeof TURRETS;
export const TURRET_TYPES = Object.keys(TURRETS) as TurretType[];

export const WALL_HP_PER_LEVEL = 1000;
/** Share of incoming damage the wall soaks while it stands. */
export const WALL_SOAK = 0.5;
/** Damage the Shield Generator absorbs each round, per level. */
export const SHIELD_PER_LEVEL = 300;
