import * as R from '@ringfall/rules';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  AttemptLimiter, MIN_PASSWORD, findUserByName, hashPassword, newInviteCode, normalizeInviteCode, usernameProblem,
  verifyPassword, type TokenService,
} from './auth.js';
import type { Database } from './db.js';
import * as game from './game.js';
import { GameError } from './game.js';
import { bases, pushTokens, users } from './schema.js';
import * as social from './social.js';
import * as tutorial from './tutorial.js';
import { activeSeason, spawnBase } from './world.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const password = z.string().min(MIN_PASSWORD, `Passwords need at least ${MIN_PASSWORD} characters`).max(200);
const uuid = z.uuid();
const buildingType = z.enum(R.BUILDING_TYPES as [R.BuildingType, ...R.BuildingType[]]);
const unitKey = z.enum(R.UNIT_KEYS as [R.UnitKey, ...R.UnitKey[]]);

const schemas = {
  register: z.object({ username: z.string(), password, inviteCode: z.string().max(20).optional() }),
  login: z.object({ username: z.string().max(40), password: z.string().max(200) }),
  refresh: z.object({ refreshToken: z.string().min(10).max(200) }),
  deleteAccount: z.object({ password: z.string().max(200) }),
  rename: z.object({ name: z.string().trim().min(3).max(24) }),
  build: z.object({ type: buildingType }),
  train: z.object({ unit: unitKey, qty: z.number().int().min(1).max(10_000) }),
  launch: z.object({
    target: z.object({ kind: z.enum(['base', 'nest']), id: uuid }),
    mission: z.enum(['raid', 'scout']),
    units: z.record(z.string(), z.number().int().min(0)),
  }),
  pushToken: z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']) }),
  idParam: z.object({ id: uuid }),
  userParam: z.object({ userId: uuid }),
  friendRequest: z.object({ username: z.string().max(40).optional(), code: z.string().max(20).optional() })
    .refine((b) => b.username || b.code, 'Enter a username or invite code'),
  abuse: z.object({ userId: uuid, messageId: uuid.optional(), reason: z.string().trim().min(1).max(500) }),
  message: z.object({ body: z.string().max(2000).optional(), reportId: uuid.optional() }),
  beforeQuery: z.object({ before: z.coerce.number().int().positive().optional() }),
  reportsQuery: z.object({ before: z.coerce.number().int().positive().optional() }),
  tutorialClaim: z.object({ shared: z.boolean().optional() }),
};

export interface RouteDeps {
  db: Database;
  tokens: TokenService;
  loginLimiter?: AttemptLimiter;
}

