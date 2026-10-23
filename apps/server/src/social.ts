import * as R from '@ringfall/rules';
import { and, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { AttemptLimiter, normalizeInviteCode } from './auth.js';
import type { Database, Tx } from './db.js';
import { GameError, headline } from './game.js';
import {
  abuseReports, bases, blocks, conversations, friendRequests, friendships, messages, notifications, reports, users,
} from './schema.js';
import { activeSeason } from './world.js';

export const MAX_FRIENDS = 100;
export const MAX_MESSAGE = 500;
const messageLimiter = new AttemptLimiter(30, 60_000);

/** Pairs are stored once, smaller id first. */
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

function fail(code: string, status: number, message: string): never {
  throw new GameError(code, status, message);
}

export async function areFriends(db: Database | Tx, a: string, b: string): Promise<boolean> {
  const [userA, userB] = pair(a, b);
  const rows = await db.select({ a: friendships.userA }).from(friendships)
    .where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)));
  return rows.length > 0;
}

/** True if either user has blocked the other. */
async function blockedEitherWay(db: Database | Tx, a: string, b: string): Promise<boolean> {
  const rows = await db.select({ x: blocks.blocker }).from(blocks).where(or(
    and(eq(blocks.blocker, a), eq(blocks.blocked, b)),
    and(eq(blocks.blocker, b), eq(blocks.blocked, a)),
  ));
  return rows.length > 0;
}

async function friendIds(db: Database | Tx, userId: string): Promise<string[]> {
  const rows = await db.select().from(friendships).where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
  return rows.map((f) => (f.userA === userId ? f.userB : f.userA));
}

async function usernameOf(db: Database | Tx, userId: string): Promise<string> {
  const [u] = await db.select({ name: users.username }).from(users).where(eq(users.id, userId));
  return u?.name ?? 'Someone';
}

// ── Friends ───────────────────────────────────────────────────────────────────

export async function listFriends(db: Database, userId: string) {
  const season = await activeSeason(db);
  const ids = await friendIds(db, userId);
  const people = ids.length ? await db.select({ id: users.id, username: users.username, lastSeenAt: users.lastSeenAt }).from(users)
    .where(inArray(users.id, ids)) : [];
  const theirBases = ids.length ? await db.select().from(bases).where(and(eq(bases.seasonId, season.id), inArray(bases.userId, ids))) : [];
  const now = Date.now();
  const incoming = await db.select({ id: friendRequests.id, username: users.username, at: friendRequests.createdAt })
    .from(friendRequests).innerJoin(users, eq(users.id, friendRequests.fromUser)).where(eq(friendRequests.toUser, userId))
    .orderBy(desc(friendRequests.createdAt));
  const outgoing = await db.select({ id: friendRequests.id, username: users.username, at: friendRequests.createdAt })
    .from(friendRequests).innerJoin(users, eq(users.id, friendRequests.toUser)).where(eq(friendRequests.fromUser, userId))
    .orderBy(desc(friendRequests.createdAt));
  return {
    friends: people.map((p) => {
      const b = theirBases.find((x) => x.userId === p.id);
      return {
        userId: p.id,
        username: p.username,
        lastSeenAt: p.lastSeenAt?.getTime() ?? null,
        base: b ? {
          id: b.id, name: b.name, x: b.x, y: b.y, coords: R.formatCoords(b), power: b.power,
          shielded: !!b.shieldUntil && b.shieldUntil.getTime() > now,
        } : null,
      };
    }).sort((a, b) => a.username.localeCompare(b.username)),
    incoming: incoming.map((r) => ({ ...r, at: r.at.getTime() })),
    outgoing: outgoing.map((r) => ({ ...r, at: r.at.getTime() })),
  };
}

