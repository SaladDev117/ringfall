import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { migrate as migrateHttp } from 'drizzle-orm/neon-http/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

/** `drizzle/` sits next to both `src/` and the bundled `dist/`. */
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Neon's direct (unpooled) host is the pooled one without `-pooler`. Deriving it from DATABASE_URL, rather than
 * reading DATABASE_URL_UNPOOLED, guarantees migrations hit the same database the server is using.
 */
export const directUrl = (url: string): string => url.replace('-pooler.', '.');

/** Applies pending migrations over the direct connection (PgBouncer's transaction mode breaks session state). */
export async function runMigrations(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const url = directUrl(env.DATABASE_URL);
  if (env.DATABASE_TRANSPORT === 'https') {
    await migrateHttp(drizzleHttp(neon(url)), { migrationsFolder });
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runMigrations();
  console.log('Migrations applied.');
}
