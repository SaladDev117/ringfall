import { res, type Resources } from './resources';
import { titanCap, trainingTimeFactor, type BuildingType } from './buildings';

const MIN = 60;
const HOUR = 3600;

export type UnitClass = 'scout' | 'infantry' | 'vehicle' | 'air' | 'titan' | 'structure';

/** What every combatant (player unit, Blight creature, turret) needs in a battle. */
export interface CombatStats {
  name: string;
  class: UnitClass;
  atk: number;
  hp: number;
  /** Damage multipliers against target classes. Anything missing is ×1. */
  vs: Partial<Record<UnitClass, number>>;
}

export type TrainingBuilding = 'barracks' | 'vehicleBay' | 'hangar' | 'titanForge';

export interface UnitDef extends CombatStats {
  /** Tiles per hour. */
  speed: number;
  /** Loot it can bring home. */
  carry: number;
  /** Habitat space it takes. */
  supply: number;
  cost: Resources;
  /** Base training time in seconds (before the building's level bonus). */
  seconds: number;
  trainedAt: TrainingBuilding;
  requires: Partial<Record<BuildingType, number>>;
}

/** Ground units (except Titans) struggle to hit aircraft. */
const GROUND = { air: 0.5 };

export const UNITS = {
  wisp: {
    name: 'Wisp Drone', class: 'scout', atk: 0, hp: 5, speed: 60, carry: 0, supply: 1,
    cost: res(30, 20), seconds: 4 * MIN, trainedAt: 'barracks', requires: { sensorArray: 1 }, vs: GROUND,
  },
  trooper: {
    name: 'Trooper', class: 'infantry', atk: 12, hp: 40, speed: 10, carry: 25, supply: 1,
    cost: res(60, 20), seconds: 3 * MIN, trainedAt: 'barracks', requires: { barracks: 1 }, vs: GROUND,
  },
  breacher: {
    name: 'Breacher', class: 'infantry', atk: 18, hp: 45, speed: 9, carry: 15, supply: 1,
    cost: res(90, 60), seconds: 8 * MIN, trainedAt: 'barracks', requires: { barracks: 3 },
    vs: { vehicle: 2.5, titan: 2.5, air: 0.5 },
  },
  rattler: {
    name: 'Rattler Buggy', class: 'vehicle', atk: 45, hp: 160, speed: 30, carry: 120, supply: 3,
    cost: res(220, 120), seconds: 20 * MIN, trainedAt: 'vehicleBay', requires: { vehicleBay: 1 }, vs: GROUND,
  },
  mule: {
    name: 'Mule Hauler', class: 'vehicle', atk: 8, hp: 300, speed: 18, carry: 600, supply: 4,
    cost: res(300, 100), seconds: 40 * MIN, trainedAt: 'vehicleBay', requires: { vehicleBay: 2 }, vs: GROUND,
  },
  bulwark: {
    name: 'Bulwark Tank', class: 'vehicle', atk: 150, hp: 900, speed: 12, carry: 100, supply: 8,
    cost: res(700, 350), seconds: 90 * MIN, trainedAt: 'vehicleBay', requires: { vehicleBay: 5 },
    vs: { infantry: 1.5, air: 0.5 },
  },
  kestrel: {
    name: 'Kestrel Gunship', class: 'air', atk: 200, hp: 550, speed: 40, carry: 250, supply: 10,
    cost: res(900, 700, 15), seconds: 3 * HOUR, trainedAt: 'hangar', requires: { hangar: 1 }, vs: { vehicle: 1.5 },
  },
  hammerfall: {
    name: 'Hammerfall Walker', class: 'vehicle', atk: 70, hp: 700, speed: 6, carry: 0, supply: 12,
    cost: res(1100, 600, 30), seconds: 5 * HOUR, trainedAt: 'vehicleBay', requires: { vehicleBay: 10 },
    vs: { structure: 5, air: 0.5 },
  },
  titan: {
    name: 'Oruun Titan', class: 'titan', atk: 1200, hp: 9000, speed: 5, carry: 1500, supply: 40,
    cost: res(6000, 4000, 250), seconds: 12 * HOUR, trainedAt: 'titanForge', requires: { titanForge: 1 }, vs: {},
  },
} satisfies Record<string, UnitDef>;

export type UnitKey = keyof typeof UNITS;
export const UNIT_KEYS = Object.keys(UNITS) as UnitKey[];

/** Blight creatures garrison the NPC nests. */
export const BLIGHT = {
  crawler: { name: 'Crawler', class: 'infantry', atk: 8, hp: 30, vs: GROUND },
  spitter: { name: 'Spitter', class: 'infantry', atk: 30, hp: 120, vs: { air: 2 } },
  brute: { name: 'Brute', class: 'vehicle', atk: 90, hp: 800, vs: GROUND },
} satisfies Record<string, CombatStats>;

export type BlightKey = keyof typeof BLIGHT;
export const BLIGHT_KEYS = Object.keys(BLIGHT) as BlightKey[];

export type CombatantKey = UnitKey | BlightKey;
/** Canonical order: battles iterate stacks in this order so results never depend on object key order. */
export const COMBATANT_KEYS: readonly CombatantKey[] = [...UNIT_KEYS, ...BLIGHT_KEYS];
export const COMBATANTS: Record<CombatantKey, CombatStats> = { ...UNITS, ...BLIGHT };

/** Unit counts by type. */
export type Army = Partial<Record<CombatantKey, number>>;

export const isUnitKey = (key: string): key is UnitKey => key in UNITS;

/** Seconds to train one unit in a building at `buildingLevel`. Titans always take 12 hours. */
export function trainSeconds(unit: UnitKey, buildingLevel: number): number {
  const u: UnitDef = UNITS[unit];
  if (u.trainedAt === 'titanForge') return u.seconds;
  return Math.round(u.seconds * trainingTimeFactor(buildingLevel));
}

export type TrainBlock = 'missing_building' | 'titan_cap';

/** Whether a base with these building levels and `titansOwned` may queue `unit`. Cost and supply are checked separately. */
export function checkTrain(
  levels: Record<BuildingType, number>,
  unit: UnitKey,
  qty: number,
  titansOwned = 0,
): { ok: true } | { ok: false; reason: TrainBlock } {
  const u: UnitDef = UNITS[unit];
  for (const [building, level] of Object.entries(u.requires) as [BuildingType, number][]) {
    if (levels[building] < level) return { ok: false, reason: 'missing_building' };
  }
  if (unit === 'titan' && titansOwned + qty > titanCap(levels.titanForge)) return { ok: false, reason: 'titan_cap' };
  return { ok: true };
}

export function armySupply(army: Army): number {
  let total = 0;
  for (const key of UNIT_KEYS) total += (army[key] ?? 0) * UNITS[key].supply;
  return total;
}

export function armyCarry(army: Army): number {
  let total = 0;
  for (const key of UNIT_KEYS) total += (army[key] ?? 0) * UNITS[key].carry;
  return total;
}

/** Speed of the slowest unit in the army, in tiles per hour. */
export function slowestSpeed(army: Army): number {
  let slowest = Infinity;
  for (const key of UNIT_KEYS) if ((army[key] ?? 0) > 0) slowest = Math.min(slowest, UNITS[key].speed);
  if (slowest === Infinity) throw new Error('Army has no units');
  return slowest;
}

export function armySize(army: Army): number {
  return COMBATANT_KEYS.reduce((n, key) => n + (army[key] ?? 0), 0);
}
