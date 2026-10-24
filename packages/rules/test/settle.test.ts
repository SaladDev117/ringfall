import { describe, expect, it } from 'vitest';
import {
  cancelBuild, cancelTraining, currentRates, dispatchUnits, finishTraining, queueTraining, res, resolveNestRaid, resolveRaid,
  resolveScout, settleBase, startBuild, startingLevels, upgradeCost, upgradeSeconds, nestGarrison, type BaseState,
} from '../src';

const T0 = Date.UTC(2026, 9, 1);
const MIN = 60_000;
const HOUR = 3_600_000;

const base = (o: Partial<BaseState> = {}): BaseState => ({
  resources: res(1000, 600, 0),
  resourcesAt: T0,
  levels: startingLevels(),
  units: { trooper: 5 },
  builds: [],
  training: [],
  joinedAt: T0 - 30 * 24 * HOUR, // past the Frontier Boost
  seasonDayAtJoin: 0,
  ...o,
});

describe('settleBase', () => {
  it('accrues resources at the current rate', () => {
    const s = base();
    const rates = currentRates(s);
    const { state } = settleBase(s, T0 + HOUR);
    expect(state.resources.alloy).toBeCloseTo(1000 + rates.alloy);
    expect(state.resources.plasma).toBeCloseTo(600 + rates.plasma);
    expect(state.resourcesAt).toBe(T0 + HOUR);
  });

  it('never goes backwards', () => {
    const { state } = settleBase(base({ resourcesAt: T0 + HOUR }), T0);
    expect(state.resourcesAt).toBe(T0 + HOUR);
    expect(state.resources.alloy).toBe(1000);
  });

  it('finishes a build and produces at the new level from that moment', () => {
    const started = startBuild(base(), 'commandCenter', T0, 'b1');
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const levels = { ...started.state.levels, commandCenter: 2 };
    const upgrade = startBuild({ ...started.state, levels, builds: [] }, 'alloyExtractor', T0, 'b2');
    if (!upgrade.ok) throw new Error(upgrade.error);
    const done = upgrade.job.endsAt;
    const before = currentRates(upgrade.state).alloy;
    const { state, events } = settleBase(upgrade.state, done + HOUR);
    expect(state.levels.alloyExtractor).toBe(2);
    expect(events).toContainEqual({ kind: 'build_done', at: done, jobId: 'b2', type: 'alloyExtractor', level: 2 });
    const after = currentRates(state).alloy;
    expect(after).toBeGreaterThan(before);
    const expected = upgrade.state.resources.alloy + (before * (done - T0)) / HOUR + after;
    expect(state.resources.alloy).toBeCloseTo(expected, 6);
  });

  it('stops production at the storage cap but keeps loot above it', () => {
    const { state } = settleBase(base({ resources: res(4990, 0, 0) }), T0 + 24 * HOUR, [
      { id: 'a1', units: { trooper: 3 }, loot: res(2000, 0, 0), returnsAt: T0 + 48 * HOUR },
    ]);
    expect(state.resources.alloy).toBe(5000);
    const later = settleBase(state, T0 + 72 * HOUR, [
      { id: 'a1', units: { trooper: 3 }, loot: res(2000, 0, 0), returnsAt: T0 + 48 * HOUR },
    ]);
    expect(later.state.resources.alloy).toBe(7000);
    expect(later.state.units.trooper).toBe(8);
    expect(later.returned).toEqual(['a1']);
  });

  it('applies the Frontier Boost only for the first week', () => {
    const fresh = base({ joinedAt: T0, seasonDayAtJoin: 50 });
    expect(currentRates(fresh).alloy).toBeCloseTo(currentRates(base()).alloy * 1.5);
    const { state } = settleBase(fresh, T0 + 8 * 24 * HOUR);
    expect(currentRates(state).alloy).toBeCloseTo(currentRates(base()).alloy);
  });
});

describe('building actions', () => {
  it('charges the cost and refunds it on cancel', () => {
    const r = startBuild(base(), 'commandCenter', T0, 'b1');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.resources.alloy).toBe(1000 - upgradeCost('commandCenter', 2).alloy);
    expect(r.job.endsAt).toBe(T0 + upgradeSeconds('commandCenter', 2) * 1000);
    const c = cancelBuild(r.state, 'b1');
    if (!c.ok) throw new Error(c.error);
    expect(c.state.resources).toEqual(res(1000, 600, 0));
    expect(c.state.builds).toEqual([]);
  });

  it('enforces the rules', () => {
    expect(startBuild(base(), 'alloyExtractor', T0, 'x')).toEqual({ ok: false, error: 'needs_command_center' });
    expect(startBuild(base({ resources: res() }), 'commandCenter', T0, 'x')).toEqual({ ok: false, error: 'not_enough_resources' });
    const busy = startBuild(base(), 'commandCenter', T0, 'b1');
    if (!busy.ok) throw new Error(busy.error);
    expect(startBuild(busy.state, 'commandCenter', T0, 'x')).toEqual({ ok: false, error: 'already_upgrading' });
    const cc2 = { ...busy.state, levels: { ...busy.state.levels, commandCenter: 2 } };
    expect(startBuild(cc2, 'depot', T0, 'x')).toEqual({ ok: false, error: 'no_free_builder' });
  });
});

