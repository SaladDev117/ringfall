import * as R from '@ringfall/rules';
import { and, asc, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database, Tx } from './db.js';
import { GameError, unitsAway, withMyBase, type BaseContext } from './game.js';
import { armies, friendRequests, friendships, nests, reports, users } from './schema.js';

/** The tutorial card's state, sent with GET /base until the tutorial is finished or skipped. */
export interface TutorialView {
  /** Index into `R.TUTORIAL`. */
  step: number;
  /** The player has done what this step asks and can claim its reward. */
  done: boolean;
  /** The free speed-up on offer right now, and when that thing would otherwise finish. */
  rush: { kind: R.TutorialRushKind; at: number } | null;
  /** Where to send the first raid. */
  nest: { id: string; name: string; x: number; y: number; level: number } | null;
  /** The player's latest nest battle report, for "watch the battle". */
  reportId: string | null;
}

interface TutorialRow {
  step: number;
  rushes: number;
}

async function tutorialRow(tx: Tx, userId: string, lock = false): Promise<TutorialRow> {
  const q = tx.select({ step: users.tutorialStep, rushes: users.tutorialRushes }).from(users).where(eq(users.id, userId));
  const [row] = lock ? await q.for('update') : await q;
  if (!row) throw new GameError('no_user', 401);
  return row;
}

const exists = async (query: Promise<unknown[]>) => (await query).length > 0;

async function facts({ tx, row, state }: BaseContext, shared = false): Promise<R.TutorialFacts> {
  const away = await unitsAway(tx, row.id);
  const raided = await exists(tx.select({ id: armies.id }).from(armies)
    .where(and(eq(armies.ownerBaseId, row.id), isNotNull(armies.targetNestId))).limit(1))
    || await exists(tx.select({ id: reports.id }).from(reports)
      .where(and(eq(reports.kind, 'nest'), eq(reports.attackerUserId, row.userId))).limit(1));
  const seen = await exists(tx.select({ id: reports.id }).from(reports).where(or(
    and(eq(reports.attackerUserId, row.userId), eq(reports.attackerSeen, true)),
    and(eq(reports.defenderUserId, row.userId), eq(reports.defenderSeen, true)),
  )).limit(1));
  const friends = await exists(tx.select({ a: friendships.userA }).from(friendships)
    .where(or(eq(friendships.userA, row.userId), eq(friendships.userB, row.userId))).limit(1))
    || await exists(tx.select({ id: friendRequests.id }).from(friendRequests).where(eq(friendRequests.fromUser, row.userId)).limit(1));
  return {
    levels: state.levels,
    builds: state.builds,
    training: state.training,
    troopers: (state.units.trooper ?? 0) + (away.trooper ?? 0),
    nestRaids: raided ? 1 : 0,
    reportsSeen: seen ? 1 : 0,
    friends: friends ? 1 : 0,
    shared,
  };
}

type Rush = { kind: 'training'; jobId: string; at: number } | { kind: 'march'; armyId: string; at: number };

/** The free speed-up the player could use right now, if any. */
async function availableRush({ tx, row, state, now }: BaseContext, t: TutorialRow): Promise<Rush | null> {
  if (R.tutorialRushOffered('training', t.step, t.rushes)) {
    const job = state.training.find((j) => j.unit === 'trooper' && j.qty - j.done <= R.TUTORIAL_RUSH_MAX_TROOPERS);
    if (job) return { kind: 'training', jobId: job.id, at: R.jobEndsAt(job) };
  }
  if (R.tutorialRushOffered('march', t.step, t.rushes)) {
    const [army] = await tx.select({ id: armies.id, arrivesAt: armies.arrivesAt }).from(armies).where(and(
      eq(armies.ownerBaseId, row.id), eq(armies.status, 'outbound'), isNotNull(armies.targetNestId), gt(armies.arrivesAt, new Date(now)),
    )).orderBy(asc(armies.arrivesAt)).limit(1);
    if (army) return { kind: 'march', armyId: army.id, at: army.arrivesAt.getTime() };
  }
  return null;
}

