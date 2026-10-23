import { and, inArray, isNull, lte } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Database } from './db.js';
import { processDueArrivals, settleDueBases } from './game.js';
import { notifications, pushTokens } from './schema.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Notifications older than this when the worker gets to them are dropped, not sent late. */
const STALE_MS = 15 * 60_000;

/** Sends due notifications through Expo's push service. Without push tokens they're simply marked sent. */
export async function sendNotifications(db: Database, now: number, log: FastifyBaseLogger, pushEnabled: boolean): Promise<void> {
  const due = await db.select().from(notifications)
    .where(and(isNull(notifications.sentAt), lte(notifications.sendAt, new Date(now)))).limit(100);
  if (!due.length) return;
  const fresh = due.filter((n) => now - n.sendAt.getTime() <= STALE_MS);
  const tokens = fresh.length
    ? await db.select().from(pushTokens).where(inArray(pushTokens.userId, [...new Set(fresh.map((n) => n.userId))]))
    : [];
  const messages = fresh.flatMap((n) => tokens.filter((t) => t.userId === n.userId)
    .map((t) => ({ to: t.token, title: n.title, body: n.body, sound: 'default', data: { kind: n.kind, ref: n.ref } })));
  if (messages.length && pushEnabled) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
  }
  await db.update(notifications).set({ sentAt: new Date(now) }).where(inArray(notifications.id, due.map((n) => n.id)));
  if (messages.length) log.info({ sent: messages.length, pushEnabled }, 'push notifications');
}

/** Runs arrivals, completions and notifications every few seconds. Returns a stop function. */
export function startWorker(db: Database, log: FastifyBaseLogger, opts: { intervalMs?: number; pushEnabled?: boolean } = {}): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      await processDueArrivals(db, now);
      await settleDueBases(db, now);
      await sendNotifications(db, now, log, opts.pushEnabled ?? true);
    } catch (err) {
      log.error(err, 'worker tick failed');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, opts.intervalMs ?? 5000);
  void tick();
  return () => clearInterval(timer);
}

