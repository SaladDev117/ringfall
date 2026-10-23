import { res, type Resources } from './resources';
import type { Army, BlightKey } from './units';

export const NEST_MAX_LEVEL = 10;
/** A damaged nest regrows this share of its full garrison per hour. */
export const NEST_REGEN_PER_HOUR = 0.1;
/** Target nest density: one nest per this many bases in a sector. */
export const BASES_PER_NEST = 3;

/** Full garrison by nest level (index 0 = level 1). */
const GARRISONS: readonly Record<BlightKey, number>[] = [
  { crawler: 10, spitter: 0, brute: 0 },
  { crawler: 30, spitter: 0, brute: 0 },
  { crawler: 55, spitter: 5, brute: 0 },
  { crawler: 85, spitter: 10, brute: 1 },
  { crawler: 120, spitter: 20, brute: 3 },
  { crawler: 170, spitter: 35, brute: 6 },
  { crawler: 240, spitter: 50, brute: 10 },
  { crawler: 330, spitter: 70, brute: 15 },
  { crawler: 450, spitter: 95, brute: 22 },
  { crawler: 600, spitter: 120, brute: 30 },
];

function checkLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1 || level > NEST_MAX_LEVEL) throw new Error(`Nest level must be 1–${NEST_MAX_LEVEL}`);
}

export function nestGarrison(level: number): Army {
  checkLevel(level);
  return { ...GARRISONS[level - 1] };
}

/** Everything a cleared nest gives up: `1,000 · n^1.6` split Alloy/Plasma, plus `5·n` Relics from level 4. */
export function nestLoot(level: number): Resources {
  checkLevel(level);
  const total = Math.round(1000 * level ** 1.6);
  const alloy = Math.ceil(total / 2);
  return res(alloy, total - alloy, level >= 4 ? 5 * level : 0);
}

/** A partly-damaged nest after `hours` of regrowth (never above its full garrison). */
export function regrowNest(current: Army, level: number, hours: number): Army {
  const full = nestGarrison(level);
  const out: Army = {};
  for (const key of Object.keys(full) as BlightKey[]) {
    const max = full[key] ?? 0;
    out[key] = Math.min(max, Math.floor((current[key] ?? 0) + max * NEST_REGEN_PER_HOUR * hours));
  }
  return out;
}