describe('training', () => {
  it('trains units one after another and adds them as they finish', () => {
    const r = queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 3, T0, 't1');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.resources.alloy).toBe(10_000 - 3 * 60);
    const mid = settleBase(r.state, T0 + 7 * MIN);
    expect(mid.state.units.trooper).toBe(7);
    expect(mid.events).toEqual([]);
    const end = settleBase(mid.state, T0 + 9 * MIN);
    expect(end.state.units.trooper).toBe(8);
    expect(end.state.training).toEqual([]);
    expect(end.events).toEqual([{ kind: 'train_done', at: T0 + 9 * MIN, jobId: 't1', unit: 'trooper', qty: 3 }]);
  });

  it('queues batches in the same building back to back', () => {
    const a = queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 2, T0, 't1');
    if (!a.ok) throw new Error(a.error);
    const b = queueTraining(a.state, 'trooper', 1, T0, 't2');
    if (!b.ok) throw new Error(b.error);
    expect(b.job.startsAt).toBe(T0 + 6 * MIN);
  });

  it('checks supply including units away and queued', () => {
    // Habitat L1 = 25 supply; 5 troopers at home.
    expect(queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 20, T0, 't').ok).toBe(true);
    expect(queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 21, T0, 't')).toEqual({ ok: false, error: 'not_enough_supply' });
    expect(queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 15, T0, 't', { trooper: 6 })).toEqual({ ok: false, error: 'not_enough_supply' });
  });

  it('refunds unstarted units fully and the one in progress by half', () => {
    const a = queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 4, T0, 't1');
    if (!a.ok) throw new Error(a.error);
    const b = queueTraining(a.state, 'trooper', 2, T0, 't2');
    if (!b.ok) throw new Error(b.error);
    const settled = settleBase(b.state, T0 + 4 * MIN).state; // 1 done, 2nd in progress
    const c = cancelTraining(settled, 't1', T0 + 4 * MIN);
    if (!c.ok) throw new Error(c.error);
    expect(c.refund).toEqual(res(2 * 60 + 30, 2 * 20 + 10, 0));
    expect(c.state.training).toHaveLength(1);
    expect(c.state.training[0]!.startsAt).toBe(T0 + 4 * MIN);
    expect(c.state.units.trooper).toBe(6);
  });

  it('needs the right building', () => {
    expect(queueTraining(base({ resources: res(10_000, 10_000) }), 'rattler', 1, T0, 't')).toEqual({ ok: false, error: 'missing_building' });
  });

  it('finishes the rest of a batch at once and moves the next batch up', () => {
    const a = queueTraining(base({ resources: res(10_000, 10_000) }), 'trooper', 5, T0, 't1');
    if (!a.ok) throw new Error(a.error);
    const b = queueTraining(a.state, 'trooper', 2, T0, 't2');
    if (!b.ok) throw new Error(b.error);
    const settled = settleBase(b.state, T0 + 4 * MIN).state; // 1 of 5 done
    const f = finishTraining(settled, 't1', T0 + 4 * MIN);
    if (!f.ok) throw new Error(f.error);
    expect(f.qty).toBe(4);
    expect(f.state.units.trooper).toBe(10);
    expect(f.state.training.map((t) => [t.id, t.startsAt])).toEqual([['t2', T0 + 4 * MIN]]);
    expect(finishTraining(settled, 'nope', T0)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('dispatchUnits', () => {
  it('removes units from home', () => {
    const r = dispatchUnits(base(), { trooper: 3 });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.units).toEqual({ trooper: 2 });
    expect(dispatchUnits(base(), { trooper: 6 })).toEqual({ ok: false, error: 'not_enough_units' });
    expect(dispatchUnits(base(), {})).toEqual({ ok: false, error: 'bad_quantity' });
  });
});

describe('arrivals', () => {
  it('a winning raid takes loot, the defender gets salvage', () => {
    const defender = base({ resources: res(20_000, 10_000, 0), units: { trooper: 2 } });
    const r = resolveRaid(defender, { trooper: 40, mule: 10 }, 'seed');
    expect(r.battle.outcome).toBe('attacker');
    expect(r.loot.alloy).toBe(Math.floor((20_000 - 0) * 0.2)); // no Vault
    expect(r.defender.resources.alloy).toBe(20_000 - r.loot.alloy + r.salvage);
    expect(r.defender.units.trooper ?? 0).toBe(0);
    expect(r.survivors.mule).toBe(10);
  });

  it('a failed raid takes nothing', () => {
    const r = resolveRaid(base({ units: { trooper: 200 } }), { trooper: 5 }, 'seed');
    expect(r.battle.outcome).toBe('defender');
    expect(r.loot).toEqual(res());
    expect(r.salvage).toBe(Math.floor(5 * 60 * 0.2));
  });

  it('scouts need to outnumber the Sensor Array', () => {
    const target = base({ levels: { ...startingLevels(), sensorArray: 2 } });
    expect(resolveScout(target, 4)).toEqual({ success: false, intel: null, survivors: {} });
    const ok = resolveScout(target, 5);
    expect(ok.success).toBe(true);
    expect(ok.intel?.resources).toEqual(res(1000, 600, 0));
    expect(ok.survivors).toEqual({ wisp: 5 });
  });

  it('a nest only pays out when cleared', () => {
    const win = resolveNestRaid(1, nestGarrison(1), { trooper: 30 }, 's');
    expect(win.cleared).toBe(true);
    expect(win.loot.alloy + win.loot.plasma).toBe(Math.min(1000, 25 * (30 - (win.battle.attacker.lost.trooper ?? 0))));
    const loss = resolveNestRaid(5, nestGarrison(5), { trooper: 5 }, 's');
    expect(loss.cleared).toBe(false);
    expect(loss.loot).toEqual(res());
  });
});
