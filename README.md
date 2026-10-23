# Ringfall

A text-first, timer-based strategy game for iOS and Android. Build an outpost on an ancient alien ringworld,
train troops (a buggy takes 20 minutes, a Titan 12 hours), and raid your friends while they raid you back.

The full design is in **[docs/spec.md](docs/spec.md)**.

## Layout
```
packages/rules/   game numbers, formulas and the battle simulator (shared by app and server)
apps/mobile/      Expo app (milestone M1+)
apps/server/      Node API + timers (milestone M1+)
```

## Getting started
```bash
pnpm install
pnpm test        # rules unit tests
pnpm typecheck
pnpm sim "40 trooper, 10 rattler, 3 mule" vs "12 trooper, 2 breacher, sentry:2, wall:1" --runs 1000
```
