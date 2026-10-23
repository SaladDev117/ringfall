# Ringfall

A timer-based strategy game for iOS and Android. Build an outpost on an ancient alien ringworld,
train troops (a buggy takes 20 minutes, a Titan 12 hours), and raid your friends while they raid you back.
Your base, your army, the sector map and every battle are drawn in low-poly 3D (three.js via react-three-fiber).

The full design is in **[docs/spec.md](docs/spec.md)**.

## Layout
```
packages/rules/   game numbers, formulas and the battle simulator (shared by app and server)
apps/mobile/      Expo app (iOS, Android, web): base, building, training, map, armies, reports, friends, messages
apps/mobile/components/three/   3D scenes (Expo DOM components): base, unit showcase, battle replay, sector map
apps/server/      Node API (Fastify + Drizzle + Postgres): accounts, bases, training, map, armies, battles, reports, social
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

## Play it on your phone
1. Start the server on your computer: `pnpm install && pnpm dev` (port 3000, uses the Neon database from `.env.local`).
2. Find your computer's local IP (e.g. `192.168.1.20`), then start the app:
   ```bash
   cd apps/mobile
   EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo start
   ```
3. Scan the QR code with **Expo Go** (App Store / Play Store) on a phone on the same Wi-Fi.
   Press `w` instead to open it in a browser.

Push notifications need a development build and an EAS project (`npx eas-cli init`); everything else works in Expo Go.

## Play online (Neon Function)
The whole game runs as one Neon Function: the web app at `/`, the API under `/api`, next to the Neon database.
```bash
pnpm build:function            # web export with API_URL=/api, embedded into the function bundle
neon deploy --env .env.local   # .env.local needs JWT_SECRET alongside the Neon variables
neon functions get ringfall    # prints the public URL
```
Run `pnpm --filter @ringfall/server db:migrate` (or start the server once) after schema changes; the function
doesn't migrate on its own.

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
