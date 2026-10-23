import * as R from '@ringfall/rules';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database, Tx } from './db.js';
import {
  armies, bases, nests, notifications, reports, users, type ArmyMission, type ReportData, type ReportKind,
} from './schema.js';
import { pendingRequestCount, sharedReportSide, unreadMessageCount } from './social.js';
import { activeSeason, respawnNest, spawnBase, type Season } from './world.js';

const HOUR = 3600_000;
/** Serialises arrival processing so armies resolve in the order they arrive, across every base. */
const ARRIVALS_LOCK = 7001001;

export class GameError extends Error {
  constructor(readonly code: string, readonly status = 400, message?: string) {
    super(message ?? code);
  }
}

export type BaseRow = typeof bases.$inferSelect;
type ArmyRow = typeof armies.$inferSelect;

// ── Base state <-> rows ───────────────────────────────────────────────────────

export function toState(row: BaseRow): R.BaseState {
  const levels = Object.fromEntries(R.BUILDING_TYPES.map((t) => [t, row.levels[t] ?? 0])) as R.BuildingLevels;
  return {
    resources: row.resources,
    resourcesAt: row.resourcesAt.getTime(),
    levels,
    units: row.units,
    builds: row.builds,
    training: row.training,
    joinedAt: row.joinedAt.getTime(),
    seasonDayAtJoin: row.seasonDayAtJoin,
  };
}

function nextEventAt(s: R.BaseState): Date | null {
  const times = [...s.builds.map((b) => b.endsAt), ...s.training.map(R.jobEndsAt)];
  return times.length ? new Date(Math.min(...times)) : null;
}

function addArmies(a: R.Army, b: R.Army): R.Army {
  const out: R.Army = { ...a };
  for (const key of R.UNIT_KEYS) if (b[key]) out[key] = (out[key] ?? 0) + b[key]!;
  return out;
}

/** Units in armies that haven't come home yet. */
export async function unitsAway(tx: Tx, baseId: string): Promise<R.Army> {
  const rows = await tx.select({ status: armies.status, units: armies.units, survivors: armies.survivors }).from(armies)
    .where(and(eq(armies.ownerBaseId, baseId), inArray(armies.status, ['outbound', 'returning'])));
  return rows.reduce<R.Army>((sum, a) => addArmies(sum, a.status === 'outbound' ? a.units : a.survivors ?? {}), {});
}

async function saveBase(tx: Tx, baseId: string, s: R.BaseState, extra: Partial<BaseRow> = {}): Promise<number> {
  const power = R.power(s.levels, addArmies(s.units, await unitsAway(tx, baseId)));
  await tx.update(bases).set({
    resources: s.resources, resourcesAt: new Date(s.resourcesAt), levels: s.levels, units: s.units,
    builds: s.builds, training: s.training, nextEventAt: nextEventAt(s), power, ...extra,
  }).where(eq(bases.id, baseId));
  return power;
}

const plural = (n: number, name: string) => `${n}× ${name}`;

async function notifyEvents(tx: Tx, userId: string, events: R.SettleEvent[]): Promise<void> {
  const rows: (typeof notifications.$inferInsert)[] = [];
  for (const e of events) {
    if (e.kind === 'build_done') {
      rows.push({ userId, kind: 'build_done', title: 'Construction complete', body: `⚒ ${R.BUILDINGS[e.type].name} reached level ${e.level}.`, sendAt: new Date(e.at) });
    } else if (e.kind === 'train_done') {
      rows.push({ userId, kind: 'train_done', title: 'Training complete', body: `⚙ ${plural(e.qty, R.UNITS[e.unit].name)} ready.`, sendAt: new Date(e.at) });
    }
  }
  if (rows.length) await tx.insert(notifications).values(rows);
}

