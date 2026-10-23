// Runs SQL against DATABASE_URL and prints the rows.
//   pnpm db:sql "select now()"
//   pnpm db:sql "select * from pg_tables where schemaname = \$1" public
import { createDb } from '../src/db.js';

const [text, ...params] = process.argv.slice(2).filter((a) => a !== '--');
if (!text) {
  console.error('Usage: pnpm db:sql "<sql>" [param1 param2 …]');
  process.exit(1);
}

const db = createDb();
try {
  const rows = await db.query(text, params);
  if (rows.length) console.table(rows);
  console.log(`${rows.length} row${rows.length === 1 ? '' : 's'} (via ${db.transport})`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.close();
}
