import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AttemptLimiter, TokenService } from './auth.js';
import type { Db } from './db.js';
import { GameError } from './game.js';
import { registerRoutes } from './routes.js';

export interface AppOptions {
  jwtSecret: string;
  loginLimiter?: AttemptLimiter;
}

export function buildApp(db: Db, opts: AppOptions = { jwtSecret: 'test' }): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof GameError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'bad_request', message: err.issues[0]?.message ?? 'Invalid request' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'server_error', message: 'Something went wrong.' });
  });

  /** Liveness plus a real database round trip. */
  app.get('/health', async (_req, reply) => {
    try {
      const started = performance.now();
      const [row] = await db.query<{ database: string; postgres: string; now: Date | string }>(
        "select current_database() as database, current_setting('server_version') as postgres, now() as now",
      );
      return {
        ok: true,
        db: { ...row, transport: db.transport, latencyMs: Math.round(performance.now() - started) },
      };
    } catch (err) {
      app.log.error(err, 'health check query failed');
      return reply.code(503).send({ ok: false, error: 'database unreachable' });
    }
  });

  if (db.orm) {
    registerRoutes(app, { db: db.orm, tokens: new TokenService(opts.jwtSecret), loginLimiter: opts.loginLimiter });
  } else {
    // Neon over HTTPS can't run interactive transactions, which every game action needs.
    app.log.warn('Database is on the HTTPS transport: only /health is available');
  }

  return app;
}
