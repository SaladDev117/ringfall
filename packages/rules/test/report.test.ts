import { describe, expect, it } from 'vitest';
import { formatBattleReport, res, simulateBattle } from '../src';
import { parseSide } from '../src/cli/parse';

describe('formatBattleReport', () => {
  const result = simulateBattle({
    attacker: { trooper: 40, rattler: 10, mule: 3 },
    defender: { trooper: 12, breacher: 2 },
    defenses: { sentryTurret: 2, perimeterWall: 1 },
    seed: 'report',
  });

  it('reads like the spec example for the attacker', () => {
    expect(result.outcome).toBe('attacker');
    const text = formatBattleReport(result, {
      perspective: 'attacker', attackerName: 'Vex', defenderName: 'dave', targetName: 'Iron Hollow',
      coords: 'S14 · 852, 18', loot: res(2400, 1340, 1), carry: 3755, repaired: { trooper: 2 },
    });
    expect(text).toContain('⚔ RAID ON IRON HOLLOW (dave) · S14 · 852, 18');
    expect(text).toContain('VICTORY');
    expect(text).toMatch(/YOUR FORCE\s+SENT\s+LOST/);
    expect(text).toMatch(/Trooper\s+40/);
    expect(text).toContain('(2 patched up by Repair Bay)');
    expect(text).toContain('Sentry Turret L2');
    expect(text).toContain('LOOT   2,400 Alloy · 1,340 Plasma · 1 Relic Shard');
    expect(text).toContain('(carry 3,741 / 3,755)');
    expect(text).toMatch(/^R1 {2}You deal/m);
  });

  it('flips wording for the defender', () => {
    const text = formatBattleReport(result, {
      perspective: 'defender', attackerName: 'Vex', defenderName: 'dave', targetName: 'Iron Hollow',
      loot: res(2400, 1340, 1), salvage: 104,
    });
    expect(text).toContain('RAIDED');
    expect(text).toContain('YOUR DEFENDERS');
    expect(text).toContain('STOLEN');
    expect(text).toContain('SALVAGE  +104 Alloy');
    expect(text).toMatch(/^R1 {2}They deal/m);
  });
});

describe('sim CLI parser', () => {
  it('reads units, structures and nests', () => {
    expect(parseSide('40 troopers, 10 rattler, 3 mules')).toMatchObject({ army: { trooper: 40, rattler: 10, mule: 3 } });
    expect(parseSide('12 trooper, sentry:2, wall:1, repair:5')).toEqual({
      army: { trooper: 12 }, defenses: { sentryTurret: 2, perimeterWall: 1 }, repairBay: 5,
    });
    expect(parseSide('nest:5')).toMatchObject({ nestLevel: 5, army: { crawler: 120, spitter: 20, brute: 3 } });
    expect(parseSide('2 buggies, 1 gunship')).toMatchObject({ army: { rattler: 2, kestrel: 1 } });
    expect(() => parseSide('5 dragons')).toThrow(/Unknown unit/);
  });
});