async function befriend(tx: Tx, a: string, b: string): Promise<void> {
  const [userA, userB] = pair(a, b);
  await tx.insert(friendships).values({ userA, userB }).onConflictDoNothing();
  await tx.delete(friendRequests).where(or(
    and(eq(friendRequests.fromUser, a), eq(friendRequests.toUser, b)),
    and(eq(friendRequests.fromUser, b), eq(friendRequests.toUser, a)),
  ));
}

/** Sends a friend request by username or invite code. If they already asked you, you become friends. */
export async function sendFriendRequest(db: Database | Tx, userId: string, by: { username?: string; code?: string }) {
  const [target] = by.code
    ? await db.select().from(users).where(eq(users.inviteCode, normalizeInviteCode(by.code)))
    : await db.select().from(users).where(sql`lower(${users.username}) = lower(${by.username ?? ''})`);
  if (!target) fail('not_found', 404, 'No commander by that name or code.');
  if (target.id === userId) fail('cannot_friend_self', 400, 'That’s you.');
  if (await blockedEitherWay(db, userId, target.id)) fail('cannot_add', 400, 'You can’t add that commander.');
  if (await areFriends(db, userId, target.id)) fail('already_friends', 409, `You’re already friends with ${target.username}.`);
  if ((await friendIds(db, userId)).length >= MAX_FRIENDS) fail('friend_limit', 400, `You can have up to ${MAX_FRIENDS} friends.`);

  const run = async (tx: Tx) => {
    const me = await usernameOf(tx, userId);
    const [theirs] = await tx.select().from(friendRequests)
      .where(and(eq(friendRequests.fromUser, target.id), eq(friendRequests.toUser, userId)));
    if (theirs) {
      await befriend(tx, userId, target.id);
      await tx.insert(notifications).values({
        userId: target.id, kind: 'friend_request', title: 'New friend', body: `${me} accepted your friend request.`,
      });
      return { status: 'friends' as const, username: target.username };
    }
    const [created] = await tx.insert(friendRequests).values({ fromUser: userId, toUser: target.id }).onConflictDoNothing().returning();
    if (created) {
      await tx.insert(notifications).values({
        userId: target.id, kind: 'friend_request', title: 'Friend request', body: `${me} wants to be your friend.`,
      });
    }
    return { status: 'requested' as const, username: target.username };
  };
  // A Tx also has transaction() (a savepoint), so this works inside registration's transaction too.
  return (db as Database).transaction(run);
}

export async function answerFriendRequest(db: Database, userId: string, requestId: string, accept: boolean) {
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(friendRequests).where(and(eq(friendRequests.id, requestId), eq(friendRequests.toUser, userId)));
    if (!req) fail('not_found', 404, 'That request is gone.');
    if (!accept) {
      await tx.delete(friendRequests).where(eq(friendRequests.id, req.id));
      return { status: 'declined' as const };
    }
    if ((await friendIds(tx, userId)).length >= MAX_FRIENDS) fail('friend_limit', 400, `You can have up to ${MAX_FRIENDS} friends.`);
    await befriend(tx, userId, req.fromUser);
    await tx.insert(notifications).values({
      userId: req.fromUser, kind: 'friend_request', title: 'New friend', body: `${await usernameOf(tx, userId)} accepted your friend request.`,
    });
    return { status: 'friends' as const };
  });
}

export async function removeFriend(db: Database, userId: string, otherId: string) {
  const [userA, userB] = pair(userId, otherId);
  await db.delete(friendships).where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)));
  return { ok: true };
}

export async function block(db: Database, userId: string, otherId: string) {
  if (userId === otherId) fail('cannot_block_self', 400, 'That’s you.');
  await db.transaction(async (tx) => {
    await tx.insert(blocks).values({ blocker: userId, blocked: otherId }).onConflictDoNothing();
    const [userA, userB] = pair(userId, otherId);
    await tx.delete(friendships).where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)));
    await tx.delete(friendRequests).where(or(
      and(eq(friendRequests.fromUser, userId), eq(friendRequests.toUser, otherId)),
      and(eq(friendRequests.fromUser, otherId), eq(friendRequests.toUser, userId)),
    ));
  });
  return { ok: true };
}