/** Settles a locked base row up to `until`, bringing home any armies due back. */
async function settleLocked(tx: Tx, row: BaseRow, until: number): Promise<R.BaseState> {
  const due = await tx.select().from(armies)
    .where(and(eq(armies.ownerBaseId, row.id), eq(armies.status, 'returning'), lte(armies.returnsAt, new Date(until))))
    .for('update');
  const { state, events, returned } = R.settleBase(toState(row), until, due.map((a) => ({
    id: a.id, units: a.survivors ?? {}, loot: a.loot, returnsAt: a.returnsAt!.getTime(),
  })));
  if (returned.length) await tx.update(armies).set({ status: 'done' }).where(inArray(armies.id, returned));
  await notifyEvents(tx, row.userId, events);
  return state;
}

async function lockBase(tx: Tx, baseId: string): Promise<BaseRow | undefined> {
  const [row] = await tx.select().from(bases).where(eq(bases.id, baseId)).for('update');
  return row;
}

// ── Running an action against the player's own base ───────────────────────────

export interface BaseContext {
  tx: Tx;
  row: BaseRow;
  state: R.BaseState;
  now: number;
  season: Season;
}

export interface ActionOutcome<T> {
  /** The base after the action (unchanged for reads). */
  state: R.BaseState;
  extra?: Partial<BaseRow>;
  result: T;
}

/**
 * Resolves due arrivals, then locks the player's base, settles it to now, runs `fn`, and saves the base,
 * all in one transaction. A player without a base this season gets one.
 */
export async function withMyBase<T>(db: Database, userId: string, fn: (ctx: BaseContext) => Promise<ActionOutcome<T>>): Promise<T> {
  await processDueArrivals(db, Date.now());
  return db.transaction(async (tx) => {
    const season = await activeSeason(tx);
    let [row] = await tx.select().from(bases).where(and(eq(bases.userId, userId), eq(bases.seasonId, season.id))).for('update');
    if (!row) {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new GameError('no_user', 401);
      row = await spawnBase(tx, { season, userId, username: user.username, now: Date.now() });
    }
    const now = Math.max(Date.now(), row.resourcesAt.getTime());
    const state = await settleLocked(tx, row, now);
    const out = await fn({ tx, row, state, now, season });
    const power = await saveBase(tx, row.id, out.state, out.extra);
    Object.assign(row, out.extra, { power });
    return out.result;
  });
}

function fail(error: R.ActionError | string, status = 400): never {
  throw new GameError(error, status);
}

// ── Views ─────────────────────────────────────────────────────────────────────

function protectionUntil(row: BaseRow, state: R.BaseState, now: number): number | null {
  const commander = toCommander(row, state);
  return R.hasBeginnerProtection(commander, now) ? commander.joinedAt + R.BEGINNER_PROTECTION_MS : null;
}

function toCommander(row: BaseRow, state?: R.BaseState): R.Commander {
  return {
    power: row.power,
    ccLevel: (state?.levels ?? row.levels).commandCenter,
    joinedAt: row.joinedAt.getTime(),
    protectionBroken: row.protectionBroken,
    shieldUntil: row.shieldUntil?.getTime() ?? 0,
  };
}

/** Rounds to two significant figures, for "approximately N troops" warnings. */
const approx = (n: number) => (n < 10 ? n : Number(n.toPrecision(2)));

