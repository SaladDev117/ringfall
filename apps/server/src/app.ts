import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db.js';

export function buildApp(db: Db): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

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

  return app;
}
