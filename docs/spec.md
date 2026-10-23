# Ringfall: Mobile Game Spec (v0.1 draft)

A text-first, timer-based strategy game for iOS and Android. You run an outpost on an ancient alien ringworld,
build up resources, train troops (a buggy takes 20 minutes, a Titan takes 12 hours), and raid your friends
and neighbours while they raid you back. It's inspired by Moonbase on MXit, but it's a different game with
its own world, units and rules.

> Status: draft spec, built from the Q&A. Every number in here is a **starting value**. The numbers live in
> one shared rules package (see [Tech](#13-tech-stack)), so tuning them during playtests is a data change, not a rewrite.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Platform | Native app for iOS and Android (Expo / React Native) |
| Setting | Halo-inspired sci-fi with original names: one alien ringworld built by a vanished race, and every player lives on it |
| Faction | One faction. Everyone has the same roster, human troops plus salvaged alien tech |
| World | One shared map with coordinates. Your neighbours are the bases nearest to you |
| Combat | Armies take travel time, the server resolves the battle on arrival, and both sides get a text battle report |
| Economy | 3 resources mined over time: Alloy, Plasma, Relic Shards |
| Stakes | Loser loses a capped share of loot plus troops. A defender who loses gets a shield. Buildings are never destroyed |
| Defence | Troops at home plus defensive structures (turrets, wall, shield generator) |
| Opponents | Friends anywhere on the ring, random neighbours near your power, and NPC Blight Nests |
| Seasons | About 3 months, then the world resets. Cosmetic rewards and your profile carry over |
| Social (v1) | Friends list plus invite codes, and 1-on-1 direct messages |
| Login | Username and password |
| Push | Training/building done, incoming attack, friend requests and messages |
| Look | Text-first with light art (icons, cards), MXit feel in a modern app |
| Money | Free at launch. Rewarded ads and an in-app shop come later, but the data model supports them from day one |
| Launch | Friends test first (TestFlight / Play internal testing), then a public store launch |
| Code | New repository (monorepo: app + server + shared rules) |

### What we know about Moonbase (for reference)
There isn't much about Moonbase online. Here's what I found: Blue Leaf Games (Cape Town) made it as a massively
multiplayer strategy game for MXit. Each base produced Oxygen, Water, Iron and Helium. Early buildings let you
explore your **neighbourhood** and talk to nearby bases, and a War Room built armies for defence or raids. Moonbuggies were
the cheap defensive unit, and Gunships were the raiders: faster, harder-hitting, with more room for plunder. Ringfall keeps the
same core loop (neighbourhood map, raiders vs defenders, plunder capacity) but changes the world, resources, units and
progression.

---

## 2. Setting & lore

**The Ring.** Ages ago a vanished race called the **Oruun** built a ring-shaped world thousands of kilometres across:
a flat band of land that curves up into the sky, lit by a sun-strip and split into **sectors** linked by
ancient **Gates**. Then they disappeared. Their machines still run.

**The Commanders.** A human colony fleet arrived, broke apart, and scattered across the Ring. Every player is a
Commander of one splinter outpost. All Commanders have the same mixed force: human troopers and vehicles, refitted with
salvaged Oruun technology.

**Relic Shards.** These are fragments of Oruun tech dug out of the Ring. They power the best gear, including **Titans**,
ancient Oruun war-frames that humans can barely control.

**The Blight.** A parasitic swarm left in the Ring's depths. Blight Nests dot every sector. Clearing them is the safe way
to get resources and the first thing new players learn.

**Ringfall (the season reset).** Every ~90 days the Ring runs its **Reclamation** and wipes every structure on its
surface. Commanders are shipped out and land again on a fresh Ring. The game is named after this event,
and it explains the season reset in the story.

### Naming rules
The game is Halo-*inspired* but must not borrow its names. Never use: Halo, Spartan, Master Chief, Covenant, Forerunner,
Flood, UNSC, Warthog, Scorpion, Pelican, Ghost, Banshee, Wraith, Scarab, Mjolnir, Elite, Grunt, Hunter, Jackal.
Before launch, run an App Store / Play Store and trademark search on "Ringfall" and on the unit names.

Sector name examples: *Glasswater Reach, The Spindle, Ashfall Span, Hollow Meridian, Lantern Coast, Gatefield*.

---

## 3. Core loop

```
 mine resources ──► upgrade buildings ──► train troops (timers) ──► scout ──► send army (travel time)
        ▲                                                                          │
        │                                                                          ▼
   loot returns ◄──── army travels home ◄──── server resolves battle ◄──── army arrives
        │
        └── meanwhile: friends raid YOU → your troops + turrets defend → shield if you lose
```

A typical session lasts 1–3 minutes: collect what's finished, queue the next build and the next batch of troops,
send a raid, read reports, and message a friend. The app's job is to make those minutes satisfying and to bring the
player back with push notifications when something is ready or an attack is coming.

---

## 4. Resources

| Resource | Icon idea | Building | Used for |
|---|---|---|---|
| **Alloy** | ⛭ grey ingot | Alloy Extractor | Everything, mostly buildings and armour |
| **Plasma** | ⚡ blue cell | Plasma Tap | Weapons, vehicles, research-tier buildings |
| **Relic Shards** | ◆ teal crystal | Relic Dig Site (CC 5) | Gunships, Walkers, Titans, top-tier buildings |

**Production per hour at level L** (plus a free trickle of +20 Alloy and +10 Plasma per hour, so nobody can get stuck):

| Level | Alloy/h `30·L·1.1^L` | Plasma/h `20·L·1.1^L` | Relics/h `1·L·1.1^L` |
|---|---|---|---|
| 1 | 33 | 22 | 1.1 |
| 5 | 242 | 161 | 8.1 |
| 10 | 778 | 519 | 26 |
| 15 | 1,880 | 1,253 | 63 |
| 20 | 4,036 | 2,691 | 135 |

**Storage.** The Depot caps each resource at `5,000 · 1.3^(L−1)` (L10 ≈ 53k, L20 ≈ 730k). The Relic cap is 1/20 of that.
Production stops at the cap. That's the reason to log in.

**Protected storage.** The Vault protects `1,000 · 1.3^(L−1)` of Alloy and Plasma (≈20% of a Depot at the same level),
and 1/20 of that in Relics. Raiders can never take protected resources.

**Premium currency: Cores.** It exists in the database from day one with a balance of 0. It's hidden in the app until the shop
launches. See [Monetization](#12-monetization-later-designed-in-now).

---

## 5. Buildings

Every building is unique: you have **one of each** and upgrade it by level. **No building can be higher than the
Command Center.** You start with 1 builder, and a 2nd builder unlocks at CC 10.

`cost(L) = L1 cost × 1.45^(L−1)` and `time(L) = L1 time × 1.45^(L−1)`, unless noted.

| Building | What it does | Unlocks at | Max | L1 cost (A / P / R) | L1 time |
|---|---|---|---|---|---|
| **Command Center (CC)** | Caps other buildings and unlocks content. Above L10 it also costs Relics (`20·1.45^(L−10)`) | start | 20 | 250 / 150 / 0 | 2 min |
| **Alloy Extractor** | Alloy per hour | start | 20 | 60 / 30 / 0 | 1 min |
| **Plasma Tap** | Plasma per hour | start | 20 | 70 / 20 / 0 | 1 min |
| **Relic Dig Site** | Relic Shards per hour | CC 5 | 20 | 500 / 400 / 0 | 10 min |
| **Depot** | Storage cap | start | 20 | 100 / 50 / 0 | 1 min |
| **Vault** | Protected storage | CC 3 | 20 | 150 / 100 / 0 | 2 min |
| **Habitat** | Supply cap `20·L + 5·L²` (L1 25, L10 700, L20 2,400) | start | 20 | 80 / 40 / 0 | 1 min |
| **Barracks** | Trains infantry. −2% training time per level above 1 | start | 20 | 120 / 60 / 0 | 2 min |
| **Vehicle Bay** | Trains vehicles. −2% per level above 1 | CC 3 | 20 | 400 / 250 / 0 | 5 min |
| **Hangar** | Trains gunships. −2% per level above 1 | CC 8 | 10 | 1,500 / 1,200 / 40 | 30 min |
| **Titan Forge** | Trains Titans. Titan cap: 1 (L1), 2 (L3), 3 (L5) | CC 12 | 5 | 8,000 / 6,000 / 300 | 4 h · then 8 h, 16 h, 24 h, 36 h |
| **Sensor Array** | Scouting strength, incoming-attack warnings, map vision | CC 2 | 20 | 150 / 150 / 0 | 2 min |
| **Repair Bay** | After a defence, `10% + 1%·L` of your destroyed defending units come back (max 30%) | CC 4 | 20 | 300 / 300 / 0 | 5 min |
| **Sentry Turret** | Anti-infantry defence | CC 2 | 20 | 100 / 50 / 0 | 3 min |
| **Rail Turret** | Anti-armour defence | CC 5 | 20 | 200 / 120 / 0 | 6 min |
| **Flak Turret** | Anti-air defence | CC 8 | 20 | 250 / 180 / 0 | 10 min |
| **Perimeter Wall** | Absorbs half of incoming damage while it stands | CC 2 | 20 | 250 / 0 / 0 | 2 min |
| **Shield Generator** | Absorbs a fixed amount of damage every battle round | CC 10 | 10 | 1,500 / 1,500 / 50 | 1 h |

Rough feel: early upgrades take minutes, mid-game ones take hours, and CC 20 is ~39 h. Nobody should max
everything in one season, which leaves room to choose between economy, army and defence.

**Starting base:** CC 1, Alloy Extractor 1, Plasma Tap 1, Depot 1, Habitat 1, Barracks 1, 1,000 Alloy, 600 Plasma, 5 Troopers.

**Building rules**
- You pay the full cost when the upgrade starts. Cancelling refunds 100%.
- Upgrading a production building keeps it producing at its old level. Upgrading a turret keeps it defending at its old level.
- Buildings are **never** damaged or destroyed by raids (see [Stakes](#8-pvp-rules--stakes)).

---

## 6. Units

There's one shared roster for everyone. **Supply** is how much Habitat space a unit takes. **Carry** is how much loot it can bring home.
Speed is in **tiles per hour**.

| Unit | Class | ATK | HP | Speed | Carry | Supply | Cost (A / P / R) | Train time | Requires |
|---|---|---|---|---|---|---|---|---|---|
| **Wisp Drone** | Scout | 0 | 5 | 60 | 0 | 1 | 30 / 20 / 0 | 4 min | Sensor Array 1 |
| **Trooper** | Infantry | 12 | 40 | 10 | 25 | 1 | 60 / 20 / 0 | 3 min | Barracks 1 |
| **Breacher** | Infantry | 18 (×2.5 vs Vehicle & Titan) | 45 | 9 | 15 | 1 | 90 / 60 / 0 | 8 min | Barracks 3 |
| **Rattler Buggy** | Vehicle | 45 | 160 | 30 | 120 | 3 | 220 / 120 / 0 | **20 min** | Vehicle Bay 1 |
| **Mule Hauler** | Vehicle | 8 | 300 | 18 | 600 | 4 | 300 / 100 / 0 | 40 min | Vehicle Bay 2 |
| **Bulwark Tank** | Vehicle | 150 (×1.5 vs Infantry) | 900 | 12 | 100 | 8 | 700 / 350 / 0 | 1 h 30 min | Vehicle Bay 5 |
| **Kestrel Gunship** | Air | 200 (×1.5 vs Vehicle) | 550 | 40 | 250 | 10 | 900 / 700 / 15 | 3 h | Hangar 1 |
| **Hammerfall Walker** | Vehicle | 70 (×5 vs Structures) | 700 | 6 | 0 | 12 | 1,100 / 600 / 30 | 5 h | Vehicle Bay 10 |
| **Oruun Titan** | Titan | 1,200 | 9,000 | 5 | 1,500 | 40 | 6,000 / 4,000 / 250 | **12 h** | Titan Forge 1 (capped) |

**Roles in one line each**
- **Wisp Drone:** scouts. Sent alone on scout missions.
- **Trooper:** cheap all-rounder and the backbone of home defence.
- **Breacher:** the answer to tanks and Titans.
- **Rattler Buggy:** fast raider for hit-and-run on nearby bases.
- **Mule Hauler:** barely fights, carries a lot of loot. Bring it to big raids.
- **Bulwark Tank:** soaks damage and mows down infantry.
- **Kestrel Gunship:** fast, hits vehicles hard, only Flak really stops it.
- **Hammerfall Walker:** slow siege unit that knocks out turrets, walls and shields.
- **Oruun Titan:** a 12-hour investment. Huge, slow, and the thing every player wants.

**Training rules**
- Each training building has its **own queue**: Barracks, Vehicle Bay, Hangar and Titan Forge all train at the same time.
- Each queue trains one unit at a time, with up to 10 batches queued ("train 5 Rattlers" = five 20-minute slots in a row, each
  unit joining your army the moment it finishes).
- You pay the cost and reserve the Supply when you queue. Cancelling refunds 100% of units not yet started and 50% of the unit in progress.
- Building level shortens training time (−2% per level, Titans excluded: always 12 h).

**Damage multipliers** (anything not listed = ×1)

| Attacker → | Infantry | Vehicle | Air | Titan | Structure |
|---|---|---|---|---|---|
| Breacher | | ×2.5 | ×0.5 | ×2.5 | |
| Bulwark Tank | ×1.5 | | ×0.5 | | |
| Kestrel Gunship | | ×1.5 | | | |
| Hammerfall Walker | | | ×0.5 | | ×5 |
| Other ground units (non-Titan) | | | ×0.5 | | |
| Sentry Turret | ×2 | | ×0.5 | | — |
| Rail Turret | | ×2 | ×0.5 | ×2 | — |
| Flak Turret | ×0.3 | ×0.3 | ×3 | ×0.3 | — |

---

## 7. The world map

**Shape.** The Ring is a strip **2,400 tiles long × 40 tiles wide** that **wraps around** (x = 2,399 sits next to x = 0).
It's split into **40 sectors** of 60 × 40 tiles, each with a name and an Oruun Gate at its centre.

**Coordinates** are shown as `S14 · 852, 18` (sector, x, y).

**Spawning.** New players are placed in the newest open sector, next to other recent arrivals, until it holds ~60 bases.
Then the next sector opens. **Signing up with a friend's invite code puts you in the friend's sector** (as close
as space allows) and sends a friend request automatically.

**What's on a tile:** empty ground, a player base, or a **Blight Nest**. Later: relic sites and Oruun ruins.

**Travel time** = distance ÷ speed of the **slowest unit** in the army.
- Distance is measured in tiles, wrapping around the ring.
- Distance is straight-line: `√(dx² + dy²)`, where dx takes the shorter way around the ring.
- **Gate rule:** any trip longer than 40 tiles counts as **40 tiles**, because armies jump through the Gate network. So your friend
  on the far side of the Ring is never more than 4 h away for Troopers, 1 h 20 min for Rattlers, or 8 h for a Titan.
- Neighbours are typically 3–15 tiles away: 6–30 min by Rattler, 20–90 min on foot.
- The return trip takes the same time. Loot arrives with the army.

**Map vision.** You see every base and nest in your own sector. A higher Sensor Array shows more detail on bases
(power band, alliance later) and reveals adjacent sectors. Friends' bases are always visible wherever they are.

**Map screen (text-first):**
- **Nearby list** (default): sorted by distance, filterable by *Players / Friends / Nests*, each row showing name, coords,
  distance, travel time for your fastest attack-ready group, power band and shield icon.
- **Grid view**: an 11 × 11 tile window around a point, using symbols (`■` you, `●` friend, `○` player, `✶` nest, `·` empty),
  tap a tile to open it. You can pan, and type coordinates to jump.

### Blight Nests (NPC targets)
These are always available, so the game works when friends are offline and while only a handful of people are playing during the friends-first test.

| Nest level | Garrison (example) | Loot |
|---|---|---|
| 1 | 10 Crawlers | ~1,000 resources |
| 5 | 120 Crawlers, 20 Spitters, 3 Brutes | ~13,000 resources + 25 Relics |
| 10 | 600 Crawlers, 120 Spitters, 30 Brutes | ~40,000 resources + 50 Relics |

Loot ≈ `1,000 · n^1.6` resources (split Alloy/Plasma), plus `5·n` Relics from level 4 up.
Blight units: **Crawler** (Infantry, ATK 8, HP 30), **Spitter** (Infantry, ATK 30, HP 120, ×2 vs Air), **Brute** (Vehicle, ATK 90, HP 800).

- A partly-damaged nest keeps its losses and regenerates 10% of its garrison per hour.
- A cleared nest respawns elsewhere in the sector 1–3 h later. Target density is ~1 nest per 3 bases.
- Attacking a nest **doesn't** break your shield or beginner protection and has no daily limit.

---

## 8. PvP rules & stakes

**Who you can attack:** any base on your friends list (anywhere on the Ring) and any base in sectors you can see,
subject to these rules:

| Rule | Value |
|---|---|
| **Beginner protection** | 72 h after joining, or until CC 5, whichever comes first. You can't attack players or be attacked by them (nests are fine). Attacking a player ends it early. |
| **Shield** | A defender who **loses** a raid gets a **4 h shield**. Armies arriving at a shielded base turn back home with no battle and no loot, and the attacker is told. Attacking a player yourself ends your shield. |
| **Power gap** | You can't attack a base with **less than 40% of your Power**, unless it's **revenge** (they attacked you in the last 48 h). |
| **Repeat limit** | The same attacker can hit the same target at most **3 times per 24 h**. |
| **Armies out** | At most `2 + floor(CC/5)` armies away at once (CC 20 → 6). |

**What's at stake**
- **Troops:** both sides lose the units killed in the battle. The defender's Repair Bay brings back 10–30% of their losses.
- **Loot:** if the attacker wins, they take up to **20%** of each resource the defender holds **above Vault protection**
  (Relics: 10%), limited by the surviving army's total Carry and split evenly across resource types.
- **Salvage:** the defender recovers 20% of the Alloy cost of the attacking units they destroyed. Defending always pays something.
- **Buildings:** never damaged. Turrets that got knocked out are back online as soon as the battle ends.

This is deliberately forgiving. Friends should be able to raid each other every day without anyone getting wiped out
and quitting.

### Scouting
Send Wisp Drones on a **scout mission** (they travel like any army, at speed 60).
- **Strong enough** (your Wisps > 2 × their Sensor Array level + their home Wisps): full report with resources,
  home units, turret levels, wall/shield levels and building levels.
- **Too weak:** all Wisps are shot down, and you only learn the target's power band.
- The defender sees "You were scouted by *name*" if their Sensor Array is level 3 or higher.

### Incoming-attack warnings (by defender's Sensor Array level)

| Sensor Array | Defender sees |
|---|---|
| none | Warning 10 min before arrival, no details |
| 1–4 | Warning at launch, with attacker name and arrival time |
| 5–9 | + approximate total troop count |
| 10+ | + unit types in the army |

Every warning sends the **Incoming attack** push. To react, the defender can train more units, send their army away so it can't
be caught, spend resources so there's nothing to loot, or shield up (later: ask a friend to reinforce, in v1.1).

**Recall:** an army that hasn't arrived yet can be recalled. It turns around and gets home after the time it has
already spent travelling.

---

## 9. Battle resolution

The server resolves every battle. The client never decides outcomes. Battles are **deterministic for a given seed**
(the seed is stored with the report), so any report can be replayed and checked.

**Sides**
- **Attacker:** the units in the army (scouts and haulers included; they're targets too).
- **Defender:** every unit at home, plus Sentry, Rail and Flak turrets (each acts as one combat stack with ATK and HP that
  scale linearly with level), plus the Wall and Shield Generator as modifiers.

| Structure | ATK per level | HP per level |
|---|---|---|
| Sentry Turret | 25 | 250 |
| Rail Turret | 60 | 400 |
| Flak Turret | 40 | 300 |
| Perimeter Wall | 0 | 1,000 (soaks 50% of incoming damage until broken) |
| Shield Generator | 0 | absorbs 300 damage per round per level, recharges every round |

**Algorithm (up to 4 rounds)**
```
for round in 1..4:
  both sides fire at the same time:
    for each stack S with count > 0:
      damage = S.count × S.atk × random(0.9 .. 1.1)            # seeded
      split damage over enemy stacks in proportion to (count × HP)  # big stacks soak more
      apply the multiplier table for each target's class
  on the defender side, incoming damage is reduced in this order:
      1. Shield Generator absorbs up to its per-round amount
      2. if the Wall has HP left, 50% of the rest goes into the Wall
  casualties per stack = floor((damage + carried partial damage) / unit HP); remainder carries to the next round
  stop early if either side has no combat stacks left

result:
  attacker wins → defender has no units AND all turrets are knocked out
  defender wins → attacker has no units left
  otherwise     → draw: attacker goes home with no loot
```

**Battle reports** are stored for the season and show up in both players' Reports inbox. They're plain text with light
formatting, and can be **shared into a DM** for bragging rights. Example (illustrative numbers):

```
⚔ RAID ON IRON HOLLOW (dave) · S14 · 852, 18
VICTORY · 3 rounds · Thu 21:42

YOUR FORCE            SENT   LOST
Trooper                 40      5
Rattler Buggy           10      1
Mule Hauler              3      0

DEFENDERS             HOME   LOST
Trooper                 12     12   (2 patched up by Repair Bay)
Breacher                 2      2
Sentry Turret L2         —   knocked out
Perimeter Wall L1        —   breached in round 3

LOOT   2,400 Alloy · 1,340 Plasma · 1 Relic Shard
       (carry 3,741 / 3,755)
Your army is heading home. Arrives 22:24.

R1  Your force slams into the wall. 5 defending Troopers fall.
    Return fire drops 2 of your Troopers.
R2  The wall buckles. Their Breachers wreck a Rattler before going down.
R3  The wall is breached and the Sentry Turret goes dark. Iron Hollow falls.
```

---

## 10. Seasons

- **Length:** ~90 days. A fixed start time (e.g. Friday 18:00 SAST, to be confirmed). The app shows a countdown to the end of the season from day 1.
- **New Ring every season:** a new map, and every base starts again from the starting base.
- **What carries over:** username, password, friends, DMs, badges, titles, cosmetic items, Cores (later),
  season history ("Season 3: #12 Power, 41 raids won").
- **Late joiners:** a **Frontier Boost** of +1% production per day since the season started (max +100%), lasting
  7 days from the day you join, so starting late isn't hopeless.
- **Leaderboards (live):**
  - **Power:** `(resources spent on buildings + value of living units) / 1,000`, with Relics counting ×20.
  - **Raiders:** resources stolen this season.
  - **Defenders:** enemy Supply destroyed while defending.
  - **Friends board:** the same three stats among just you and your friends. This is the most important board for the friends-first launch.
- **Rewards (cosmetic only):** badges for the top 10 / top 100 / top 10%, a "Survivor" badge for anyone who reaches CC 10,
  a title for the #1 player on each board, and an unlockable base nameplate colour.
- **Last 7 days, later (v1.1):** the *Reclamation* event, a lore-driven finale with special nests and double score.

---

## 11. Social

### Friends
- **Add by username** or by **invite code** (each player has a permanent 6-character code like `RF-7KQ2M`).
- **Share invite** opens the native share sheet with a link (`https://ringfall.app/i/7KQ2M`). It opens the app if it's
  installed and the store if it isn't. Someone who signs up through it spawns in the inviter's sector and is friended automatically.
- Requests need accepting. You can decline, remove or block. Max 100 friends.
- Each row in the friends list shows base name, coords, power, a shield icon, last seen, and quick actions: **Message · Scout · Attack**.

### Direct messages
- **Between friends only** (cuts spam and keeps moderation small).
- Text and emoji, 500 characters per message. Unread badges. Push on new messages (respecting quiet hours).
- **Share a battle report** into a chat as a card.
- **Safety (required for the App Store):** a word filter on send, **block** and **report** on every chat and profile, and a reports
  queue in a simple admin tool. Blocking also stops friend requests from that player.
- DMs are kept across seasons.

### Later (v1.1+)
Reinforce a friend (send troops to defend their base), alliances/clans with alliance chat, world chat (needs moderation tooling first).

---

## 12. Monetization (later, designed in now)

Nothing is for sale at launch. These are built into the data model so they can be switched on without migrations:

- **Wallet + ledger tables** for **Cores** (premium currency). Every change is an append-only ledger row with a reason.
- **Feature flags** (`shop_enabled`, `ads_enabled`) served by the API, so they can be turned on per platform without an app update.

**Rewarded ads (phase 2):** "Watch an ad: −15 min on this timer", max 5 per day per player. Use Google AdMob rewarded ads.
**The reward is only granted when AdMob's server-side verification callback hits our server**, never on the client's word.

**Shop (phase 2/3):** sell Cores through Apple and Google in-app purchases (e.g. via RevenueCat), with server-side receipt validation.
Things to spend Cores on:
- Finish a timer now (cost scales with time remaining)
- A temporary 3rd builder (e.g. 7 days)
- Cosmetics: base skins, nameplate colours, report-card themes, profile frames
- **Guardrails:** no buying units or Titans directly, and resource packs capped per day. Raids between friends should be
  won by playing, not paying.

---

## 13. Tech stack

**Monorepo (new repository)** using pnpm workspaces:
```
ringfall/
  apps/mobile/     Expo (React Native) + TypeScript, Expo Router
  apps/server/     Node.js (LTS) + TypeScript, Fastify, WebSocket
  apps/admin/      tiny web admin: reports queue, bans, feature flags, season control (can come later)
  packages/rules/  ALL game numbers + formulas + battle sim, pure TS, shared by app and server
```

| Concern | Choice | Why |
|---|---|---|
| App | Expo + React Native + TypeScript | One codebase for iOS and Android. EAS Build for TestFlight / Play internal testing. EAS Update for over-the-air fixes |
| Server | Node.js + Fastify | Same language as the app, so the rules package is shared |
| Database | PostgreSQL on Neon (project `ringfall`, region eu-central-1) | Transactions and row locks keep resources and battles consistent |
| ORM | Drizzle | Typed SQL with simple migrations |
| Timers / jobs | pg-boss (job queue inside Postgres) | No Redis needed at this scale. Jobs survive restarts |
| Live updates | WebSocket per logged-in user | Timers finishing, incoming attacks and new messages show instantly in-app |
| Push | Expo Notifications + Expo Push API | One API that delivers to both APNs and FCM |
| Hosting | Fly.io / Railway / Render (one region) | Cheap at friends-test scale. Async gameplay means latency barely matters |
| Errors / analytics | Sentry, plus simple event analytics (e.g. PostHog) | Crash reports, tutorial funnel, D1/D7 retention |

### Server-authoritative timers ("settle")
Nothing runs on a tick loop. Each base stores a resource snapshot and the time it was taken, and every timed thing
(builds, training, armies) is a row with an `ends_at` timestamp.

- **`settle(base, until)`** runs inside a DB transaction with the base row locked (`SELECT … FOR UPDATE`). It walks forward in time,
  **processing events in chronological order**: accrue resources up to the next event, complete it (building done,
  unit trained, army arrived, army returned), and repeat until `until`.
- **Every API call that reads or changes a base settles it to `now` first.** The game stays correct even if a background
  job runs late.
- **pg-boss** schedules a job at each `ends_at` so that the work happens even when nobody opens the app: battles get
  resolved, pushes get sent, and the WebSocket gets told.
- **Battles:** when an army arrives, settle the **defender to the arrival time** first, because resources and troops at that
  moment are what count. Then resolve the battle, write both reports, and schedule the return.
- Jobs are **idempotent**: an event that's already processed is skipped, so retries are safe.
- The client only displays countdowns. On login it syncs its clock offset with server time and never trusts the phone's clock.

### Data model (main tables)
```
users            id, username (unique, case-insensitive), password_hash (argon2id), recovery_email?, invite_code,
                 created_at, banned_at?
refresh_tokens   id, user_id, token_hash, expires_at, revoked_at
push_tokens      user_id, expo_token, platform, prefs (per-type toggles, quiet hours)
seasons          id, name, ring_seed, starts_at, ends_at, status
sectors          season_id, index, name, base_count, open
bases            id, season_id, user_id, name, x, y, sector,
                 alloy, plasma, relics, resources_at,         # snapshot + timestamp
                 protection_until, shield_until, power
buildings        base_id, type, level
build_queue      id, base_id, type, to_level, started_at, ends_at
units            base_id, unit_type, count                    # at home
train_queue      id, base_id, building, unit_type, qty_total, qty_done, unit_seconds, started_at
armies           id, base_id, target (base_id | nest_id), mission (attack | scout | reinforce*),
                 units jsonb, loot jsonb, departs_at, arrives_at, returns_at, status, recalled_at?
battle_reports   id, season_id, attacker_base, defender_base | nest, seed, result jsonb, text, created_at
nests            id, season_id, x, y, level, garrison jsonb, regen_at
friendships      user_a, user_b, created_at                   # stored once, a < b
friend_requests  id, from_user, to_user, status, created_at
blocks           blocker, blocked
conversations    id, user_a, user_b, last_message_at
messages         id, conversation_id, sender, body, report_id?, created_at, flagged
reports_abuse    id, reporter, target_user, message_id?, reason, status
wallets          user_id, cores                               # 0 until the shop launches
wallet_ledger    id, user_id, delta, reason, ref, created_at
leaderboards     season_id, board, user_id, score, rank       # refreshed every few minutes
attack_log       attacker_base, target_base, at               # repeat-limit + revenge checks
feature_flags    key, value, platform?
```

### API (REST + one WebSocket)
```
POST   /auth/register            {username, password, inviteCode?}
POST   /auth/login | /auth/refresh | /auth/logout
POST   /auth/password            change password
DELETE /account                  in-app account deletion (App Store requirement)

GET    /me/base                  full settled base state (resources, buildings, queues, units, armies, incoming)
POST   /base/buildings/:type/upgrade
POST   /base/train               {unitType, qty}
DELETE /base/queue/:id           cancel a build or training batch

GET    /map?x=&y=&radius=        tiles around a point
GET    /map/nearby?filter=       nearby list
GET    /bases/:id                public profile of a base
POST   /armies                   {targetId, mission, units}  → returns arrival time
POST   /armies/:id/recall

GET    /reports?cursor=  ·  GET /reports/:id

GET    /friends  ·  POST /friends/requests {username | code}
POST   /friends/requests/:id/accept | /decline  ·  DELETE /friends/:userId
POST   /blocks/:userId  ·  POST /abuse-reports

GET    /conversations  ·  GET /conversations/:id/messages?cursor=
POST   /conversations/:id/messages {body | reportId}

GET    /leaderboards/:board?scope=global|friends
POST   /push-tokens
GET    /config                   feature flags, season info, server time, rules version

WS     /live                     events: build_done, train_done, army_returned, incoming_attack,
                                 report_new, message_new, friend_request, shield_changed
```

### Accounts & security
- Usernames: 3–16 characters (letters, digits, `_`), unique regardless of case, profanity-filtered, can't be changed during a season.
- Passwords: at least 8 characters, hashed with **argon2id**, login rate-limited per IP and per username.
- Sessions: 15-minute access token plus a 30-day rotating refresh token, stored in the phone's **SecureStore**.
- **Password recovery:** with username-only accounts, a forgotten password means a lost account. The recommendation is an
  **optional recovery email** in Settings (see [Open questions](#17-open-questions)).
- Anti-cheat: the server decides everything, every action is validated (costs, levels, supply, limits),
  and there are per-endpoint rate limits. Watch for **farm accounts** (alts created to feed a main through raids) by flagging
  raids between accounts that share a device ID or IP and send resources only one way.

### Testing
- `packages/rules`: unit tests (Vitest) for every formula, plus a **balance simulator CLI**
  (`pnpm sim "40 trooper, 10 rattler" vs "12 trooper, 2 breacher, sentry:2, wall:1" --runs 1000`).
- A check that every `cost(L)` fits in the Depot at the level that's needed, so no upgrade can be impossible.
- Server integration tests for `settle` ordering, for example "army arrives 1 s before the defender's Titan finishes training".
- A load test before the public launch.

---

## 14. App screens (text-first, light art)

**Style:** a dark theme with Oruun-teal accents, clean cards, a monospaced font for numbers and timers, small flat icons for
resources, buildings and units. Every list item is a tappable text row. It should read like a MXit game and
feel like a 2026 app.

**Bottom tabs:** `Base · Army · Map · Reports · Social`

```
┌──────────────────────────────────┐
│ IRON HOLLOW        S14 · 852, 18 │
│ ⛭ 14,210 / 40,786      +778/h    │
│ ⚡  8,904 / 40,786      +519/h    │
│ ◆    120 /  2,039        +8/h    │
│ 🛡 Shield 3h 12m                  │
├──────────────────────────────────┤
│ ⚠ INCOMING  Vex · arrives 41:08  │
│ ⚒ Plasma Tap → L11      2:14:09  │
│ ⚙ Rattler 3/5           0:12:40  │
│ ➜ Raid → Blight Nest L4  0:18:22 │
├──────────────────────────────────┤
│ BUILDINGS                        │
│ Command Center   L9   [Upgrade]  │
│ Alloy Extractor  L10  [Upgrade]  │
│ Plasma Tap       L10  building…  │
│ …                                │
├──────────────────────────────────┤
│ Base   Army   Map   Reports  Social │
└──────────────────────────────────┘
```

| Screen | Contents |
|---|---|
| **Sign up / Log in** | Username, password, optional invite code. Links to privacy policy and terms |
| **Tutorial** (5 steps) | Upgrade the Alloy Extractor, train 5 Troopers, raid a Blight Nest L1, read the report, add a friend / share your code |
| **Base** | Resource bar (amount / cap, rate), shield/protection timer, active timers (incoming attacks pinned on top in red), building list |
| **Building detail** | What it does now vs at the next level, cost, time, the requirement it's missing (if any), Upgrade/Cancel |
| **Train** (per training building) | Unit cards (icon, stats, cost, time), a quantity stepper with a "max affordable" button, the queue with countdowns |
| **Army** | Units at home, armies out (mission, target, countdown, Recall), incoming attacks with whatever the Sensor Array reveals |
| **Map** | Nearby list / grid toggle, filters, coordinate jump. Tapping a base opens its profile: **Scout · Attack · Add friend · Message** |
| **Send army** | Pick units (presets: "all Rattlers", "raid party"), live travel time, arrival clock, total carry, and the rule that blocks you if one applies (shielded, power gap, repeat limit) |
| **Reports** | Inbox of battle and scout reports with win/loss/draw tags, opening the full text report. Share to DM |
| **Social → Friends** | Friend list, requests, add by username/code, share invite, Friends leaderboard |
| **Social → Messages** | Conversation list and chat view with block/report in the menu |
| **Leaderboards** | Power / Raiders / Defenders, Global vs Friends, the season countdown |
| **Profile** | Commander name, badges, season history, invite code |
| **Settings** | Change password, recovery email, per-type notification toggles, quiet hours, sound/haptics, privacy policy, support contact, log out, **delete account** |
| **Shop** | Hidden behind `shop_enabled` |

### Push notifications
| Type | Example | Notes |
|---|---|---|
| Building done | "⚒ Plasma Tap reached level 11." | One per building |
| Training done | "⚙ 5 Rattler Buggies are ready." | **One per finished batch**, not per unit |
| Incoming attack | "⚠ Vex is attacking Iron Hollow! Arrives 21:42." | Always sent, ignores quiet hours |
| Friend request | "dave wants to be your friend." | |
| Message | "dave: you're next 😈" | Bundled when several arrive at once |

Battle reports aren't pushed (not chosen). They show as an in-app badge on the Reports tab. Every type can be
switched off, and **quiet hours** (default 23:00–07:00) hold everything except incoming attacks until morning.

---

## 15. Store & compliance checklist
- **Account deletion inside the app** (Apple requires it for apps with account creation).
- **User-generated content (DMs):** content filter, report, block, and a published support contact (Apple guideline 1.2).
- Privacy policy URL, App Store privacy labels, Google Play Data Safety form. Data collected: username, optional email,
  push token, messages, gameplay events, crash logs.
- Age rating questionnaire: sci-fi combat violence plus user-to-user messaging. Expect a teen-level rating, to be confirmed in both stores' forms.
- With username/password login only, **Sign in with Apple isn't required**. That changes if Google/Facebook login is ever added.
- Ads/IAP (later): ATT prompt on iOS before personalised ads, and the store-billing rules for digital goods.

---

## 16. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | **Rules package** | Every number in this spec is in code, the formulas are tested, and the balance sim CLI runs battles |
| M1 | **Accounts + base** | Register/login, starting base, resources accrue, building upgrades with timers, `settle` |
| M2 | **Units + push** | Training queues, Supply, push notifications for builds and training |
| M3 | **Map + war** | Ring generation, sectors, nests, armies with travel, battle resolution, reports, scouting, recall |
| M4 | **Social + PvP rules** | Friends, invite codes and links, DMs with block/report, shields, protection, power gap, limits, incoming push |
| M5 | **Season + friends test** | Leaderboards, season start/end, tutorial, admin tool, TestFlight + Play internal test with 10–100 friends |
| M6 | **Balance + public prep** | Balance pass from test data, load test, store listings, privacy docs, then the public launch |
| M7 | **Money** | Rewarded ads (AdMob with server-side verification), then the shop (IAP with receipt validation) |

v1.1+: reinforce friends, alliances, world chat, the Reclamation finale event, a research lab, relic sites on the map.

---

## 17. Open questions
1. **Power gap and friends.** Should a strong player be able to raid a much weaker *friend*? (Draft: the 40% rule applies to
   everyone, revenge excepted.) Alternative: friends can always attack each other.
2. **Recovery email.** Add an optional email for password resets? (Recommended. Otherwise a forgotten password means a lost account.)
3. **DMs friends-only?** The draft assumes yes.
4. **Battle report push.** Not chosen. Is an in-app badge enough, or should a lost defence be pushed?
5. **Season timing.** Start day/time and time zone. Is MXit-era South Africa the main audience?
6. **Art.** Commissioned icons, an icon pack, or generated icons for units, buildings and resources?
7. **Name check.** Confirm "Ringfall" is free in both stores and as a trademark.
8. **Titans.** Is a cap of 3 per base right, and should a Titan ever be lost in a raid, or only "disabled" for 12 h?