export async function baseView(ctx: BaseContext) {
  const { tx, row, state, now } = ctx;
  const away = await unitsAway(tx, row.id);
  const mine = await tx.select().from(armies)
    .where(and(eq(armies.ownerBaseId, row.id), inArray(armies.status, ['outbound', 'returning'])))
    .orderBy(asc(armies.departsAt));
  const targetNames = await namesFor(tx, mine);
  const incomingRows = await tx.select({ army: armies, attacker: users.username }).from(armies)
    .innerJoin(bases, eq(bases.id, armies.ownerBaseId)).innerJoin(users, eq(users.id, bases.userId))
    .where(and(eq(armies.targetBaseId, row.id), eq(armies.status, 'outbound'), eq(armies.mission, 'raid')))
    .orderBy(asc(armies.arrivesAt));
  const tier = R.warningTier(state.levels.sensorArray);
  const incoming = incomingRows
    .filter(({ army }) => now >= R.warningAt(army.departsAt.getTime(), army.arrivesAt.getTime(), state.levels.sensorArray))
    .map(({ army, attacker }) => ({
      id: army.id,
      attacker,
      arrivesAt: army.arrivesAt.getTime(),
      approxCount: tier === 'count' || tier === 'types' ? approx(R.armySize(army.units)) : null,
      units: tier === 'types' ? army.units : null,
    }));
  const [{ unread }] = (await tx.select({ unread: sql<number>`count(*)::int` }).from(reports).where(or(
    and(eq(reports.attackerUserId, row.userId), eq(reports.attackerSeen, false)),
    and(eq(reports.defenderUserId, row.userId), eq(reports.defenderSeen, false)),
  ))) as [{ unread: number }];

  return {
    id: row.id,
    name: row.name,
    x: row.x,
    y: row.y,
    sector: row.sector,
    sectorName: R.sectorName(row.sector),
    coords: R.formatCoords(row),
    serverTime: now,
    resources: state.resources,
    resourcesAt: state.resourcesAt,
    rates: R.currentRates(state, now),
    caps: R.storageCap(state),
    protected: R.vaultProtection(state.levels.vault),
    levels: state.levels,
    builds: state.builds,
    builderSlots: R.builderSlots(state.levels.commandCenter),
    training: state.training,
    units: state.units,
    unitsAway: away,
    supply: { used: R.supplyUsed(state, away), cap: R.supplyCap(state.levels.habitat) },
    power: R.power(state.levels, addArmies(state.units, away)),
    shieldUntil: row.shieldUntil && row.shieldUntil.getTime() > now ? row.shieldUntil.getTime() : null,
    protectionUntil: protectionUntil(row, state, now),
    armies: mine.map((a) => ({
      id: a.id,
      mission: a.mission,
      status: a.status,
      target: targetNames.get(a.id) ?? 'Unknown',
      targetCoords: R.formatCoords({ x: a.targetX, y: a.targetY }),
      units: a.status === 'outbound' ? a.units : a.survivors ?? {},
      loot: a.loot,
      departsAt: a.departsAt.getTime(),
      arrivesAt: a.arrivesAt.getTime(),
      returnsAt: a.returnsAt?.getTime() ?? null,
    })),
    maxArmiesOut: R.maxArmiesOut(state.levels.commandCenter),
    incoming,
    unreadReports: unread,
    social: { friendRequests: await pendingRequestCount(tx, row.userId), unreadMessages: await unreadMessageCount(tx, row.userId) },
  };
}

export type BaseView = Awaited<ReturnType<typeof baseView>>;