export async function unblock(db: Database, userId: string, otherId: string) {
  await db.delete(blocks).where(and(eq(blocks.blocker, userId), eq(blocks.blocked, otherId)));
  return { ok: true };
}

export async function listBlocks(db: Database, userId: string) {
  return db.select({ userId: users.id, username: users.username }).from(blocks)
    .innerJoin(users, eq(users.id, blocks.blocked)).where(eq(blocks.blocker, userId));
}

export async function reportAbuse(db: Database, userId: string, r: { userId: string; messageId?: string; reason: string }) {
  await db.insert(abuseReports).values({ reporterId: userId, targetUserId: r.userId, messageId: r.messageId ?? null, reason: r.reason });
  return { ok: true };
}

// ── Messages ──────────────────────────────────────────────────────────────────

// A starting list; extend it (or swap in a proper moderation service) before a public launch.
const FILTERED = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut'];
const FILTER_RE = new RegExp(FILTERED.map((w) => `${w}\\w*`).join('|'), 'gi');

/** Masks filtered words; reports whether anything changed. */
export function filterText(text: string): { text: string; flagged: boolean } {
  let flagged = false;
  const out = text.replace(FILTER_RE, (m) => {
    flagged = true;
    return '*'.repeat(m.length);
  });
  return { text: out, flagged };
}

async function conversationWith(db: Database | Tx, userId: string, otherId: string) {
  const [userA, userB] = pair(userId, otherId);
  const [c] = await db.select().from(conversations).where(and(eq(conversations.userA, userA), eq(conversations.userB, userB)));
  return c ?? null;
}

const myReadColumn = (c: { userA: string }, userId: string) => (c.userA === userId ? 'readA' : 'readB');

export async function listConversations(db: Database, userId: string) {
  const rows = await db.select().from(conversations)
    .where(or(eq(conversations.userA, userId), eq(conversations.userB, userId)))
    .orderBy(desc(conversations.lastMessageAt)).limit(100);
  if (!rows.length) return [];
  const others = rows.map((c) => (c.userA === userId ? c.userB : c.userA));
  const names = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, others));
  return Promise.all(rows.map(async (c) => {
    const otherId = c.userA === userId ? c.userB : c.userA;
    const readAt = c.userA === userId ? c.readA : c.readB;
    const [last] = await db.select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(desc(messages.createdAt)).limit(1);
    const [{ unread }] = (await db.select({ unread: sql<number>`count(*)::int` }).from(messages).where(and(
      eq(messages.conversationId, c.id), ne(messages.senderId, userId), gt(messages.createdAt, readAt),
    ))) as [{ unread: number }];
    return {
      userId: otherId,
      username: names.find((n) => n.id === otherId)?.username ?? 'Unknown',
      lastMessageAt: c.lastMessageAt.getTime(),
      preview: last ? (last.reportId ? '⚔ Shared a report' : last.body) : '',
      fromMe: last?.senderId === userId,
      unread,
    };
  }));
}

/** Unread messages across all conversations, for the tab badge. */
export async function unreadMessageCount(db: Database | Tx, userId: string): Promise<number> {
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(
      ne(messages.senderId, userId),
      or(
        and(eq(conversations.userA, userId), gt(messages.createdAt, conversations.readA)),
        and(eq(conversations.userB, userId), gt(messages.createdAt, conversations.readB)),
      ),
    ))) as [{ n: number }];
  return n;
}

export async function pendingRequestCount(db: Database | Tx, userId: string): Promise<number> {
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(friendRequests).where(eq(friendRequests.toUser, userId))) as [{ n: number }];
  return n;
}

