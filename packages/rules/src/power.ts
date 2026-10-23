import { BUILDING_TYPES, upgradeCost, type BuildingLevels, type BuildingType } from './buildings';
import type { Resources } from './resources';
import { UNIT_KEYS, UNITS, type Army } from './units';

/** Relics are worth this many Alloy/Plasma when scoring Power. */
export const RELIC_WEIGHT = 20;

/** Power points for a pile of resources: every 1,000 is one point. */
export const resourceValue = (r: Resources): number => (r.alloy + r.plasma + r.relics * RELIC_WEIGHT) / 1000;

export function buildingValue(type: BuildingType, level: number): number {
  let value = 0;
  for (let l = 1; l <= level; l++) value += resourceValue(upgradeCost(type, l));
  return value;
}

export function armyValue(army: Army): number {
  let value = 0;
  for (const key of UNIT_KEYS) value += (army[key] ?? 0) * resourceValue(UNITS[key].cost);
  return value;
}

/** Power = buildings + every living unit (home or away), rounded down. */
export function power(levels: BuildingLevels, livingUnits: Army): number {
  let value = armyValue(livingUnits);
  for (const type of BUILDING_TYPES) value += buildingValue(type, levels[type]);
  return Math.floor(value);
}
