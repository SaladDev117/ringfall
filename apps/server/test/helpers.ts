import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { AttemptLimiter } from '../src/auth.js';
import { createDb, type Database } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { forgetSeasonCache } from '../src/world.js';

/** An admin connection string to a Postgres server where tests may create and drop databases. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export interface TestApp {
  app: FastifyInstance;
  orm: Database;
  sql(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** Moves the whole world `ms` into the future by shifting every stored time back. */
  advance(ms: number): Promise<void>;
  close(): Promise<void>;
}

export async function setupTestApp(): Promise<TestApp> {
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  const name = `ringfall_test_${randomBytes(4).toString('hex')}`;
  await admin.query(`create database ${name}`);
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${name}`;
  const env = { DATABASE_URL: url.toString() };
  await runMigrations(env);
  const db = createDb(env);
  forgetSeasonCache();
  const app = buildApp(db, { jwtSecret: 'test-secret', loginLimiter: new AttemptLimiter(1000, 60_000) });
  const sql = (text: string, params: unknown[] = []) => db.query(text, params);

  return {
    app,
    orm: db.orm!,
    sql,
    async advance(ms) {
      const i = `${ms} milliseconds`;
      await sql(`
        update bases set
          resources_at = resources_at - $1::interval, joined_at = joined_at - $1::interval,
          shield_until = shield_until - $1::interval, next_event_at = next_event_at - $1::interval,
          builds = (select coalesce(jsonb_agg(b || jsonb_build_object(
            'startedAt', (b->>'startedAt')::bigint - $2, 'endsAt', (b->>'endsAt')::bigint - $2)), '[]'::jsonb)
            from jsonb_array_elements(builds) b),
          training = (select coalesce(jsonb_agg(t || jsonb_build_object('startsAt', (t->>'startsAt')::bigint - $2)), '[]'::jsonb)
            from jsonb_array_elements(training) t)`, [i, ms]);
      await sql(`update armies set departs_at = departs_at - $1::interval, arrives_at = arrives_at - $1::interval,
        returns_at = returns_at - $1::interval, recalled_at = recalled_at - $1::interval`, [i]);
      await sql(`update nests set garrison_at = garrison_at - $1::interval, active_at = active_at - $1::interval,
        cleared_at = cleared_at - $1::interval`, [i]);
      await sql(`update notifications set send_at = send_at - $1::interval`, [i]);
      await sql(`update reports set at = at - $1::interval`, [i]);
      await sql(`update seasons set starts_at = starts_at - $1::interval, ends_at = ends_at - $1::interval`, [i]);
      forgetSeasonCache();
    },
    async close() {
      await app.close();
      await db.close();
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}

export interface Player {
  token: string;
  refreshToken: string;
  user: { id: string; username: string; inviteCode: string };
  get(url: string): Promise<{ status: number; body: any }>;
  post(url: string, payload?: unknown): Promise<{ status: number; body: any }>;
  patch(url: string, payload?: unknown): Promise<{ status: number; body: any }>;
  del(url: string, payload?: unknown): Promise<{ status: number; body: any }>;
}

export function client(app: FastifyInstance, token = '') {
  const call = async (method: 'GET' | 'POST' | 'DELETE' | 'PATCH', url: string, payload?: unknown) => {
    const res = await app.inject({
      method, url, payload: payload as object | undefined,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.statusCode, body: res.body ? res.json() : null };
  };
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, payload?: unknown) => call('POST', url, payload ?? {}),
    patch: (url: string, payload?: unknown) => call('PATCH', url, payload ?? {}),
    del: (url: string, payload?: unknown) => call('DELETE', url, payload),
  };
}

export async function register(app: FastifyInstance, username: string, inviteCode?: string): Promise<Player> {
  const res = await client(app).post('/auth/register', { username, password: 'correct horse', inviteCode });
  if (res.status !== 201) throw new Error(`register ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  const c = client(app, res.body.accessToken);
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, user: res.body.user, ...c };
}
