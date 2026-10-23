import { buildApp } from './app.js';
import { createDb } from './db.js';

const db = createDb();
const app = buildApp(db);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    await db.close();
    process.exit(0);
  });
}

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Ringfall server ready (database over ${db.transport})`);
