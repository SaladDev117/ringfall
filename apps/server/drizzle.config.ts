import { defineConfig } from 'drizzle-kit';

// Migrations run over the direct (unpooled) connection: PgBouncer's transaction mode breaks session state.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: (process.env.DATABASE_URL ?? '').replace('-pooler.', '.') },
});
