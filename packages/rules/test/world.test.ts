import { describe, expect, it } from 'vitest';
import {
  GATE_CAP_TILES, LATE_WARNING_MS, RING_LENGTH, armyCarry, armySupply, checkAttack, distance, formatCoords, lootable,
  nestGarrison, nestLoot, notifiedOfScout, power, regrowNest, res, salvageAlloy, scoutSucceeds, sectorOf,
  slowestSpeed, startingLevels, takeLoot, travelSeconds, vaultProtection, warningAt, warningTier, type Commander,
} from '../src';

describe('map', () => {
  it('wraps around the ring', () => {
    expect(distance({ x: 2398, y: 10 }, { x: 2, y: 10 })).toBe(4);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(sectorOf(-1)).toBe(RING_LENGTH / 60 - 1);
    expect(formatCoords({ x: 852, y: 18 })).toBe('S14 · 852, 18');
  });

  it('travel time comes from the slowest unit, capped by the Gate network', () => {
    const near = { x: 100, y: 10 };
    expect(travelSeconds(near, { x: 110, y: 10 }, { rattler: 5 })).toBe(20 * 60);
    expect(travelSeconds(near, { x: 110, y: 10 }, { rattler: 5, trooper: 1 })).toBe(3600);
    const far = { x: 1300, y: 30 };
    expect(distance(near, far)).toBeGreaterThan(GATE_CAP_TILES);
    expect(travelSeconds(near, far, { trooper: 1 })).toBe(4 * 3600);
    expect(travelSeconds(near, far, { titan: 1 })).toBe(8 * 3600);
    expect(travelSeconds(near, far, { rattler: 1 })).toBe(80 * 60);
  });

  it('armies report supply, carry and speed', () => {
    expect(armySupply({ trooper: 10, rattler: 2 })).toBe(16);
    expect(armyCarry({ trooper: 35, rattler: 9, mule: 3 })).toBe(3755);
    expect(slowestSpeed({ kestrel: 1, hammerfall: 1 })).toBe(6);
    expect(() => slowestSpeed({})).toThrow();
  });
});

describe('loot', () => {
  it('takes 20% of unprotected Alloy/Plasma and 10% of Relics', () => {
    expect(lootable(res(14197, 8897, 120), res(2197, 2197, 110))).toEqual(res(2400, 1340, 1));
    expect(lootable(res(500, 500, 5), vaultProtection(1))).toEqual(res(0, 0, 0));
  });

  it('splits carry evenly and hands unused shares to the rest (the spec example)', () => {
    expect(takeLoot(res(2400, 1340, 1), 3755)).toEqual(res(2400, 1340, 1));
    expect(takeLoot(res(5000, 5000, 5000), 300)).toEqual(res(100, 100, 100));
    expect(takeLoot(res(5000, 10, 0), 1000)).toEqual(res(990, 10, 0));
    expect(takeLoot(res(5000, 5000, 0), 0)).toEqual(res());
  });

  it('salvage is 20% of the Alloy cost of destroyed attackers', () => {
    expect(salvageAlloy({ trooper: 5, rattler: 1 })).toBe(Math.floor((5 * 60 + 220) * 0.2));
    expect(salvageAlloy({ crawler: 100 })).toBe(0);
  });
});

describe('pvp rules', () => {
  const now = Date.UTC(2026, 9, 23, 12);
  const day = 24 * 3600_000;
  const vet = (o: Partial<Commander> = {}): Commander => ({
    power: 100, ccLevel: 8, joinedAt: now - 30 * day, protectionBroken: false, shieldUntil: 0, ...o,
  });
  const base = { now, attacker: vet(), target: vet(), attackerArmiesOut: 0, recentAttacksOnTarget: 0, isRevenge: false };

  it('allows a fair fight', () => {
    expect(checkAttack(base)).toEqual({ ok: true, endsOwnProtection: false, endsOwnShield: false });
  });

  it('blocks protected, shielded, much weaker, and over-raided targets', () => {
    expect(checkAttack({ ...base, target: vet({ joinedAt: now - day, ccLevel: 3 }) })).toMatchObject({ reason: 'target_protected' });
    expect(checkAttack({ ...base, target: vet({ joinedAt: now - day, ccLevel: 5 }) }).ok).toBe(true);
    expect(checkAttack({ ...base, target: vet({ shieldUntil: now + 1 }) })).toMatchObject({ reason: 'target_shielded' });
    expect(checkAttack({ ...base, target: vet({ power: 39 }) })).toMatchObject({ reason: 'power_gap' });
    expect(checkAttack({ ...base, target: vet({ power: 39 }), isRevenge: true }).ok).toBe(true);
    expect(checkAttack({ ...base, recentAttacksOnTarget: 3 })).toMatchObject({ reason: 'repeat_limit' });
    expect(checkAttack({ ...base, attackerArmiesOut: 3 })).toMatchObject({ reason: 'too_many_armies' });
  });

  it('attacking ends your own protection and shield', () => {
    const rookie = vet({ joinedAt: now - day, ccLevel: 2, shieldUntil: now + day });
    expect(checkAttack({ ...base, attacker: rookie })).toEqual({ ok: true, endsOwnProtection: true, endsOwnShield: true });
  });

  it('scouting and warnings scale with the Sensor Array', () => {
    expect(scoutSucceeds(7, 3, 0)).toBe(true);
    expect(scoutSucceeds(6, 3, 0)).toBe(false);
    expect(scoutSucceeds(9, 3, 3)).toBe(false);
    expect([0, 2, 3].map(notifiedOfScout)).toEqual([false, false, true]);
    expect([0, 1, 4, 5, 9, 10].map(warningTier)).toEqual(['late', 'arrival', 'arrival', 'count', 'count', 'types']);
    expect(warningAt(now, now + 3600_000, 0)).toBe(now + 3600_000 - LATE_WARNING_MS);
    expect(warningAt(now, now + 5 * 60_000, 0)).toBe(now);
    expect(warningAt(now, now + 3600_000, 1)).toBe(now);
  });
});

describe('nests', () => {
  it('garrison and loot follow the spec', () => {
    expect(nestGarrison(5)).toEqual({ crawler: 120, spitter: 20, brute: 3 });
    expect(nestLoot(1)).toEqual(res(500, 500, 0));
    const five = nestLoot(5);
    expect(five.alloy + five.plasma).toBeCloseTo(13100, -2);
    expect(five.relics).toBe(25);
    expect(nestLoot(10).relics).toBe(50);
    expect(() => nestGarrison(11)).toThrow();
  });

  it('regrows 10% per hour up to full strength', () => {
    expect(regrowNest({ crawler: 0, spitter: 0, brute: 0 }, 5, 2)).toEqual({ crawler: 24, spitter: 4, brute: 0 });
    expect(regrowNest({ crawler: 100, spitter: 20, brute: 3 }, 5, 10)).toEqual(nestGarrison(5));
  });
});

describe('power', () => {
  it('counts buildings and living units', () => {
    const start = power(startingLevels(), { trooper: 5 });
    expect(start).toBeGreaterThanOrEqual(0);
    expect(power(startingLevels(), { titan: 1 }) - start).toBeGreaterThanOrEqual(14);
  });
});
