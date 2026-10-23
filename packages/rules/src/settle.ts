import { builderSlots, checkUpgrade, supplyCap, upgradeCost, upgradeSeconds, type BuildingLevels, type BuildingType } from './buildings';
import {
  FRONTIER_BOOST_DAYS, RESOURCES, accrue, addResources, canAfford, depotCapacity, frontierBoost, ratesPerHour, res,
  scaleResources, type Resources,
} from './resources';
import {
  UNIT_KEYS, UNITS, armySupply, checkTrain, trainSeconds, type Army, type TrainingBuilding, type UnitKey,
} from './units';

const DAY = 24 * 3600_000;
/** Training batches a single building can have queued. */
export const MAX_TRAIN_JOBS = 10;
/** Share of the in-progress unit's cost refunded when its batch is cancelled. */
const IN_PROGRESS_REFUND = 0.5;

export interface BuildJob {
  id: string;
  type: BuildingType;
  toLevel: number;
  startedAt: number;
  endsAt: number;
  cost: Resources;
}

export interface TrainJob {
  id: string;
  building: TrainingBuilding;
  unit: UnitKey;
  qty: number;
  /** Units of this batch already added to the base. */
  done: number;
  /** Milliseconds per unit, fixed when queued. */
  unitMs: number;
  /** When the first unit of this batch started training. */
  startsAt: number;
}

export interface ReturningArmy {
  id: string;
  units: Army;
  loot: Resources;
  returnsAt: number;
}

/** Everything about a base that changes over time. All times are epoch milliseconds. */
export interface BaseState {
  resources: Resources;
  resourcesAt: number;
  levels: BuildingLevels;
  /** Units at home. */
  units: Army;
  builds: BuildJob[];
  training: TrainJob[];
  joinedAt: number;
  /** Day of the season the player joined on, for the Frontier Boost. */
  seasonDayAtJoin: number;
}

export type SettleEvent =
  | { kind: 'build_done'; at: number; jobId: string; type: BuildingType; level: number }
  | { kind: 'train_done'; at: number; jobId: string; unit: UnitKey; qty: number }
  | { kind: 'army_returned'; at: number; armyId: string; units: Army; loot: Resources };

export const cloneBase = (s: BaseState): BaseState => ({
  ...s,
  resources: { ...s.resources },
  levels: { ...s.levels },
  units: { ...s.units },
  builds: s.builds.map((b) => ({ ...b })),
  training: s.training.map((t) => ({ ...t })),
});

export const jobEndsAt = (job: TrainJob): number => job.startsAt + job.qty * job.unitMs;

export function boostAt(state: Pick<BaseState, 'joinedAt' | 'seasonDayAtJoin'>, at: number): number {
  return frontierBoost(state.seasonDayAtJoin, (at - state.joinedAt) / DAY);
}

export function currentRates(state: BaseState, at = state.resourcesAt): Resources {
  return ratesPerHour(state.levels, boostAt(state, at));
}

export const storageCap = (state: Pick<BaseState, 'levels'>): Resources => depotCapacity(state.levels.depot);

/** Adds every unit whose training finished by `at`. Units don't affect production, so this can be done in bulk. */
function completeTraining(s: BaseState, at: number, events: SettleEvent[]): void {
  for (const job of s.training) {
    const finished = Math.min(job.qty, Math.max(0, Math.floor((at - job.startsAt) / job.unitMs)));
    if (finished > job.done) {
      s.units[job.unit] = (s.units[job.unit] ?? 0) + finished - job.done;
      job.done = finished;
      if (finished === job.qty) events.push({ kind: 'train_done', at: jobEndsAt(job), jobId: job.id, unit: job.unit, qty: job.qty });
    }
  }
  s.training = s.training.filter((j) => j.done < j.qty);
}

/**
 * Moves a base forward to `until`: resources accrue at the rate the buildings had at each moment,
 * buildings finish, units finish training, and returning armies drop off their troops and loot.
 * Never moves backwards: if the base is already past `until`, nothing happens.
 */
