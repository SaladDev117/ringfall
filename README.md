# Ringfall

A text-first, timer-based strategy game for iOS and Android. Build an outpost on an ancient alien ringworld,
train troops (a buggy takes 20 minutes, a Titan 12 hours), and raid your friends while they raid you back.

The full design is in **[docs/spec.md](docs/spec.md)**.

## Layout
```
packages/rules/   game numbers, formulas and the battle simulator (shared by app and server)
apps/mobile/      Expo app (milestone M1+)
apps/server/      Node API (Fastify + Drizzle + Postgres): accounts, bases, training, map, armies, battles, reports
neon.ts           Neon project policy (project `ringfall`, branch `production`)
```

## Getting started
```bash
pnpm install
neon env pull    # writes DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct) to .env.local
pnpm build
pnpm test
pnpm typecheck
pnpm start       # server on :3000, GET /health does a real database round trip
pnpm db:sql "select now()"
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres pnpm test   # also runs the server integration tests
pnpm sim "40 trooper, 10 rattler, 3 mule" vs "12 trooper, 2 breacher, sentry:2, wall:1" --runs 1000
```

## How the server works
- Every base's changing state (resources, levels, units, build and training queues) lives in its `bases` row.
  `packages/rules` `settleBase()` moves it forward in time; nothing runs on a tick.
- Each request first resolves armies that have arrived (oldest first, one transaction each, under an advisory
  lock), then locks the player's base, settles it to now, applies the action and saves it.
- A worker loop (every 5 s) does the same for bases nobody is looking at and sends push notifications
  through Expo (`EXPO_PUSH=off` disables sending).
- Migrations live in `apps/server/drizzle/` and run on start (`MIGRATE_ON_START=false` to skip). After changing
  `src/schema.ts`, run `pnpm --filter @ringfall/server db:generate`.

## Database (Neon)
- The server uses node-postgres with the **pooled** `DATABASE_URL`. Migrations, dumps and anything needing
  session state (`LISTEN`, `SET`) must use the **direct** `DATABASE_URL_UNPOOLED`.
- `.env.local` holds credentials and is gitignored. Never commit it.
- **Claude Code cloud sessions** can only make HTTPS requests, so raw Postgres connections fail there. Use Neon's
  SQL-over-HTTPS endpoint instead (one-shot queries only, no interactive transactions):
  ```bash
  DATABASE_TRANSPORT=https NODE_USE_ENV_PROXY=1 pnpm db:sql "select count(*) from pg_tables"
  DATABASE_TRANSPORT=https NODE_USE_ENV_PROXY=1 pnpm start
  ```