export async function getMessages(db: Database, userId: string, otherId: string, before?: number) {
  const c = await conversationWith(db, userId, otherId);
  const friends = await areFriends(db, userId, otherId);
  const [other] = await db.select({ username: users.username }).from(users).where(eq(users.id, otherId));
  if (!other) fail('not_found', 404, 'That commander is gone.');
  if (!c) return { username: other.username, friends, messages: [] };
  const rows = await db.select({ m: messages, report: reports }).from(messages)
    .leftJoin(reports, eq(reports.id, messages.reportId))
    .where(and(eq(messages.conversationId, c.id), before ? lt(messages.createdAt, new Date(before)) : undefined))
    .orderBy(desc(messages.createdAt)).limit(50);
  await db.update(conversations).set({ [myReadColumn(c, userId)]: new Date() }).where(eq(conversations.id, c.id));
  return {
    username: other.username,
    friends,
    messages: rows.map(({ m, report }) => ({
      id: m.id,
      fromMe: m.senderId === userId,
      body: m.body,
      at: m.createdAt.getTime(),
      report: report ? { id: report.id, title: headline(report, report.attackerUserId === m.senderId ? 'attacker' : 'defender') } : null,
    })),
  };
}

export async function sendMessage(db: Database, userId: string, otherId: string, input: { body?: string; reportId?: string }) {
  if (!(await areFriends(db, userId, otherId))) fail('not_friends', 403, 'You can only message friends.');
  if (await blockedEitherWay(db, userId, otherId)) fail('cannot_message', 403, 'You can’t message that commander.');
  if (!messageLimiter.take(userId)) fail('slow_down', 429, 'Slow down a little.');
  const raw = (input.body ?? '').trim();
  if (!raw && !input.reportId) fail('empty_message', 400, 'Type a message first.');
  if (raw.length > MAX_MESSAGE) fail('message_too_long', 400, `Messages are up to ${MAX_MESSAGE} characters.`);
  if (input.reportId) {
    const [r] = await db.select({ id: reports.id }).from(reports).where(and(
      eq(reports.id, input.reportId), or(eq(reports.attackerUserId, userId), eq(reports.defenderUserId, userId)),
    ));
    if (!r) fail('not_found', 404, 'You can only share your own reports.');
  }
  const { text, flagged } = filterText(raw);
  return db.transaction(async (tx) => {
    const [userA, userB] = pair(userId, otherId);
    const now = new Date();
    // A brand-new conversation is unread for both until each side reads it.
    const [c] = await tx.insert(conversations).values({ userA, userB, lastMessageAt: now, readA: new Date(0), readB: new Date(0) })
      .onConflictDoUpdate({ target: [conversations.userA, conversations.userB], set: { lastMessageAt: now } })
      .returning();
    await tx.update(conversations).set({ [myReadColumn(c!, userId)]: now }).where(eq(conversations.id, c!.id));
    const [m] = await tx.insert(messages).values({
      conversationId: c!.id, senderId: userId, body: text, reportId: input.reportId ?? null, flagged, createdAt: now,
    }).returning();
    const me = await usernameOf(tx, userId);
    await tx.insert(notifications).values({
      userId: otherId, kind: 'message', title: me, ref: c!.id,
      body: input.reportId ? `${me} shared a battle report.` : text.length > 120 ? `${text.slice(0, 117)}…` : text,
    });
    return { id: m!.id, at: m!.createdAt.getTime(), body: m!.body };
  });
}

/** Whether `userId` can see a report because a friend shared it with them; returns the sharer's side. */
export async function sharedReportSide(db: Database, userId: string, reportId: string): Promise<'attacker' | 'defender' | null> {
  const [row] = await db.select({ sender: messages.senderId, attacker: reports.attackerUserId }).from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(reports, eq(reports.id, messages.reportId))
    .where(and(eq(messages.reportId, reportId), or(eq(conversations.userA, userId), eq(conversations.userB, userId))))
    .limit(1);
  if (!row) return null;
  return row.sender === row.attacker ? 'attacker' : 'defender';
}