export function settleBase(
  state: BaseState,
  until: number,
  returning: ReturningArmy[] = [],
): { state: BaseState; events: SettleEvent[]; returned: string[] } {
  const s = cloneBase(state);
  const events: SettleEvent[] = [];
  const pending = [...returning].sort((a, b) => a.returnsAt - b.returnsAt);
  const returned: string[] = [];
  const boostEnds = s.joinedAt + FRONTIER_BOOST_DAYS * DAY;

  while (s.resourcesAt < until) {
    // The next moment production rates change, or something lands.
    let next = until;
    for (const b of s.builds) next = Math.min(next, b.endsAt);
    if (pending[0]) next = Math.min(next, pending[0].returnsAt);
    if (boostEnds > s.resourcesAt) next = Math.min(next, boostEnds);
    next = Math.max(next, s.resourcesAt);

    s.resources = accrue(s.resources, currentRates(s), (next - s.resourcesAt) / 1000, storageCap(s));
    s.resourcesAt = next;
    completeTraining(s, next, events);

    for (const b of s.builds.filter((x) => x.endsAt <= next)) {
      s.levels[b.type] = b.toLevel;
      events.push({ kind: 'build_done', at: b.endsAt, jobId: b.id, type: b.type, level: b.toLevel });
    }
    s.builds = s.builds.filter((x) => x.endsAt > next);

    while (pending[0] && pending[0].returnsAt <= next) {
      const army = pending.shift()!;
      for (const key of UNIT_KEYS) {
        const n = army.units[key] ?? 0;
        if (n > 0) s.units[key] = (s.units[key] ?? 0) + n;
      }
      s.resources = addResources(s.resources, army.loot);
      returned.push(army.id);
      events.push({ kind: 'army_returned', at: army.returnsAt, armyId: army.id, units: army.units, loot: army.loot });
    }
  }
  completeTraining(s, s.resourcesAt, events);
  return { state: s, events, returned };
}

// ── Player actions (applied to a base already settled to `now`) ───────────────

export type ActionError =
  | 'max_level' | 'needs_command_center' | 'no_free_builder' | 'already_upgrading' | 'not_enough_resources'
  | 'missing_building' | 'titan_cap' | 'not_enough_supply' | 'queue_full' | 'bad_quantity' | 'not_found'
  | 'not_enough_units';

export type ActionResult<T = object> = ({ ok: true; state: BaseState } & T) | { ok: false; error: ActionError };

function pay(s: BaseState, cost: Resources): boolean {
  if (!canAfford(s.resources, cost)) return false;
  for (const r of RESOURCES) s.resources[r] -= cost[r];
  return true;
}

export function startBuild(state: BaseState, type: BuildingType, now: number, id: string): ActionResult<{ job: BuildJob }> {
  if (state.builds.some((b) => b.type === type)) return { ok: false, error: 'already_upgrading' };
  const check = checkUpgrade(state.levels, type);
  if (!check.ok) return { ok: false, error: check.reason };
  if (state.builds.length >= builderSlots(state.levels.commandCenter)) return { ok: false, error: 'no_free_builder' };
  const s = cloneBase(state);
  const toLevel = s.levels[type] + 1;
  const cost = upgradeCost(type, toLevel);
  if (!pay(s, cost)) return { ok: false, error: 'not_enough_resources' };
  const job: BuildJob = { id, type, toLevel, startedAt: now, endsAt: now + upgradeSeconds(type, toLevel) * 1000, cost };
  s.builds.push(job);
  return { ok: true, state: s, job };
}

/** Cancelling an upgrade refunds everything. */
export function cancelBuild(state: BaseState, jobId: string): ActionResult {
  const job = state.builds.find((b) => b.id === jobId);
  if (!job) return { ok: false, error: 'not_found' };
  const s = cloneBase(state);
  s.resources = addResources(s.resources, job.cost);
  s.builds = s.builds.filter((b) => b.id !== jobId);
  return { ok: true, state: s };
}

