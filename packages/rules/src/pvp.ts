import { maxArmiesOut } from './buildings';

const HOUR = 3600_000;

export const BEGINNER_PROTECTION_MS = 72 * HOUR;
export const BEGINNER_PROTECTION_UNTIL_CC = 5;
/** Shield a defender gets after losing a raid. */
export const SHIELD_MS = 4 * HOUR;
/** You can't attack a base with less than this share of your Power (unless it's revenge). */
export const POWER_GAP = 0.4;
export const REVENGE_WINDOW_MS = 48 * HOUR;
export const REPEAT_LIMIT = 3;
export const REPEAT_WINDOW_MS = 24 * HOUR;

export interface Commander {
  power: number;
  ccLevel: number;
  /** Epoch ms. */
  joinedAt: number;
  /** True once they've attacked a player, which ends beginner protection early. */
  protectionBroken: boolean;
  /** Epoch ms, or 0 for no shield. */
  shieldUntil: number;
}

export function hasBeginnerProtection(c: Commander, now: number): boolean {
  return !c.protectionBroken && c.ccLevel < BEGINNER_PROTECTION_UNTIL_CC && now < c.joinedAt + BEGINNER_PROTECTION_MS;
}

export const isShielded = (c: Commander, at: number): boolean => at < c.shieldUntil;

export type AttackBlock = 'target_protected' | 'target_shielded' | 'power_gap' | 'repeat_limit' | 'too_many_armies';

export interface AttackCheck {
  now: number;
  attacker: Commander;
  target: Commander;
  attackerArmiesOut: number;
  /** Times this attacker hit this target in the last 24 h. */
  recentAttacksOnTarget: number;
  /** The target attacked this attacker within the revenge window. */
  isRevenge: boolean;
}

export type AttackVerdict =
  | { ok: true; endsOwnProtection: boolean; endsOwnShield: boolean }
  | { ok: false; reason: AttackBlock };

/** Whether a player may launch an attack on another player. NPC nests skip all of this. */
export function checkAttack({ now, attacker, target, attackerArmiesOut, recentAttacksOnTarget, isRevenge }: AttackCheck): AttackVerdict {
  if (attackerArmiesOut >= maxArmiesOut(attacker.ccLevel)) return { ok: false, reason: 'too_many_armies' };
  if (hasBeginnerProtection(target, now)) return { ok: false, reason: 'target_protected' };
  if (isShielded(target, now)) return { ok: false, reason: 'target_shielded' };
  if (!isRevenge && target.power < attacker.power * POWER_GAP) return { ok: false, reason: 'power_gap' };
  if (recentAttacksOnTarget >= REPEAT_LIMIT) return { ok: false, reason: 'repeat_limit' };
  return {
    ok: true,
    endsOwnProtection: hasBeginnerProtection(attacker, now),
    endsOwnShield: isShielded(attacker, now),
  };
}

// ── Scouting & warnings ───────────────────────────────────────────────────────

/** A scout mission succeeds when the Wisps outnumber twice the Sensor Array level plus the Wisps at home. */
export const scoutSucceeds = (wisps: number, targetSensorLevel: number, targetHomeWisps: number): boolean =>
  wisps > 2 * targetSensorLevel + targetHomeWisps;

/** Defenders with a Sensor Array of 3+ are told who scouted them. */
export const notifiedOfScout = (sensorLevel: number): boolean => sensorLevel >= 3;

export type WarningTier = 'late' | 'arrival' | 'count' | 'types';

/** How much the defender learns about an incoming attack, by Sensor Array level. */
export function warningTier(sensorLevel: number): WarningTier {
  if (sensorLevel >= 10) return 'types';
  if (sensorLevel >= 5) return 'count';
  if (sensorLevel >= 1) return 'arrival';
  return 'late';
}

/** Without a Sensor Array, the warning only comes this long before arrival. */
export const LATE_WARNING_MS = 10 * 60_000;

/** When the defender's warning (and push) fires. */
export const warningAt = (launchedAt: number, arrivesAt: number, sensorLevel: number): number =>
  warningTier(sensorLevel) === 'late' ? Math.max(launchedAt, arrivesAt - LATE_WARNING_MS) : launchedAt;
