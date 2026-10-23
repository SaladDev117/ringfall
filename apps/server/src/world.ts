import * as R from '@ringfall/rules';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import type { Database, Tx } from './db.js';
import { bases, nests, seasons } from './schema.js';

const DAY = 24 * 3600_000;
const HOUR = 3600_000;
export const SEASON_DAYS = 90;
const MIN_NESTS_PER_SECTOR = 3;
/** Keep bases off the very edges of the ring's width. */
const Y_MIN = 2;
const Y_MAX = R.RING_WIDTH - 3;

export type Season = typeof seasons.$inferSelect;
type Executor = Database | Tx;

let cached: { season: Season; until: number } | null = null;

/** The current season, starting Season 1 if none is running. Cached for a minute. */
export async function activeSeason(db: Executor, now = Date.now()): Promise<Season> {
  if (cached && cached.until > now && cached.season.endsAt.getTime() > now) return cached.season;
  let [season] = await db.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
  if (!season) {
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(seasons)) as [{ n: number }];
    // A partial unique index allows one active season, so concurrent starters can't create two.
    await db.insert(seasons).values({
      name: `Season ${n + 1}`, startsAt: new Date(now), endsAt: new Date(now + SEASON_DAYS * DAY),
    }).onConflictDoNothing();
    [season] = await db.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
  }
  cached = { season: season!, until: now + 60_000 };
  return season!;
}

export function forgetSeasonCache(): void {
  cached = null;
}

export const seasonDay = (season: Season, now: number): number =>
  Math.max(0, Math.floor((now - season.startsAt.getTime()) / DAY));

async function occupied(tx: Tx, seasonId: number, sector: number): Promise<Set<string>> {
  const taken = new Set<string>();
  const b = await tx.select({ x: bases.x, y: bases.y }).from(bases).where(and(eq(bases.seasonId, seasonId), eq(bases.sector, sector)));
  const n = await tx.select({ x: nests.x, y: nests.y }).from(nests)
    .where(and(eq(nests.seasonId, seasonId), eq(nests.sector, sector), isNull(nests.clearedAt)));
  for (const p of [...b, ...n]) taken.add(`${p.x},${p.y}`);
  return taken;
}

async function baseCounts(tx: Tx, seasonId: number): Promise<Map<number, number>> {
  const rows = await tx.select({ sector: bases.sector, n: sql<number>`count(*)::int` }).from(bases)
    .where(eq(bases.seasonId, seasonId)).groupBy(bases.sector);
  return new Map(rows.map((r) => [r.sector, r.n]));
}

/** Sectors fill in order, so newcomers land next to other recent arrivals. */
async function openSector(tx: Tx, seasonId: number): Promise<number> {
  const counts = await baseCounts(tx, seasonId);
  for (let s = 0; s < R.SECTOR_COUNT; s++) if ((counts.get(s) ?? 0) < R.SECTOR_TARGET_BASES) return s;
  let best = 0;
  for (let s = 1; s < R.SECTOR_COUNT; s++) if ((counts.get(s) ?? 0) < (counts.get(best) ?? 0)) best = s;
  return best;
}

function randomTile(sector: number): R.Point {
  return { x: sector * R.SECTOR_LENGTH + randomInt(R.SECTOR_LENGTH), y: Y_MIN + randomInt(Y_MAX - Y_MIN + 1) };
}

/** A free tile in `sector`, as close to `near` as possible when given. */
async function freeTile(tx: Tx, seasonId: number, sector: number, near?: R.Point): Promise<R.Point> {
  const taken = await occupied(tx, seasonId, sector);
  const lo = sector * R.SECTOR_LENGTH;
  const free = (p: R.Point) => p.x >= lo && p.x < lo + R.SECTOR_LENGTH && p.y >= Y_MIN && p.y <= Y_MAX && !taken.has(`${p.x},${p.y}`);
  if (near) {
    for (let radius = 2; radius <= 10; radius++) {
      for (let i = 0; i < 12; i++) {
        const p = { x: near.x + randomInt(-radius, radius + 1), y: near.y + randomInt(-radius, radius + 1) };
        if (free(p) && R.distance(p, near) >= 2) return p;
      }
    }
  }
  for (let i = 0; i < 500; i++) {
    const p = randomTile(sector);
    if (free(p)) return p;
  }
  throw new Error(`Sector ${sector} is full`);
}

