import { describe, expect, it } from 'vitest';
import { simulateBattle, repairedUnits, nestGarrison, type Army, type BattleInput } from '../src';

const run = (input: Omit<BattleInput, 'seed'>, seed = 't') => simulateBattle({ ...input, seed });

function winRate(input: Omit<BattleInput, 'seed'>, n = 200): number {
  let wins = 0;
  for (let i = 0; i < n; i++) if (run(input, `w${i}`).outcome === 'attacker') wins++;
  return wins / n;
}

describe('simulateBattle', () => {
  it('is deterministic for a seed and independent of key order', () => {
    const a = run({ attacker: { trooper: 40, rattler: 10 }, defender: { trooper: 20, breacher: 5 }, defenses: { sentryTurret: 2 } });
    const b = run({ attacker: { rattler: 10, trooper: 40 }, defender: { breacher: 5, trooper: 20 }, defenses: { sentryTurret: 2 } });
    expect(b).toEqual(a);
    const c = run({ attacker: { trooper: 40, rattler: 10 }, defender: { trooper: 20, breacher: 5 }, defenses: { sentryTurret: 2 } }, 'other');
    expect(c.rounds).not.toEqual(a.rounds);
  });

  it('an undefended base falls without a fight', () => {
    const r = run({ attacker: { rattler: 1 }, defender: {}, defenses: { perimeterWall: 3 } });
    expect(r.outcome).toBe('attacker');
    expect(r.rounds).toHaveLength(0);
  });

  it('never loses more units than were there', () => {
    for (let i = 0; i < 50; i++) {
      const r = run({ attacker: { trooper: 30, bulwark: 2 }, defender: { trooper: 30, breacher: 10 }, defenses: { railTurret: 3 } }, `s${i}`);
      expect(r.attacker.lost.trooper ?? 0).toBeLessThanOrEqual(30);
      expect(r.attacker.lost.bulwark ?? 0).toBeLessThanOrEqual(2);
      expect((r.attacker.lost.trooper ?? 0) + (r.attacker.survivors.trooper ?? 0)).toBe(30);
      expect(r.rounds.length).toBeLessThanOrEqual(4);
    }
  });

  it('overwhelming force wins either way', () => {
    expect(winRate({ attacker: { trooper: 200 }, defender: { trooper: 10 } })).toBe(1);
    expect(winRate({ attacker: { trooper: 10 }, defender: { trooper: 200 } })).toBe(0);
  });

  it('can end in a draw when both sides survive four rounds', () => {
    const r = run({ attacker: { titan: 1 }, defender: { titan: 1 } });
    expect(r.outcome).toBe('draw');
    expect(r.rounds).toHaveLength(4);
  });

  it('Breachers beat the same value of Troopers against tanks', () => {
    // ~3,200 resources each: 40 Troopers (80 each) vs 21 Breachers (150 each)
    const tanks: Army = { bulwark: 2 };
    const troopers = run({ attacker: { trooper: 40 }, defender: tanks }, 'x');
    const breachers = run({ attacker: { breacher: 21 }, defender: tanks }, 'x');
    const dealt = (r: ReturnType<typeof run>) => r.rounds.reduce((s, x) => s + x.attackerDamage, 0) / r.rounds.length;
    expect(dealt(breachers)).toBeGreaterThan(dealt(troopers) * 1.5);
  });

  it('Flak shreds gunships and barely scratches infantry', () => {
    const vsAir = run({ attacker: { kestrel: 5 }, defender: {}, defenses: { flakTurret: 10, perimeterWall: 20 } });
    const vsInf = run({ attacker: { trooper: 230 }, defender: {}, defenses: { flakTurret: 10, perimeterWall: 20 } });
    expect(vsAir.rounds[0]!.defenderDamage).toBeGreaterThan(vsInf.rounds[0]!.defenderDamage * 5);
  });

  it('the shield absorbs damage every round and the wall soaks half until it breaks', () => {
    const r = run({ attacker: { trooper: 100 }, defender: { trooper: 50 }, defenses: { shieldGenerator: 1, perimeterWall: 1 } });
    const first = r.rounds[0]!;
    expect(first.shieldAbsorbed).toBe(300);
    expect(first.wallDamage).toBeGreaterThan(0);
    // 100 troopers deal ~1,200; 300 into the shield, then half of the rest into the wall (1,000 HP).
    expect(first.wallDamage).toBeCloseTo((1200 - 300) * 0.5, -2);
    const breach = r.wallBreachedInRound;
    expect(breach).not.toBeNull();
    expect(r.rounds.slice(breach!).every((x) => x.wallDamage === 0)).toBe(true);
  });

  it('Hammerfall Walkers tear through structures', () => {
    const walkers = run({ attacker: { hammerfall: 3 }, defender: {}, defenses: { railTurret: 1, perimeterWall: 5 } });
    expect(walkers.rounds[0]!.wallDamage).toBeGreaterThan(3 * 70 * 0.9 * 0.5 * 4);
  });

  it('turrets that fall are reported as knocked out', () => {
    const r = run({ attacker: { bulwark: 20 }, defender: { trooper: 5 }, defenses: { sentryTurret: 1, railTurret: 1 } });
    expect(r.outcome).toBe('attacker');
    expect(r.defender.turretsKnockedOut.sort()).toEqual(['railTurret', 'sentryTurret']);
  });

  it('10 Troopers can clear a level 1 nest (tutorial)', () => {
    expect(winRate({ attacker: { trooper: 10 }, defender: nestGarrison(1) })).toBeGreaterThan(0.9);
  });
});

describe('repairedUnits', () => {
  it('returns a share of losses, rounded down', () => {
    expect(repairedUnits({ trooper: 12, breacher: 2 }, 7)).toEqual({ trooper: 2 });
    expect(repairedUnits({ trooper: 12 }, 0)).toEqual({});
  });
});