async function namesFor(tx: Tx, list: ArmyRow[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const baseIds = list.map((a) => a.targetBaseId).filter((x): x is string => !!x);
  const nestIds = list.map((a) => a.targetNestId).filter((x): x is string => !!x);
  const baseNames = baseIds.length
    ? await tx.select({ id: bases.id, name: bases.name }).from(bases).where(inArray(bases.id, baseIds)) : [];
  const nestLevels = nestIds.length
    ? await tx.select({ id: nests.id, level: nests.level }).from(nests).where(inArray(nests.id, nestIds)) : [];
  for (const a of list) {
    if (a.targetBaseId) names.set(a.id, baseNames.find((b) => b.id === a.targetBaseId)?.name ?? 'Unknown base');
    if (a.targetNestId) names.set(a.id, `Blight Nest L${nestLevels.find((n) => n.id === a.targetNestId)?.level ?? '?'}`);
  }
  return names;
}

// ── Building and training ─────────────────────────────────────────────────────

export function startBuild(db: Database, userId: string, type: R.BuildingType) {
  return withMyBase(db, userId, async (ctx) => {
    const r = R.startBuild(ctx.state, type, ctx.now, crypto.randomUUID());
    if (!r.ok) fail(r.error);
    return { state: r.state, result: r.job };
  });
}

export function cancelBuild(db: Database, userId: string, jobId: string) {
  return withMyBase(db, userId, async (ctx) => {
    const r = R.cancelBuild(ctx.state, jobId);
    if (!r.ok) fail(r.error, 404);
    return { state: r.state, result: { ok: true } };
  });
}

export function queueTraining(db: Database, userId: string, unit: R.UnitKey, qty: number) {
  return withMyBase(db, userId, async (ctx) => {
    const r = R.queueTraining(ctx.state, unit, qty, ctx.now, crypto.randomUUID(), await unitsAway(ctx.tx, ctx.row.id));
    if (!r.ok) fail(r.error);
    return { state: r.state, result: r.job };
  });
}

export function cancelTraining(db: Database, userId: string, jobId: string) {
  return withMyBase(db, userId, async (ctx) => {
    const r = R.cancelTraining(ctx.state, jobId, ctx.now);
    if (!r.ok) fail(r.error, 404);
    return { state: r.state, result: { refund: r.refund } };
  });
}

export function renameBase(db: Database, userId: string, name: string) {
  return withMyBase(db, userId, async (ctx) => ({ state: ctx.state, extra: { name }, result: { name } }));
}

// ── Armies ────────────────────────────────────────────────────────────────────

export interface LaunchRequest {
  target: { kind: 'base' | 'nest'; id: string };
  mission: ArmyMission;
  units: R.Army;
}

function cleanArmy(units: R.Army): R.Army {
  const out: R.Army = {};
  for (const [key, n] of Object.entries(units)) {
    if (!R.isUnitKey(key)) fail('bad_unit');
    if (!Number.isInteger(n) || n! < 0) fail('bad_quantity');
    if (n) out[key] = n;
  }
  return out;
}

export function launchArmy(db: Database, userId: string, req: LaunchRequest) {
  return withMyBase(db, userId, async ({ tx, row, state, now, season }) => {
    const units = cleanArmy(req.units);
    if (req.mission === 'scout' && (Object.keys(units).some((k) => k !== 'wisp') || !units.wisp)) fail('scouts_only_wisps');
    const [{ out }] = (await tx.select({ out: sql<number>`count(*)::int` }).from(armies)
      .where(and(eq(armies.ownerBaseId, row.id), inArray(armies.status, ['outbound', 'returning'])))) as [{ out: number }];
    if (out >= R.maxArmiesOut(state.levels.commandCenter)) fail('too_many_armies');

    const extra: Partial<BaseRow> = {};
    let target: R.Point;
    let defender: BaseRow | undefined;
    if (req.target.kind === 'base') {
      [defender] = await tx.select().from(bases).where(and(eq(bases.id, req.target.id), eq(bases.seasonId, season.id)));
      if (!defender) fail('target_not_found', 404);
      if (defender.id === row.id) fail('cannot_attack_self');
      target = defender;
      if (req.mission === 'raid') {
        const verdict = R.checkAttack({
          now,
          attacker: toCommander(row, state),
          target: toCommander(defender),
          attackerArmiesOut: out,
          recentAttacksOnTarget: await countRaids(tx, row.id, defender.id, now - R.REPEAT_WINDOW_MS),
          isRevenge: (await countRaids(tx, defender.id, row.id, now - R.REVENGE_WINDOW_MS)) > 0,
        });
        if (!verdict.ok) fail(verdict.reason);
        if (verdict.endsOwnProtection) extra.protectionBroken = true;
        if (verdict.endsOwnShield) extra.shieldUntil = null;
      }
    } else {
      if (req.mission !== 'raid') fail('nests_cannot_be_scouted');
      const [nest] = await tx.select().from(nests).where(and(
        eq(nests.id, req.target.id), eq(nests.seasonId, season.id), isNull(nests.clearedAt), lte(nests.activeAt, new Date(now)),
      ));
      if (!nest) fail('target_not_found', 404);
      target = nest;
    }

    const sent = R.dispatchUnits(state, units);
    if (!sent.ok) fail(sent.error);
    const arrivesAt = now + R.travelSeconds(row, target, units) * 1000;
    const [army] = await tx.insert(armies).values({
      seasonId: season.id, ownerBaseId: row.id, mission: req.mission, units,
      targetBaseId: req.target.kind === 'base' ? req.target.id : null,
      targetNestId: req.target.kind === 'nest' ? req.target.id : null,
      originX: row.x, originY: row.y, targetX: target.x, targetY: target.y,
      departsAt: new Date(now), arrivesAt: new Date(arrivesAt),
    }).returning();

    if (defender && req.mission === 'raid') {
      const [attacker] = await tx.select({ name: users.username }).from(users).where(eq(users.id, userId));
      await tx.insert(notifications).values({
        userId: defender.userId, kind: 'incoming_attack', ref: army!.id,
        title: 'Incoming attack!',
        body: `⚠ ${attacker?.name ?? 'Someone'} is attacking ${defender.name}! Arrives ${new Date(arrivesAt).toISOString()}.`,
        sendAt: new Date(R.warningAt(now, arrivesAt, defender.levels.sensorArray ?? 0)),
      });
    }
    return { state: sent.state, extra, result: { id: army!.id, arrivesAt } };
  });
}

async function countRaids(tx: Tx, fromBase: string, toBase: string, since: number): Promise<number> {
  const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(armies).where(and(
    eq(armies.ownerBaseId, fromBase), eq(armies.targetBaseId, toBase), eq(armies.mission, 'raid'),
    gte(armies.departsAt, new Date(since)), isNull(armies.recalledAt),
  ))) as [{ n: number }];
  return n;
}

