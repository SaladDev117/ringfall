import { neon } from '@neondatabase/serverless';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Row = Record<string, unknown>;
export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface Db {
  /** How queries reach Postgres: a pooled TCP connection, or Neon's SQL-over-HTTPS endpoint. */
  transport: 'tcp' | 'https';
  /** Runs one parameterised query (`$1`, `$2`, …) and returns its rows. */
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Drizzle over node-postgres. Only on TCP: the game needs interactive transactions. */
  orm: Database | null;
  close(): Promise<void>;
}

/**
 * Connects to Postgres using `DATABASE_URL` (Neon's pooled string; `neon env pull` writes it to `.env.local`).
 *
 * The server normally uses node-postgres: it's long-running, so one pool is reused across requests.
 * `DATABASE_TRANSPORT=https` switches to Neon's HTTPS endpoint instead, for sandboxes that can only make
 * HTTPS requests (such as Claude Code cloud sessions). It runs one-shot queries only: no interactive
 * transactions, so it's for scripts and health checks, not the game itself.
 */
export function createDb(env: NodeJS.ProcessEnv = process.env): Db {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Run `neon env pull` in the repo root.');

  if (env.DATABASE_TRANSPORT === 'https') {
    const sql = neon(url);
    return {
      transport: 'https',
      query: async <T extends Row>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
      orm: null,
      close: async () => {},
    };
  }

  const pool = new pg.Pool({ connectionString: url, max: Number(env.DATABASE_POOL_MAX ?? 10) });
  return {
    transport: 'tcp',
    query: async <T extends Row>(text: string, params: unknown[] = []) => (await pool.query<T>(text, params)).rows,
    orm: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}
