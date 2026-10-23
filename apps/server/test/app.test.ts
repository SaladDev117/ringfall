process.env.LOG_LEVEL = 'silent';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Db } from '../src/db.js';

const fakeDb = (query: Db['query']): Db => ({ transport: 'tcp', query, orm: null, close: async () => {} });

describe('GET /health', () => {
  it('reports the database it reached', async () => {
    const app = buildApp(fakeDb(async () => [{ database: 'neondb', postgres: '18.6', now: '2026-10-23T00:00:00Z' }] as never));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: { database: 'neondb', postgres: '18.6', transport: 'tcp' } });
  });

  it('returns 503 when the database is down', async () => {
    const app = buildApp(fakeDb(async () => { throw new Error('connection refused'); }));
    app.log.level = 'silent';
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false, error: 'database unreachable' });
  });
});
