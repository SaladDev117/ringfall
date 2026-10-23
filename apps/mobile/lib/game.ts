import * as R from '@ringfall/rules';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api';
import { serverNow, syncServerTime } from './clock';
import { fmt } from './format';
import type { BaseView } from './types';

export const RESOURCE_ICONS: Record<R.Resource, string> = { alloy: '⛭', plasma: '⚡', relics: '◆' };

export const BUILDING_INFO: Record<R.BuildingType, { icon: string; blurb: string }> = {
  commandCenter: { icon: '🏛', blurb: 'The heart of your outpost. Nothing can be built higher than it, and it unlocks new buildings.' },
  alloyExtractor: { icon: '⛏', blurb: 'Mines Alloy, the metal everything is built from.' },
  plasmaTap: { icon: '⚡', blurb: 'Draws Plasma from the Ring’s old power conduits.' },
  relicDigSite: { icon: '◆', blurb: 'Digs up Relic Shards, the Oruun tech behind gunships, walkers and Titans.' },
  depot: { icon: '📦', blurb: 'Raises how much of each resource you can store. Production stops when it’s full.' },
  vault: { icon: '🔒', blurb: 'Protects part of your resources. Raiders can never take what’s in the Vault.' },
  habitat: { icon: '🏠', blurb: 'Houses your army. Every unit takes supply.' },
  barracks: { icon: '🪖', blurb: 'Trains infantry and Wisp Drones. Each level trains 2% faster.' },
  vehicleBay: { icon: '🛞', blurb: 'Builds buggies, haulers, tanks and walkers. Each level builds 2% faster.' },
  hangar: { icon: '🛩', blurb: 'Builds Kestrel Gunships. Each level builds 2% faster.' },
  titanForge: { icon: '🗿', blurb: 'Refits ancient Oruun war-frames into Titans. Higher levels let you own more.' },
  sensorArray: { icon: '📡', blurb: 'Warns you of attacks earlier, stops enemy scouts, and reveals neighbouring sectors.' },
  repairBay: { icon: '🔧', blurb: 'Patches up some of the defenders you lose in a battle.' },
  sentryTurret: { icon: '🔫', blurb: 'Defensive turret that shreds infantry.' },
  railTurret: { icon: '🎯', blurb: 'Defensive turret that punches through vehicles and Titans.' },
  flakTurret: { icon: '💥', blurb: 'Defensive turret that tears gunships out of the sky.' },
  perimeterWall: { icon: '🧱', blurb: 'Soaks half of the damage aimed at your base until it’s breached.' },
  shieldGenerator: { icon: '🛡', blurb: 'Absorbs a fixed amount of damage every battle round.' },
};

export const UNIT_ICONS: Record<R.UnitKey, string> = {
  wisp: '🛰', trooper: '🪖', breacher: '🚀', rattler: '🏎', mule: '🚚', bulwark: '🛡', kestrel: '🛩', hammerfall: '🦿', titan: '🗿',
};

/** Buildings a Command Center at `level` unlocks for the first time. */
export const unlockedAt = (level: number): string[] =>
  R.BUILDING_TYPES.filter((t) => R.BUILDINGS[t].unlockCC === level && level > 1).map((t) => R.BUILDINGS[t].name);

/** One line describing what a building does at `level`. */
export function effectAt(type: R.BuildingType, level: number): string {
  if (level <= 0) return 'Not built';
  switch (type) {
    case 'alloyExtractor': return `${fmt(R.productionPerHour('alloy', level))} Alloy / hour`;
    case 'plasmaTap': return `${fmt(R.productionPerHour('plasma', level))} Plasma / hour`;
    case 'relicDigSite': return `${R.productionPerHour('relics', level).toFixed(1)} Relics / hour`;
    case 'depot': return `Stores ${fmt(R.depotCapacity(level).alloy)} of each`;
    case 'vault': return `Protects ${fmt(R.vaultProtection(level).alloy)} of each`;
    case 'habitat': return `${fmt(R.supplyCap(level))} supply`;
    case 'barracks': case 'vehicleBay': case 'hangar': return `Training ${Math.round((1 - R.trainingTimeFactor(level)) * 100)}% faster`;
    case 'titanForge': return `Up to ${R.titanCap(level)} Titan${R.titanCap(level) === 1 ? '' : 's'}`;
    case 'sensorArray': return level >= 10 ? 'Sees incoming unit types' : level >= 5 ? 'Sees incoming troop counts' : 'Warns of attacks at launch';
    case 'repairBay': return `Repairs ${Math.round(R.repairFraction(level) * 100)}% of lost defenders`;
    case 'sentryTurret': case 'railTurret': case 'flakTurret': {
      const t = R.TURRETS[type];
      return `${fmt(t.atkPerLevel * level)} attack · ${fmt(t.hpPerLevel * level)} HP`;
    }
    case 'perimeterWall': return `${fmt(R.WALL_HP_PER_LEVEL * level)} HP`;
    case 'shieldGenerator': return `Absorbs ${fmt(R.SHIELD_PER_LEVEL * level)} per round`;
    case 'commandCenter': {
      const unlocks = unlockedAt(level);
      const base = `${R.builderSlots(level)} builder${R.builderSlots(level) > 1 ? 's' : ''} · ${R.maxArmiesOut(level)} armies out`;
      return unlocks.length ? `${base} · unlocks ${unlocks.join(', ')}` : base;
    }
  }
}

/** Resources right now, projected from the last snapshot with the rules engine. */
export function liveResources(base: BaseView, now: number): R.Resources {
  return R.accrue(base.resources, base.rates, Math.max(0, now - base.resourcesAt) / 1000, base.caps);
}

/** The next moment something on the base finishes, so the app can refresh right then. */
function nextChange(base: BaseView): number | null {
  const times = [
    ...base.builds.map((b) => b.endsAt),
    ...base.training.map((t) => t.startsAt + (t.done + 1) * t.unitMs),
    ...base.armies.map((a) => (a.status === 'outbound' ? a.arrivesAt : a.returnsAt ?? Infinity)),
    ...base.incoming.map((i) => i.arrivesAt),
    base.shieldUntil ?? Infinity,
  ].filter((t) => Number.isFinite(t));
  return times.length ? Math.min(...times) : null;
}

/** The player's base: refetched every 20 s, on focus, and the moment any timer runs out. */
export function useBase() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['base'],
    queryFn: async () => {
      const base = await api.base();
      syncServerTime(base.serverTime);
      return base;
    },
    refetchInterval: 20_000,
  });
  const next = query.data ? nextChange(query.data) : null;
  useEffect(() => {
    if (!next) return;
    const id = setTimeout(() => qc.invalidateQueries({ queryKey: ['base'] }), Math.max(500, next - serverNow() + 750));
    return () => clearTimeout(id);
  }, [next, qc]);
  return query;
}

export const canAfford = (base: BaseView, cost: R.Resources, now: number) => R.canAfford(liveResources(base, now), cost);

export function costParts(cost: R.Resources): { icon: string; amount: number; key: R.Resource }[] {
  return R.RESOURCES.filter((r) => cost[r] > 0).map((r) => ({ icon: RESOURCE_ICONS[r], amount: cost[r], key: r }));
}

/** Units in an army as a short list, e.g. `20× Trooper, 3× Mule Hauler`. */
export function armyText(army: R.Army): string {
  const parts = R.COMBATANT_KEYS.filter((k) => army[k]).map((k) => `${army[k]}× ${R.COMBATANTS[k].name}`);
  return parts.length ? parts.join(', ') : 'nobody';
}