/** The closest uncleared nest in the player's sector, lowest level first. */
async function firstNest({ tx, row, now, season }: BaseContext): Promise<TutorialView['nest']> {
  const list = await tx.select().from(nests).where(and(
    eq(nests.seasonId, season.id), eq(nests.sector, row.sector), isNull(nests.clearedAt), lte(nests.activeAt, new Date(now)),
  ));
  const best = list.sort((a, b) => a.level - b.level || R.distance(row, a) - R.distance(row, b))[0];
  return best ? { id: best.id, name: `Blight Nest L${best.level}`, x: best.x, y: best.y, level: best.level } : null;
}

export async function tutorialView(ctx: BaseContext): Promise<TutorialView | null> {
  const t = await tutorialRow(ctx.tx, ctx.row.userId);
  if (t.step >= R.TUTORIAL_DONE) return null;
  const key = R.TUTORIAL[t.step]!.key;
  const rush = await availableRush(ctx, t);
  let reportId: string | null = null;
  if (key === 'readReport') {
    const [latest] = await ctx.tx.select({ id: reports.id }).from(reports)
      .where(and(eq(reports.kind, 'nest'), eq(reports.attackerUserId, ctx.row.userId))).orderBy(desc(reports.at)).limit(1);
    reportId = latest?.id ?? null;
  }
  return {
    step: t.step,
    done: R.tutorialStepDone(t.step, await facts(ctx)),
    rush: rush && { kind: rush.kind, at: rush.at },
    nest: key === 'raidNest' ? await firstNest(ctx) : null,
    reportId,
  };
}

/** Pays out the current step's reward once the player has done it, and moves on to the next. */
export function claimTutorialStep(db: Database, userId: string, shared: boolean) {
  return withMyBase(db, userId, async (ctx) => {
    const t = await tutorialRow(ctx.tx, userId, true);
    if (t.step >= R.TUTORIAL_DONE) throw new GameError('tutorial_finished', 409);
    if (!R.tutorialStepDone(t.step, await facts(ctx, shared))) throw new GameError('tutorial_step_not_done', 409);
    const reward = R.TUTORIAL[t.step]!.reward;
    const state = R.cloneBase(ctx.state);
    state.resources = R.addResources(state.resources, reward);
    await ctx.tx.update(users).set({ tutorialStep: t.step + 1 }).where(eq(users.id, userId));
    return { state, result: { step: t.step + 1, reward } };
  });
}

/** Uses one of the tutorial's free speed-ups: finishes the Trooper batch, or marches the raid straight to its nest. */
export function rushTutorial(db: Database, userId: string) {
  return withMyBase(db, userId, async (ctx) => {
    const t = await tutorialRow(ctx.tx, userId, true);
    const rush = await availableRush(ctx, t);
    if (!rush) throw new GameError('nothing_to_rush', 409);
    let state = ctx.state;
    if (rush.kind === 'training') {
      const r = R.finishTraining(ctx.state, rush.jobId, ctx.now);
      if (!r.ok) throw new GameError(r.error, 409);
      state = r.state;
    } else {
      // The arrival resolves on the next request, like any other army that has arrived.
      await ctx.tx.update(armies).set({ arrivesAt: new Date(ctx.now) }).where(eq(armies.id, rush.armyId));
    }
    await ctx.tx.update(users).set({ tutorialRushes: sql`${users.tutorialRushes} | ${R.TUTORIAL_RUSH[rush.kind]}` })
      .where(eq(users.id, userId));
    return { state, result: { kind: rush.kind } };
  });
}

export async function skipTutorial(db: Database, userId: string) {
  await db.update(users).set({ tutorialStep: R.TUTORIAL_DONE }).where(eq(users.id, userId));
  return { step: R.TUTORIAL_DONE };
}
