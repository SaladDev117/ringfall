import { describe, expect, it } from 'vitest';
import {
  BUILDING_TYPES, BUILDINGS, UNIT_KEYS, UNITS, accrue, builderSlots, canAfford, checkUpgrade, depotCapacity,
  frontierBoost, maxArmiesOut, productionPerHour, ratesPerHour, repairFraction, requiredCC, res, startingLevels,
  supplyCap, titanCap, trainSeconds, trainingTimeFactor, upgradeCost, upgradeSeconds, vaultProtection, checkTrain,
  RESOURCES, type BuildingType,
} from '../src';

describe('production', () => {
  it('matches the spec table', () => {
    const table = [1, 5, 10, 15, 20].map((l) => Math.round(productionPerHour('alloy', l)));
    expect(table).toEqual([33, 242, 778, 1880, 4036]);
    expect(Math.round(productionPerHour('plasma', 10))).toBe(519);
    expect(productionPerHour('relics', 20)).toBeCloseTo(134.5, 1);
    expect(productionPerHour('alloy', 0)).toBe(0);
  });

  it('always includes the trickle', () => {
    expect(ratesPerHour({ alloyExtractor: 0, plasmaTap: 0, relicDigSite: 0 })).toEqual(res(20, 10, 0));
  });

  it('applies the Frontier Boost for 7 days after joining', () => {
    expect(frontierBoost(30, 0)).toBe(1.3);
    expect(frontierBoost(250, 6.9)).toBe(2);
    expect(frontierBoost(30, 7)).toBe(1);
  });
});

describe('storage', () => {
  it('Depot and Vault follow the spec', () => {
    expect(Math.round(depotCapacity(10).alloy)).toBe(53022);
    expect(Math.round(depotCapacity(20).alloy)).toBe(730960);
    expect(depotCapacity(10).relics).toBeCloseTo(depotCapacity(10).alloy / 20);
    expect(vaultProtection(0)).toEqual(res());
    expect(vaultProtection(1).alloy).toBe(1000);
    // Vault protects about 20% of a Depot at the same level.
    expect(vaultProtection(12).alloy / depotCapacity(12).alloy).toBeCloseTo(0.2);
  });

  it('accrue stops at the cap but keeps overflow', () => {
    const cap = res(1000, 1000, 50);
    const after = accrue(res(900, 1200, 0), res(3600, 3600, 3600), 60, cap);
    expect(after.alloy).toBe(960);
    expect(after.plasma).toBe(1200); // already over the cap from loot: kept, but no more production
    expect(after.relics).toBe(50);
  });
});

describe('buildings', () => {
  it('scales cost and time by 1.45 per level', () => {
    expect(upgradeCost('alloyExtractor', 1)).toEqual(res(60, 30, 0));
    expect(upgradeCost('alloyExtractor', 2)).toEqual(res(87, 44, 0));
    const cc20 = upgradeCost('commandCenter', 20);
    expect(cc20.alloy).toBeGreaterThan(285000);
    expect(cc20.alloy).toBeLessThan(295000);
    expect(upgradeSeconds('commandCenter', 20) / 3600).toBeCloseTo(38.8, 1);
  });

  it('Command Center costs Relics only above level 10', () => {
    expect(upgradeCost('commandCenter', 10).relics).toBe(0);
    expect(upgradeCost('commandCenter', 11).relics).toBe(29);
  });

  it('Titan Forge uses its explicit build times', () => {
    expect([1, 2, 3, 4, 5].map((l) => upgradeSeconds('titanForge', l) / 3600)).toEqual([4, 8, 16, 24, 36]);
  });

  it('nothing goes above the Command Center', () => {
    expect(requiredCC('commandCenter', 5)).toBe(4);
    expect(requiredCC('barracks', 5)).toBe(5);
    expect(requiredCC('titanForge', 1)).toBe(12);
    const levels = startingLevels();
    expect(checkUpgrade(levels, 'alloyExtractor')).toEqual({ ok: false, reason: 'needs_command_center' });
    expect(checkUpgrade(levels, 'commandCenter')).toEqual({ ok: true });
    expect(checkUpgrade({ ...levels, commandCenter: 20, hangar: 10 }, 'hangar')).toEqual({ ok: false, reason: 'max_level' });
  });

  // Keeping the Depot level with the Command Center must always be enough to afford the next upgrade.
  it('every upgrade fits in the Depot you can have when it unlocks', () => {
    for (const type of BUILDING_TYPES) {
      for (let level = 1; level <= BUILDINGS[type].maxLevel; level++) {
        const depot = Math.max(1, requiredCC(type, level));
        const cost = upgradeCost(type, level);
        const cap = depotCapacity(depot);
        for (const r of RESOURCES) {
          expect(cost[r], `${type} L${level} ${r} vs Depot L${depot}`).toBeLessThanOrEqual(cap[r]);
        }
      }
    }
  });

  it('every unit fits in the Depot you can have when it unlocks', () => {
    for (const key of UNIT_KEYS) {
      const unlock = Math.max(...Object.entries(UNITS[key].requires).map(([b, l]) => requiredCC(b as BuildingType, l)));
      expect(canAfford(depotCapacity(unlock), UNITS[key].cost), key).toBe(true);
    }
  });

  it('building effects match the spec', () => {
    expect([1, 10, 20].map(supplyCap)).toEqual([25, 700, 2400]);
    expect([0, 1, 2, 3, 4, 5].map(titanCap)).toEqual([0, 1, 1, 2, 2, 3]);
    expect(repairFraction(0)).toBe(0);
    expect(repairFraction(20)).toBeCloseTo(0.3);
    expect(trainingTimeFactor(1)).toBe(1);
    expect(trainingTimeFactor(20)).toBeCloseTo(0.62);
    expect([1, 9, 10].map(builderSlots)).toEqual([1, 1, 2]);
    expect([1, 5, 20].map(maxArmiesOut)).toEqual([2, 3, 6]);
  });
});

describe('training', () => {
  it('a Rattler takes 20 minutes and a Titan 12 hours', () => {
    expect(trainSeconds('rattler', 1)).toBe(20 * 60);
    expect(trainSeconds('titan', 5)).toBe(12 * 3600);
    expect(trainSeconds('rattler', 11)).toBe(Math.round(20 * 60 * 0.8));
  });

  it('checks the building and the Titan cap', () => {
    const levels = startingLevels();
    expect(checkTrain(levels, 'trooper', 5)).toEqual({ ok: true });
    expect(checkTrain(levels, 'rattler', 1)).toEqual({ ok: false, reason: 'missing_building' });
    const forge = { ...levels, titanForge: 3 };
    expect(checkTrain(forge, 'titan', 2)).toEqual({ ok: true });
    expect(checkTrain(forge, 'titan', 1, 2)).toEqual({ ok: false, reason: 'titan_cap' });
  });
});
