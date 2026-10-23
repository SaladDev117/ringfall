import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { runMigrations } from './migrate.js';
import { startWorker } from './worker.js';

const config = loadConfig();
const db = createDb();
if (config.migrateOnStart) await runMigrations();
const app = buildApp(db, { jwtSecret: config.jwtSecret });
const stopWorker = db.orm && config.worker
  ? startWorker(db.orm, app.log, { pushEnabled: process.env.EXPO_PUSH !== 'off' })
  : () => {};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    stopWorker();
    await app.close();
    await db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`Ringfall server ready (database over ${db.transport})`);