/** Supply used by units at home, units away and units still queued. */
export function supplyUsed(state: BaseState, unitsAway: Army = {}): number {
  const queued = state.training.reduce((n, j) => n + (j.qty - j.done) * UNITS[j.unit].supply, 0);
  return armySupply(state.units) + armySupply(unitsAway) + queued;
}

/** Units owned in total: home, away and queued. */
function owned(state: BaseState, unit: UnitKey, unitsAway: Army): number {
  const queued = state.training.filter((j) => j.unit === unit).reduce((n, j) => n + j.qty - j.done, 0);
  return (state.units[unit] ?? 0) + (unitsAway[unit] ?? 0) + queued;
}

export function queueTraining(
  state: BaseState, unit: UnitKey, qty: number, now: number, id: string, unitsAway: Army = {},
): ActionResult<{ job: TrainJob }> {
  if (!Number.isInteger(qty) || qty < 1 || qty > 10_000) return { ok: false, error: 'bad_quantity' };
  const def = UNITS[unit];
  const check = checkTrain(state.levels, unit, qty, unit === 'titan' ? owned(state, 'titan', unitsAway) : 0);
  if (!check.ok) return { ok: false, error: check.reason };
  const sameBuilding = state.training.filter((j) => j.building === def.trainedAt);
  if (sameBuilding.length >= MAX_TRAIN_JOBS) return { ok: false, error: 'queue_full' };
  if (supplyUsed(state, unitsAway) + qty * def.supply > supplyCap(state.levels.habitat)) return { ok: false, error: 'not_enough_supply' };
  const s = cloneBase(state);
  if (!pay(s, scaleResources(def.cost, qty))) return { ok: false, error: 'not_enough_resources' };
  const startsAt = Math.max(now, ...sameBuilding.map(jobEndsAt));
  const job: TrainJob = {
    id, building: def.trainedAt, unit, qty, done: 0, startsAt,
    unitMs: trainSeconds(unit, state.levels[def.trainedAt]) * 1000,
  };
  s.training.push(job);
  return { ok: true, state: s, job };
}

/**
 * Cancels the rest of a training batch: units not yet started are refunded in full, the unit in progress
 * at half. Later batches in the same building move up.
 */
export function cancelTraining(state: BaseState, jobId: string, now: number): ActionResult<{ refund: Resources }> {
  const job = state.training.find((j) => j.id === jobId);
  if (!job) return { ok: false, error: 'not_found' };
  const s = cloneBase(state);
  const remaining = job.qty - job.done;
  const inProgress = now >= job.startsAt ? 1 : 0;
  const cost = UNITS[job.unit].cost;
  const refund = addResources(scaleResources(cost, remaining - inProgress), scaleResources(cost, inProgress * IN_PROGRESS_REFUND));
  for (const r of RESOURCES) refund[r] = Math.floor(refund[r]);
  s.resources = addResources(s.resources, refund);
  s.training = s.training.filter((j) => j.id !== jobId);
  // Re-chain the building's queue so nothing waits on the cancelled batch. A batch already under way keeps its times.
  let cursor = now;
  for (const j of s.training.filter((x) => x.building === job.building).sort((a, b) => a.startsAt - b.startsAt)) {
    if (j.done === 0 && j.startsAt > cursor) j.startsAt = cursor;
    cursor = Math.max(cursor, jobEndsAt(j));
  }
  return { ok: true, state: s, refund };
}

/** Takes units out of the base to send them somewhere. */
export function dispatchUnits(state: BaseState, units: Army): ActionResult {
  const s = cloneBase(state);
  let total = 0;
  for (const key of UNIT_KEYS) {
    const n = units[key] ?? 0;
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'bad_quantity' };
    if (n > (s.units[key] ?? 0)) return { ok: false, error: 'not_enough_units' };
    s.units[key] = (s.units[key] ?? 0) - n;
    if (s.units[key] === 0) delete s.units[key];
    total += n;
  }
  if (total === 0) return { ok: false, error: 'bad_quantity' };
  return { ok: true, state: s };
}

export const ZERO_LOOT = res();
