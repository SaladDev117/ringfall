import {
  SHIELD_PER_LEVEL, TURRET_TYPES, TURRETS, WALL_HP_PER_LEVEL, WALL_SOAK, repairFraction, type TurretType,
} from './buildings';
import { createRng, type Rng } from './rng';
import { COMBATANT_KEYS, COMBATANTS, UNIT_KEYS, type Army, type CombatantKey, type UnitClass } from './units';

export const MAX_ROUNDS = 4;
/** Each stack's damage varies by ±10% per round. */
const SPREAD = 0.1;

export type Defenses = Partial<Record<TurretType | 'perimeterWall' | 'shieldGenerator', number>>;
export type StackKey = CombatantKey | TurretType;
export type Losses = Partial<Record<StackKey, number>>;
export type Outcome = 'attacker' | 'defender' | 'draw';

export interface BattleInput {
  attacker: Army;
  defender: Army;
  /** Structure levels on the defending base. Nests have none. */
  defenses?: Defenses;
  seed: string;
}

export interface RoundLog {
  round: number;
  /** Damage each side landed on enemy units and turrets, after the shield and wall. */
  attackerDamage: number;
  defenderDamage: number;
  shieldAbsorbed: number;
  wallDamage: number;
  wallHpLeft: number;
  attackerLosses: Losses;
  defenderLosses: Losses;
}

export interface BattleResult {
  outcome: Outcome;
  seed: string;
  rounds: RoundLog[];
  defenses: Defenses;
  attacker: { sent: Army; lost: Army; survivors: Army };
  defender: { home: Army; lost: Army; survivors: Army; turretsKnockedOut: TurretType[] };
  wallBreachedInRound: number | null;
}

interface Stack {
  key: StackKey;
  class: UnitClass;
  atk: number;
  hp: number;
  vs: Partial<Record<UnitClass, number>>;
  count: number;
  /** Damage carried over onto the next unit in the stack. */
  partial: number;
}

const mult = (shooter: Stack, target: UnitClass): number => shooter.vs[target] ?? 1;
const alive = (stacks: Stack[]): boolean => stacks.some((s) => s.count > 0);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

function armyStacks(army: Army): Stack[] {
  const stacks: Stack[] = [];
  for (const key of COMBATANT_KEYS) {
    const count = Math.floor(army[key] ?? 0);
    if (count <= 0) continue;
    const c = COMBATANTS[key];
    stacks.push({ key, class: c.class, atk: c.atk, hp: c.hp, vs: c.vs, count, partial: 0 });
  }
  return stacks;
}

function turretStacks(defenses: Defenses): Stack[] {
  const stacks: Stack[] = [];
  for (const key of TURRET_TYPES) {
    const level = defenses[key] ?? 0;
    if (level <= 0) continue;
    const t = TURRETS[key];
    stacks.push({ key, class: 'structure', atk: t.atkPerLevel * level, hp: t.hpPerLevel * level, vs: t.vs, count: 1, partial: 0 });
  }
  return stacks;
}

interface Volley {
  hits: Map<Stack, number>;
  landed: number;
  shieldAbsorbed: number;
  wallDamage: number;
}

/**
 * One side fires at the other. Each shooter's damage is spread over the enemy stacks in proportion to
 * their remaining HP, so bigger stacks soak more. On the defending side the shield absorbs first,
 * then the wall soaks half of what's left while it stands.
 */
function fire(shooters: Stack[], targets: Stack[], rng: Rng, guard?: { shield: number; wallHp: number }): Volley {
  const volley: Volley = { hits: new Map(), landed: 0, shieldAbsorbed: 0, wallDamage: 0 };
  const shots = shooters
    .filter((s) => s.count > 0 && s.atk > 0)
    .map((s) => ({ s, dmg: s.count * s.atk * (1 - SPREAD + 2 * SPREAD * rng()) }));

  if (guard && guard.shield > 0) {
    const load = sum(shots.map(({ s, dmg }) => dmg * mult(s, 'structure')));
    if (load > 0) {
      const f = Math.min(1, guard.shield / load);
      volley.shieldAbsorbed = load * f;
      for (const shot of shots) shot.dmg *= 1 - f;
    }
  }
  if (guard && guard.wallHp > 0) {
    const load = sum(shots.map(({ s, dmg }) => dmg * WALL_SOAK * mult(s, 'structure')));
    if (load > 0) {
      const g = Math.min(1, guard.wallHp / load);
      volley.wallDamage = load * g;
      for (const shot of shots) shot.dmg -= shot.dmg * WALL_SOAK * g;
    }
  }

  const live = targets.filter((t) => t.count > 0);
  const weights = live.map((t) => t.count * t.hp - t.partial);
  const total = sum(weights);
  if (total <= 0) return volley;
  for (const { s, dmg } of shots) {
    live.forEach((t, i) => {
      const d = dmg * (weights[i]! / total) * mult(s, t.class);
      volley.hits.set(t, (volley.hits.get(t) ?? 0) + d);
      volley.landed += d;
    });
  }
  return volley;
}