export function registerRoutes(app: FastifyInstance, { db, tokens, loginLimiter = new AttemptLimiter(10, 15 * 60_000) }: RouteDeps): void {
  app.decorateRequest('userId', '');

  const seen = new Map<string, number>();
  const authenticate = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const userId = header?.startsWith('Bearer ') ? await tokens.verifyAccess(header.slice(7)) : null;
    if (!userId) return reply.code(401).send({ error: 'unauthorized', message: 'Please log in again.' });
    req.userId = userId;
    // "Last seen" for friends lists, written at most every five minutes per user.
    const now = Date.now();
    if ((seen.get(userId) ?? 0) < now - 5 * 60_000) {
      seen.set(userId, now);
      db.update(users).set({ lastSeenAt: new Date(now) }).where(eq(users.id, userId)).catch((err) => req.log.warn(err));
    }
  };
  const authed = { preHandler: authenticate };

  // ── Accounts ──
  app.post('/auth/register', async (req, reply) => {
    const body = schemas.register.parse(req.body);
    const problem = usernameProblem(body.username);
    if (problem) throw new GameError('bad_username', 400, problem);
    if (await findUserByName(db, body.username)) throw new GameError('username_taken', 409, 'That username is taken.');
    const passwordHash = await hashPassword(body.password);
    const result = await db.transaction(async (tx) => {
      let inviter: { userId: string } | undefined;
      if (body.inviteCode) {
        [inviter] = await tx.select({ userId: users.id }).from(users).where(eq(users.inviteCode, normalizeInviteCode(body.inviteCode)));
        if (!inviter) throw new GameError('bad_invite_code', 400, 'That invite code doesn’t exist.');
      }
      const [user] = await tx.insert(users).values({ username: body.username, passwordHash, inviteCode: newInviteCode() })
        .onConflictDoNothing().returning();
      if (!user) throw new GameError('username_taken', 409, 'That username is taken.');
      const season = await activeSeason(tx);
      let near: R.Point | undefined;
      if (inviter) {
        const [b] = await tx.select({ x: bases.x, y: bases.y }).from(bases)
          .where(eq(bases.userId, inviter.userId)).orderBy(bases.seasonId).limit(1);
        near = b;
      }
      await spawnBase(tx, { season, userId: user.id, username: user.username, now: Date.now(), near });
      if (body.inviteCode) await social.sendFriendRequest(tx, user.id, { code: body.inviteCode });
      return { user, tokens: await tokens.issue(tx, user.id), inviterId: inviter?.userId ?? null };
    });
    reply.code(201);
    return { user: publicUser(result.user), ...result.tokens };
  });

  app.post('/auth/login', async (req) => {
    const body = schemas.login.parse(req.body);
    if (!loginLimiter.take(`${req.ip}:${body.username.toLowerCase()}`)) {
      throw new GameError('too_many_attempts', 429, 'Too many attempts. Try again in 15 minutes.');
    }
    const user = await findUserByName(db, body.username);
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      throw new GameError('bad_credentials', 401, 'Wrong username or password.');
    }
    return { user: publicUser(user), ...(await tokens.issue(db, user.id)) };
  });

  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = schemas.refresh.parse(req.body);
    const next = await tokens.refresh(db, refreshToken);
    if (!next) throw new GameError('unauthorized', 401, 'Please log in again.');
    return next;
  });

  app.post('/auth/logout', async (req) => {
    const { refreshToken } = schemas.refresh.parse(req.body);
    await tokens.revoke(db, refreshToken);
    return { ok: true };
  });

  app.get('/me', authed, async (req) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user) throw new GameError('unauthorized', 401);
    return publicUser(user);
  });

  /** In-app account deletion (required by the App Store). */
  app.delete('/account', authed, async (req) => {
    const { password: pw } = schemas.deleteAccount.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user || !(await verifyPassword(user.passwordHash, pw))) throw new GameError('bad_credentials', 401, 'Wrong password.');
    await db.delete(users).where(eq(users.id, user.id));
    return { ok: true };
  });

  app.post('/push-tokens', authed, async (req) => {
    const body = schemas.pushToken.parse(req.body);
    await db.insert(pushTokens).values({ ...body, userId: req.userId })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId: req.userId, platform: body.platform } });
    return { ok: true };
  });

  // ── Game ──
  app.get('/config', async () => {
    const season = await activeSeason(db);
    return {
      serverTime: Date.now(),
      season: { id: season.id, name: season.name, startsAt: season.startsAt.getTime(), endsAt: season.endsAt.getTime() },
    };
  });

  app.get('/base', authed, (req) => game.withMyBase(db, req.userId, async (ctx) => ({
    state: ctx.state,
    result: { ...await game.baseView(ctx), tutorial: await tutorial.tutorialView(ctx) },
  })));

  app.patch('/base', authed, async (req) => game.renameBase(db, req.userId, schemas.rename.parse(req.body).name));

  app.post('/base/build', authed, async (req) => game.startBuild(db, req.userId, schemas.build.parse(req.body).type));

  app.delete('/base/build/:id', authed, async (req) => game.cancelBuild(db, req.userId, schemas.idParam.parse(req.params).id));

  app.post('/base/train', authed, async (req) => {
    const body = schemas.train.parse(req.body);
    return game.queueTraining(db, req.userId, body.unit, body.qty);
  });

  app.delete('/base/train/:id', authed, async (req) => game.cancelTraining(db, req.userId, schemas.idParam.parse(req.params).id));

  app.get('/map/nearby', authed, async (req) => game.nearby(db, req.userId));

  app.post('/armies', authed, async (req, reply) => {
    const body = schemas.launch.parse(req.body);
    reply.code(201);
    return game.launchArmy(db, req.userId, body as game.LaunchRequest);
  });

  app.post('/armies/:id/recall', authed, async (req) => game.recallArmy(db, req.userId, schemas.idParam.parse(req.params).id));

  app.post('/tutorial/claim', authed, async (req) => tutorial.claimTutorialStep(db, req.userId, schemas.tutorialClaim.parse(req.body ?? {}).shared ?? false));

  app.post('/tutorial/rush', authed, async (req) => tutorial.rushTutorial(db, req.userId));

  app.post('/tutorial/skip', authed, async (req) => tutorial.skipTutorial(db, req.userId));

  app.get('/reports', authed, async (req) => game.listReports(db, req.userId, schemas.reportsQuery.parse(req.query).before));

  app.get('/reports/:id', authed, async (req) => game.readReport(db, req.userId, schemas.idParam.parse(req.params).id));

  // ── Social ──
  app.get('/friends', authed, async (req) => social.listFriends(db, req.userId));

  app.post('/friends/requests', authed, async (req) => social.sendFriendRequest(db, req.userId, schemas.friendRequest.parse(req.body)));

  app.post('/friends/requests/:id/accept', authed, async (req) =>
    social.answerFriendRequest(db, req.userId, schemas.idParam.parse(req.params).id, true));

  app.post('/friends/requests/:id/decline', authed, async (req) =>
    social.answerFriendRequest(db, req.userId, schemas.idParam.parse(req.params).id, false));

  app.delete('/friends/:userId', authed, async (req) => social.removeFriend(db, req.userId, schemas.userParam.parse(req.params).userId));

  app.get('/blocks', authed, async (req) => social.listBlocks(db, req.userId));

  app.post('/blocks/:userId', authed, async (req) => social.block(db, req.userId, schemas.userParam.parse(req.params).userId));

  app.delete('/blocks/:userId', authed, async (req) => social.unblock(db, req.userId, schemas.userParam.parse(req.params).userId));

  app.post('/abuse-reports', authed, async (req) => social.reportAbuse(db, req.userId, schemas.abuse.parse(req.body)));

  app.get('/conversations', authed, async (req) => social.listConversations(db, req.userId));

  app.get('/messages/:userId', authed, async (req) =>
    social.getMessages(db, req.userId, schemas.userParam.parse(req.params).userId, schemas.beforeQuery.parse(req.query).before));

  app.post('/messages/:userId', authed, async (req, reply) => {
    const out = await social.sendMessage(db, req.userId, schemas.userParam.parse(req.params).userId, schemas.message.parse(req.body));
    reply.code(201);
    return out;
  });
}

function publicUser(user: typeof users.$inferSelect) {
  return { id: user.id, username: user.username, inviteCode: user.inviteCode, createdAt: user.createdAt.getTime() };
}