/** Nest levels: mostly low, the odd big one. */
function randomNestLevel(): number {
  const weights = [25, 20, 15, 12, 10, 7, 5, 3, 2, 1];
  let roll = randomInt(weights.reduce((a, b) => a + b, 0));
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i + 1;
  }
  return 1;
}

export async function spawnNest(
  tx: Tx, seasonId: number, sector: number, activeAt: Date, level = randomNestLevel(), near?: R.Point,
): Promise<void> {
  const p = await freeTile(tx, seasonId, sector, near);
  await tx.insert(nests).values({
    seasonId, sector, x: p.x, y: p.y, level, garrison: R.nestGarrison(level), garrisonAt: activeAt, activeAt,
  });
}

/** Keeps roughly one nest per three bases (at least three) in a sector, always including a level 1. */
export async function ensureNests(tx: Tx, seasonId: number, sector: number, now: number): Promise<void> {
  const counts = await baseCounts(tx, seasonId);
  const live = await tx.select({ level: nests.level }).from(nests)
    .where(and(eq(nests.seasonId, seasonId), eq(nests.sector, sector), isNull(nests.clearedAt)));
  const target = Math.max(MIN_NESTS_PER_SECTOR, Math.ceil((counts.get(sector) ?? 0) / R.BASES_PER_NEST));
  let missing = target - live.length;
  if (!live.some((n) => n.level === 1) && missing <= 0) missing = 1;
  for (let i = 0; i < missing; i++) {
    await spawnNest(tx, seasonId, sector, new Date(now), i === 0 && !live.some((n) => n.level === 1) ? 1 : undefined);
  }
}

/** Respawns a cleared nest elsewhere in its sector after 1–3 hours. */
export async function respawnNest(tx: Tx, seasonId: number, sector: number, clearedAt: number): Promise<void> {
  await spawnNest(tx, seasonId, sector, new Date(clearedAt + HOUR + randomInt(2 * HOUR)));
}

export function startingState(now: number, seasonDayAtJoin: number): R.BaseState {
  return {
    resources: R.res(1000, 600, 0),
    resourcesAt: now,
    levels: R.startingLevels(),
    units: { trooper: 5 },
    builds: [],
    training: [],
    joinedAt: now,
    seasonDayAtJoin,
  };
}

/** Places a new base for `userId`, next to `near` (a friend's base) when there's room in that sector. */
export async function spawnBase(
  tx: Tx, opts: { season: Season; userId: string; username: string; now: number; near?: R.Point },
): Promise<typeof bases.$inferSelect> {
  const { season, userId, username, now, near } = opts;
  await tx.execute(sql`select pg_advisory_xact_lock(7001003, ${season.id})`);
  const counts = await baseCounts(tx, season.id);
  const nearSector = near ? R.sectorOf(near.x) : null;
  const sector = nearSector !== null && (counts.get(nearSector) ?? 0) < R.SECTOR_TARGET_BASES * 1.5
    ? nearSector
    : await openSector(tx, season.id);
  const tile = await freeTile(tx, season.id, sector, nearSector === sector ? near : undefined);
  const day = seasonDay(season, now);
  const s = startingState(now, day);
  const [row] = await tx.insert(bases).values({
    seasonId: season.id, userId, name: `${username}'s Outpost`, x: tile.x, y: tile.y, sector,
    resources: s.resources, resourcesAt: new Date(now), levels: s.levels, units: s.units, builds: [], training: [],
    joinedAt: new Date(now), seasonDayAtJoin: day, power: R.power(s.levels, s.units),
  }).returning();
  // A level 1 nest a few tiles away, so a new commander's first raid is a short walk.
  await spawnNest(tx, season.id, sector, new Date(now), 1, tile);
  await ensureNests(tx, season.id, sector, now);
  return row!;
}
