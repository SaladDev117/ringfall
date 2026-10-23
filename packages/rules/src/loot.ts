import { RESOURCES, res, type Resource, type Resources } from './resources';
import { UNIT_KEYS, UNITS, type Army } from './units';

/** Share of each unprotected resource a winning raid can take. */
export const LOOT_SHARE: Resources = res(0.2, 0.2, 0.1);
/** Share of the Alloy cost of destroyed attackers the defender recovers. */
export const SALVAGE_SHARE = 0.2;

/** What a winning raid could take from a defender, before the attacker's carry limit. */
export function lootable(stored: Resources, protectedAmount: Resources): Resources {
  const out = res();
  for (const r of RESOURCES) out[r] = Math.floor(Math.max(0, stored[r] - protectedAmount[r]) * LOOT_SHARE[r]);
  return out;
}

/**
 * Fills `capacity` from `available`, split evenly across resource types: a type that can't fill its
 * share hands the rest of its share to the others.
 */
export function takeLoot(available: Resources, capacity: number): Resources {
  const out = res();
  let remaining = Math.max(0, Math.floor(capacity));
  const order = [...RESOURCES].sort((a, b) => available[a] - available[b]);
  order.forEach((r: Resource, i) => {
    const typesLeft = order.length - i;
    const share = typesLeft === 1 ? remaining : Math.floor(remaining / typesLeft);
    const take = Math.min(Math.floor(available[r]), share);
    out[r] = take;
    remaining -= take;
  });
  return out;
}

/** Alloy the defender recovers from the attackers they destroyed. */
export function salvageAlloy(attackerLost: Army): number {
  let alloy = 0;
  for (const key of UNIT_KEYS) alloy += (attackerLost[key] ?? 0) * UNITS[key].cost.alloy;
  return Math.floor(alloy * SALVAGE_SHARE);
}