function applyHits(hits: Map<Stack, number>): Losses {
  const losses: Losses = {};
  for (const [t, dmg] of hits) {
    const total = t.partial + dmg;
    const deaths = Math.min(t.count, Math.floor(total / t.hp + 1e-9));
    t.count -= deaths;
    t.partial = t.count > 0 ? Math.max(0, total - deaths * t.hp) : 0;
    if (deaths > 0) losses[t.key] = deaths;
  }
  return losses;
}

function unitCounts(stacks: Stack[]): Army {
  const army: Army = {};
  for (const s of stacks) if (s.key in COMBATANTS) army[s.key as CombatantKey] = s.count;
  return army;
}

function diff(before: Army, after: Army): Army {
  const out: Army = {};
  for (const key of COMBATANT_KEYS) {
    const lost = (before[key] ?? 0) - (after[key] ?? 0);
    if (lost > 0) out[key] = lost;
  }
  return out;
}

/** Resolves a battle. Deterministic: the same input and seed always give the same result. */
export function simulateBattle({ attacker, defender, defenses = {}, seed }: BattleInput): BattleResult {
  const rng = createRng(seed);
  const att = armyStacks(attacker);
  const defUnits = armyStacks(defender);
  const turrets = turretStacks(defenses);
  const def = [...defUnits, ...turrets];
  const sent = unitCounts(att);
  const home = unitCounts(defUnits);

  const shield = (defenses.shieldGenerator ?? 0) * SHIELD_PER_LEVEL;
  let wallHp = (defenses.perimeterWall ?? 0) * WALL_HP_PER_LEVEL;
  let wallBreachedInRound: number | null = null;
  const rounds: RoundLog[] = [];

  for (let round = 1; round <= MAX_ROUNDS && alive(att) && alive(def); round++) {
    // Both sides fire at the state at the start of the round, then losses apply together.
    const a = fire(att, def, rng, { shield, wallHp });
    const d = fire(def, att, rng);
    const defenderLosses = applyHits(a.hits);
    const attackerLosses = applyHits(d.hits);
    if (wallHp > 0) {
      wallHp -= a.wallDamage;
      if (wallHp <= 1e-6) {
        wallHp = 0;
        wallBreachedInRound = round;
      }
    }
    rounds.push({
      round,
      attackerDamage: a.landed,
      defenderDamage: d.landed,
      shieldAbsorbed: a.shieldAbsorbed,
      wallDamage: a.wallDamage,
      wallHpLeft: wallHp,
      attackerLosses,
      defenderLosses,
    });
  }

  // Wiping each other out in the same round counts as a defence: there's nobody left to carry loot.
  const outcome: Outcome = !alive(att) ? 'defender' : !alive(def) ? 'attacker' : 'draw';
  const attackerSurvivors = unitCounts(att);
  const defenderSurvivors = unitCounts(defUnits);
  return {
    outcome,
    seed,
    rounds,
    defenses,
    attacker: { sent, lost: diff(sent, attackerSurvivors), survivors: attackerSurvivors },
    defender: {
      home,
      lost: diff(home, defenderSurvivors),
      survivors: defenderSurvivors,
      turretsKnockedOut: turrets.filter((t) => t.count === 0).map((t) => t.key as TurretType),
    },
    wallBreachedInRound,
  };
}

/** Defender units the Repair Bay brings back after a battle (rounded down per unit type). */
export function repairedUnits(lost: Army, repairBayLevel: number): Army {
  const f = repairFraction(repairBayLevel);
  const out: Army = {};
  for (const key of UNIT_KEYS) {
    const n = Math.floor((lost[key] ?? 0) * f);
    if (n > 0) out[key] = n;
  }
  return out;
}