/** Turns an army around before it arrives. It takes as long to get home as it has spent travelling. */
export function recallArmy(db: Database, userId: string, armyId: string) {
  return withMyBase(db, userId, async ({ tx, row, state, now }) => {
    const [army] = await tx.select().from(armies)
      .where(and(eq(armies.id, armyId), eq(armies.ownerBaseId, row.id))).for('update');
    if (!army) fail('not_found', 404);
    if (army.status !== 'outbound' || army.arrivesAt.getTime() <= now) fail('already_arrived');
    const returnsAt = now + (now - army.departsAt.getTime());
    await tx.update(armies).set({ status: 'returning', survivors: army.units, returnsAt: new Date(returnsAt), recalledAt: new Date(now) })
      .where(eq(armies.id, army.id));
    await tx.delete(notifications).where(and(eq(notifications.ref, army.id), isNull(notifications.sentAt)));
    return { state, result: { returnsAt } };
  });
}

// ── Arrivals ──────────────────────────────────────────────────────────────────

/**
 * Resolves every army that has arrived by `now`, oldest first, one transaction each. Battles must run in
 * arrival order because each one changes the bases involved.
 */
export async function processDueArrivals(db: Database, now: number): Promise<number> {
  let processed = 0;
  const dueWhere = and(eq(armies.status, 'outbound'), lte(armies.arrivesAt, new Date(now)));
  while (processed < 500) {
    const [any] = await db.select({ id: armies.id }).from(armies).where(dueWhere).limit(1);
    if (!any) break;
    let failedId: string | null = null;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${ARRIVALS_LOCK})`);
        const [army] = await tx.select().from(armies).where(dueWhere)
          .orderBy(asc(armies.arrivesAt), asc(armies.id)).limit(1).for('update');
        if (!army) return;
        failedId = army.id;
        await resolveArrival(tx, army);
        failedId = null;
      });
    } catch (err) {
      if (!failedId) throw err;
      // Never let one bad arrival block every other battle: send that army home untouched.
      console.error(`Arrival ${failedId} failed; sending it home`, err);
      await db.update(armies).set({
        status: 'returning', survivors: sql`${armies.units}`,
        returnsAt: sql`${armies.arrivesAt} + (${armies.arrivesAt} - ${armies.departsAt})`,
      }).where(eq(armies.id, failedId));
    }
    processed++;
  }
  return processed;
}

async function usernameOf(tx: Tx, baseId: string): Promise<{ name: string; userId: string | null }> {
  const [row] = await tx.select({ name: users.username, userId: users.id }).from(bases)
    .innerJoin(users, eq(users.id, bases.userId)).where(eq(bases.id, baseId));
  return row ?? { name: 'Unknown', userId: null };
}

async function sendHome(tx: Tx, army: ArmyRow, at: number, survivors: R.Army, loot: R.Resources, reportId: string | null) {
  const anyone = R.armySize(survivors) > 0;
  const returnsAt = anyone
    ? at + R.travelSeconds({ x: army.targetX, y: army.targetY }, { x: army.originX, y: army.originY }, survivors) * 1000
    : at;
  await tx.update(armies).set({
    status: anyone ? 'returning' : 'done', survivors, loot: anyone ? loot : R.res(), returnsAt: new Date(returnsAt), reportId,
  }).where(eq(armies.id, army.id));
}

async function writeReport(tx: Tx, r: {
  seasonId: number; kind: ReportKind; at: number; outcome: string; attackerUserId: string | null;
  defenderUserId: string | null; data: ReportData;
}): Promise<string> {
  const [row] = await tx.insert(reports).values({ ...r, at: new Date(r.at) }).returning({ id: reports.id });
  return row!.id;
}

async function resolveArrival(tx: Tx, army: ArmyRow): Promise<void> {
  const at = army.arrivesAt.getTime();
  const attacker = await usernameOf(tx, army.ownerBaseId);
  const coords = R.formatCoords({ x: army.targetX, y: army.targetY });

  if (army.targetNestId) {
    const [nest] = await tx.select().from(nests).where(eq(nests.id, army.targetNestId)).for('update');
    const base = { seasonId: army.seasonId, kind: 'nest' as const, at, attackerUserId: attacker.userId, defenderUserId: null };
    if (!nest || nest.clearedAt) {
      const reportId = await writeReport(tx, {
        ...base, outcome: 'bounced',
        data: { attackerName: attacker.name, defenderName: 'the Blight', targetName: 'Blight Nest', coords, bounced: 'nest_cleared' },
      });
      return sendHome(tx, army, at, army.units, R.res(), reportId);
    }
    const garrison = R.regrowNest(nest.garrison, nest.level, (at - nest.garrisonAt.getTime()) / HOUR);
    const out = R.resolveNestRaid(nest.level, garrison, army.units, army.id);
    await tx.update(nests).set({ garrison: out.garrisonLeft, garrisonAt: new Date(at), clearedAt: out.cleared ? new Date(at) : null })
      .where(eq(nests.id, nest.id));
    if (out.cleared) await respawnNest(tx, nest.seasonId, nest.sector, at);
    const reportId = await writeReport(tx, {
      ...base, outcome: out.battle.outcome,
      data: {
        attackerName: attacker.name, defenderName: 'the Blight', targetName: `Blight Nest L${nest.level}`, coords,
        battle: out.battle, loot: out.loot, carry: R.armyCarry(out.survivors),
      },
    });
    return sendHome(tx, army, at, out.survivors, out.loot, reportId);
  }

  const row = army.targetBaseId ? await lockBase(tx, army.targetBaseId) : undefined;
  if (!row) return sendHome(tx, army, at, army.units, R.res(), null); // the target's account was deleted
  const defenderName = (await usernameOf(tx, row.id)).name;
  const defender = await settleLocked(tx, row, at);
  const names = { attackerName: attacker.name, defenderName, targetName: row.name, coords };

  if (army.mission === 'scout') {
    const out = R.resolveScout(defender, army.units.wisp ?? 0);
    await saveBase(tx, row.id, defender);
    const reportId = await writeReport(tx, {
      seasonId: army.seasonId, kind: 'scout', at, outcome: out.success ? 'success' : 'failed',
      attackerUserId: attacker.userId,
      defenderUserId: R.notifiedOfScout(defender.levels.sensorArray) ? row.userId : null,
      data: { ...names, intel: out.intel },
    });
    return sendHome(tx, army, at, out.survivors, R.res(), reportId);
  }

  if (row.shieldUntil && row.shieldUntil.getTime() > at) {
    await saveBase(tx, row.id, defender);
    const reportId = await writeReport(tx, {
      seasonId: army.seasonId, kind: 'raid', at, outcome: 'bounced', attackerUserId: attacker.userId, defenderUserId: null,
      data: { ...names, bounced: 'shielded' },
    });
    return sendHome(tx, army, at, army.units, R.res(), reportId);
  }

  const out = R.resolveRaid(defender, army.units, army.id);
  await saveBase(tx, row.id, out.defender, out.battle.outcome === 'attacker' ? { shieldUntil: new Date(at + R.SHIELD_MS) } : {});
  const reportId = await writeReport(tx, {
    seasonId: army.seasonId, kind: 'raid', at, outcome: out.battle.outcome, attackerUserId: attacker.userId, defenderUserId: row.userId,
    data: {
      ...names, battle: out.battle, loot: out.loot, carry: R.armyCarry(out.survivors), repaired: out.repaired, salvage: out.salvage,
    },
  });
  return sendHome(tx, army, at, out.survivors, out.loot, reportId);
}

// ── Map ───────────────────────────────────────────────────────────────────────

/** Sectors a base can see: its own, plus neighbours with a better Sensor Array. */
export function visibleSectors(sector: number, sensorLevel: number): number[] {
  const reach = sensorLevel >= 10 ? 2 : sensorLevel >= 5 ? 1 : 0;
  const out: number[] = [];
  for (let d = -reach; d <= reach; d++) out.push((sector + d + R.SECTOR_COUNT) % R.SECTOR_COUNT);
  return out;
}

function powerBand(mine: number, theirs: number): 'weaker' | 'even' | 'stronger' {
  if (theirs < mine * 0.67) return 'weaker';
  if (theirs > mine * 1.5) return 'stronger';
  return 'even';
}

export function nearby(db: Database, userId: string) {
  return withMyBase(db, userId, async ({ tx, row, state, now, season }) => {
    const sectors = visibleSectors(row.sector, state.levels.sensorArray);
    const others = await tx.select({ base: bases, owner: users.username }).from(bases)
      .innerJoin(users, eq(users.id, bases.userId))
      .where(and(eq(bases.seasonId, season.id), inArray(bases.sector, sectors)));
    const nestRows = await tx.select().from(nests).where(and(
      eq(nests.seasonId, season.id), inArray(nests.sector, sectors), isNull(nests.clearedAt), lte(nests.activeAt, new Date(now)),
    ));
    const me = toCommander(row, state);
    const places = [
      ...others.map(({ base, owner }) => {
        const verdict = base.id === row.id ? null : R.checkAttack({
          now, attacker: me, target: toCommander(base), attackerArmiesOut: 0, recentAttacksOnTarget: 0, isRevenge: false,
        });
        return {
          kind: 'base' as const,
          id: base.id,
          name: base.name,
          owner,
          isMe: base.id === row.id,
          x: base.x, y: base.y, coords: R.formatCoords(base), distance: R.distance(row, base),
          powerBand: powerBand(row.power, base.power),
          shielded: !!base.shieldUntil && base.shieldUntil.getTime() > now,
          protected: R.hasBeginnerProtection(toCommander(base), now),
          blocked: verdict && !verdict.ok ? verdict.reason : null,
        };
      }),
      ...nestRows.map((n) => ({
        kind: 'nest' as const,
        id: n.id,
        name: `Blight Nest L${n.level}`,
        level: n.level,
        x: n.x, y: n.y, coords: R.formatCoords(n), distance: R.distance(row, n),
      })),
    ].sort((a, b) => a.distance - b.distance);
    return {
      state,
      result: {
        me: { x: row.x, y: row.y, sector: row.sector, sectorName: R.sectorName(row.sector) },
        sectors: sectors.map((s) => ({ sector: s, name: R.sectorName(s) })),
        places,
      },
    };
  });
}

// ── Reports ───────────────────────────────────────────────────────────────────

function perspective(r: typeof reports.$inferSelect, userId: string): 'attacker' | 'defender' {
  return r.attackerUserId === userId ? 'attacker' : 'defender';
}

export function headline(r: typeof reports.$inferSelect, side: 'attacker' | 'defender'): string {
  const d = r.data;
  if (r.kind === 'scout') {
    return side === 'attacker'
      ? `Scouted ${d.targetName}: ${r.outcome === 'success' ? 'success' : 'Wisps shot down'}`
      : `${d.attackerName} scouted your base`;
  }
  if (r.outcome === 'bounced') {
    return d.bounced === 'shielded' ? `${d.targetName} was shielded: your army turned back` : 'The nest was already cleared';
  }
  const won = (r.outcome === 'attacker') === (side === 'attacker');
  if (r.outcome === 'draw') return side === 'attacker' ? `Draw at ${d.targetName}` : `Held off ${d.attackerName}`;
  return side === 'attacker' ? `${won ? 'Victory' : 'Defeat'} at ${d.targetName}` : `${won ? 'Defended against' : 'Raided by'} ${d.attackerName}`;
}

export async function listReports(db: Database, userId: string, before?: number) {
  await processDueArrivals(db, Date.now());
  const rows = await db.select().from(reports).where(and(
    or(eq(reports.attackerUserId, userId), eq(reports.defenderUserId, userId)),
    before ? lte(reports.at, new Date(before)) : undefined,
  )).orderBy(desc(reports.at)).limit(50);
  return rows.map((r) => {
    const side = perspective(r, userId);
    return {
      id: r.id, kind: r.kind, at: r.at.getTime(), outcome: r.outcome, side,
      title: headline(r, side),
      seen: side === 'attacker' ? r.attackerSeen : r.defenderSeen,
    };
  });
}

export async function readReport(db: Database, userId: string, id: string) {
  await processDueArrivals(db, Date.now());
  const [r] = await db.select().from(reports).where(eq(reports.id, id));
  if (!r) throw new GameError('not_found', 404);
  const involved = r.attackerUserId === userId || r.defenderUserId === userId;
  // Friends can open a report shared with them in a message; they see it the way the sharer did.
  const side = involved ? perspective(r, userId) : await sharedReportSide(db, userId, id);
  if (!side) throw new GameError('not_found', 404);
  if (involved) {
    await db.update(reports).set(side === 'attacker' ? { attackerSeen: true } : { defenderSeen: true }).where(eq(reports.id, id));
  }
  return {
    id: r.id, kind: r.kind, at: r.at.getTime(), outcome: r.outcome, side, shared: !involved,
    title: headline(r, side), data: r.data, text: reportText(r, side),
  };
}

function reportText(r: typeof reports.$inferSelect, side: 'attacker' | 'defender'): string {
  const d = r.data;
  if (r.kind === 'scout') return R.formatScoutReport({ ...d, perspective: side, success: r.outcome === 'success', intel: d.intel ?? null });
  if (d.bounced || !d.battle) return headline(r, side);
  return R.formatBattleReport(d.battle, { ...d, perspective: side, when: r.at.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' });
}

// ── Background work ───────────────────────────────────────────────────────────

/** Settles bases whose builds or training finished, so completion notifications go out on time. */
export async function settleDueBases(db: Database, now: number): Promise<number> {
  const due = await db.select({ id: bases.id }).from(bases).where(lte(bases.nextEventAt, new Date(now))).limit(200);
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const row = await lockBase(tx, id);
      if (!row || !row.nextEventAt || row.nextEventAt.getTime() > now) return;
      await saveBase(tx, row.id, await settleLocked(tx, row, Math.max(now, row.resourcesAt.getTime())));
    });
  }
  return due.length;
}

