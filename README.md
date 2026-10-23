# Ringfall

A text-first, timer-based strategy game for iOS and Android. Build an outpost on an ancient alien ringworld,
train troops (a buggy takes 20 minutes, a Titan 12 hours), and raid your friends while they raid you back.

The full design is in **[docs/spec.md](docs/spec.md)**.

## Layout
```
packages/rules/   game numbers, formulas and the battle simulator (shared by app and server)
apps/mobile/      Expo app (milestone M1+)
apps/server/      Node API (Fastify + Postgres); game endpoints and timers come in M1
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
pnpm sim "40 trooper, 10 rattler, 3 mule" vs "12 trooper, 2 breacher, sentry:2, wall:1" --runs 1000
```

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
