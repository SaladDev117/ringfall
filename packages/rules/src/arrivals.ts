import type { BuildingLevels } from './buildings';
import { repairedUnits, simulateBattle, type BattleResult, type Defenses } from './combat';
import { lootable, salvageAlloy, takeLoot } from './loot';
import { nestLoot } from './nests';
import { scoutSucceeds } from './pvp';
import { RESOURCES, res, vaultProtection, type Resources } from './resources';
import { cloneBase, type BaseState } from './settle';
import { COMBATANT_KEYS, armyCarry, type Army } from './units';

export const defensesOf = (levels: BuildingLevels): Defenses => ({
  sentryTurret: levels.sentryTurret,
  railTurret: levels.railTurret,
  flakTurret: levels.flakTurret,
  perimeterWall: levels.perimeterWall,
  shieldGenerator: levels.shieldGenerator,
});

function plus(a: Army, b: Army): Army {
  const out: Army = {};
  for (const key of COMBATANT_KEYS) {
    const n = (a[key] ?? 0) + (b[key] ?? 0);
    if (n > 0) out[key] = n;
  }
  return out;
}

export interface RaidOutcome {
  battle: BattleResult;
  /** What the attacker carries home. */
  loot: Resources;
  /** Alloy the defender recovers from destroyed attackers. */
  salvage: number;
  /** Defending units the Repair Bay brought back. */
  repaired: Army;
  /** The defending base after the battle. */
  defender: BaseState;
  /** Attacking units heading home. */
  survivors: Army;
}

/** A player army reaches a player base. `defender` must already be settled to the arrival time. */
export function resolveRaid(defender: BaseState, attackers: Army, seed: string): RaidOutcome {
  const battle = simulateBattle({ attacker: attackers, defender: defender.units, defenses: defensesOf(defender.levels), seed });
  const s = cloneBase(defender);
  const repaired = repairedUnits(battle.defender.lost, s.levels.repairBay);
  s.units = plus(battle.defender.survivors, repaired);
  let loot = res();
  if (battle.outcome === 'attacker') {
    loot = takeLoot(lootable(s.resources, vaultProtection(s.levels.vault)), armyCarry(battle.attacker.survivors));
    for (const r of RESOURCES) s.resources[r] -= loot[r];
  }
  const salvage = salvageAlloy(battle.attacker.lost);
  s.resources.alloy += salvage;
  return { battle, loot, salvage, repaired, defender: s, survivors: battle.attacker.survivors };
}

export interface ScoutOutcome {
  success: boolean;
  /** What the Wisps saw, if they got through. */
  intel: { resources: Resources; units: Army; levels: BuildingLevels } | null;
  /** Wisps heading home (none if they were shot down). */
  survivors: Army;
}

export function resolveScout(target: BaseState, wisps: number): ScoutOutcome {
  const success = scoutSucceeds(wisps, target.levels.sensorArray, target.units.wisp ?? 0);
  if (!success) return { success, intel: null, survivors: {} };
  const resources = res();
  for (const r of RESOURCES) resources[r] = Math.floor(target.resources[r]);
  return {
    success,
    intel: { resources, units: { ...target.units }, levels: { ...target.levels } },
    survivors: { wisp: wisps },
  };
}

export interface NestOutcome {
  battle: BattleResult;
  loot: Resources;
  /** Blight left in the nest. Empty means the nest was cleared. */
  garrisonLeft: Army;
  survivors: Army;
  cleared: boolean;
}

/** A player army reaches a Blight Nest. A nest only gives up its loot when it's cleared. */
export function resolveNestRaid(nestLevel: number, garrison: Army, attackers: Army, seed: string): NestOutcome {
  const battle = simulateBattle({ attacker: attackers, defender: garrison, seed });
  const cleared = battle.outcome === 'attacker';
  const loot = cleared ? takeLoot(nestLoot(nestLevel), armyCarry(battle.attacker.survivors)) : res();
  return { battle, loot, garrisonLeft: battle.defender.survivors, survivors: battle.attacker.survivors, cleared };
}
