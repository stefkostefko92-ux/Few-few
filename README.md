# Nexus Dominion

A modern, full-stack browser MMORPG inspired by the classic **Nexus Dominion** —
turn-based fantasy combat with quests, classes, skills, equipment, and a PvP arena.
Built for VPS deployment, designed to feel enterprise-grade end to end.

> Stack: Node.js + Express + better-sqlite3 + JWT on the server,
> React + Vite + TypeScript + Zustand on the client, all packaged in a single
> production Docker image (with an optional bundled Caddy/TLS reverse proxy).

---

## Features

### Public landing page
- A cinematic, gold-and-ember-drifting marketing page at `/` with hero
  fighters, feature grid, class showcase, world tour, daily-engagement
  pitch, and conversion CTAs. Unauthenticated visitors land here; signed-in
  players are deep-linked straight to `/app`.

### Daily engagement
- **Daily Tribute** — 7-day login streak with stacking gold/XP rewards
  and milestone potions at days 7, 14, and 30.
- **Daily Quests** — 3 rotating quests every 24 hours; complete them as
  part of normal play for 2× XP and 2× gold bonuses.
- **Wheel of Fortune** — one animated spin per day, weighted draws for
  gold, XP, potions, rings, energy, or the 500-gold royal jackpot.
- **Hunting Grounds** — repeatable random encounters per region, 2 energy
  each, perfect for endless XP/gold farming and bestiary completion.
- **Multi-stage Dungeons** — 4 dungeons (Forgotten Crypt, Orc Warcamp,
  Caverns Descent, Pilgrimage of Ash). Survive every stage to claim a sack
  of loot and a guaranteed item.
- **27 Achievements + Titles** — level milestones, monster-slayer tiers,
  arena ratings, gold milestones, streak goals, bestiary completion.
  Earned titles can be set as your active display name suffix.
- **Bestiary** — 17 monsters to discover, each tracked with kill counts,
  first/last killed dates, family, and lore.
- **Lifetime Statistics** — Battles, win rates, monsters slain, dungeons
  cleared, quests completed, gold/XP earned, journey length, streaks.

### Gameplay
- **Four classes** with distinct stats, sprites, and damage profiles:
  Warrior, Ranger, Mage, Rogue.
- **Stat & skill progression** — every level grants 3 stat points and 2 skill
  points to allocate across STR / DEX / CON / INT / WIS / CHA and weapon
  skills (Sword, Axe, Bow, Staff, Magic, Stealth).
- **5 regions** with 16 hand-written quests and 17 monster types, from the
  Whispering Woods to the Shadowfell (Lv 1 → 25).
- **37 unique items** across 5 rarities (common → legendary), with full
  equipment slots (weapon, offhand, helm, armor, gloves, boots, ring, amulet).
- **Energy system** — quests cost energy; energy regenerates over time.
- **Arena** with ELO-style matchmaking and a global leaderboard.
- **Rest, mail, shop, item drops, sell-back economy.**

### Combat
Every fight is rendered as a fully **animated cinematic turn-based duel**:
- Hand-drawn SVG sprites for both hero classes and foes (goblins, wolves,
  trolls, dragons, etc.).
- Idle bob, attack lunges, hurt flashes, dodge fades, and final defeat
  collapse animations.
- Floating damage numbers, crit bursts, miss/dodge/block callouts.
- Class-specific impact effects: warrior **slash**, mage **arcane bloom**,
  ranger **arrow streak**, rogue **piercing flash**.
- Screen shake on critical hits, drifting ember skybox, parallax ground.
- A scrolling combat log with round-by-round narration.
- Animated victory/defeat banners with reward pills.

### UI / UX
- **Enterprise-grade navbar**: brand mark, primary nav, live HP/Energy/Gold
  pills, profile dropdown — sticky, blurred backdrop, gold-thread highlight
  accent.
- **Dark fantasy design system**: Cinzel display + Inter body, gold/crimson/
  emerald/sapphire/amethyst accents, custom CSS variables, panels with
  layered shadows and gradient borders.
- Two-column app shell (sidebar + content) with grouped navigation
  sections, vitals card, and active-route indicators.
- Toast notifications, loading bars, rarity-tinted item cards, rich tooltips.

### Engineering
- Full **TypeScript** on both sides, strict mode.
- **JWT authentication** with bcrypt password hashing.
- **better-sqlite3** for synchronous, transactional, single-file persistence —
  perfect for a single-VPS deployment.
- Rate-limited auth endpoints, Helmet security headers, structured error
  responses, Zod input validation.
- **Workspaces monorepo** (npm) with one-shot `npm run dev` (concurrently),
  `npm run build`, `npm start`.
- Multi-stage Docker build → single small Alpine runtime image.
- `docker compose up -d` deploys app + Caddy (auto-HTTPS).
- **Server unit tests** (node's built-in test runner via `tsx`) cover the
  combat engine and progression math (`npm test --workspace server`).
- **15 NPC training dummies** seeded into the arena so PvP matchmaking
  works from day one. NPC ratings are frozen to keep encounters consistent.
- Database **backup script** (`deploy/backup.sh`) for SQLite hot snapshots.

---

## Architecture

```
Few-few/
├── server/                  # Express + SQLite backend
│   ├── src/
│   │   ├── db/              # schema + connection
│   │   ├── game/            # combat engine, progression, derived stats
│   │   ├── routes/          # auth / character / inventory / shop / quest / arena / mail
│   │   ├── middleware/      # JWT auth
│   │   ├── seed/            # items / monsters / quests + seed runner
│   │   ├── types/           # shared domain types
│   │   └── server.ts        # entry
│   └── dist/                # compiled JS (built)
├── client/                  # React + Vite SPA
│   ├── src/
│   │   ├── pages/           # Login, Register, Character, Dashboard, Quests, QuestRun, Arena, Shop, Inventory, World, Leaderboard, Mail, History, Settings, Help, NotFound
│   │   ├── components/      # Navbar, Sidebar, Toasts
│   │   ├── combat/          # CombatScene + SVG sprites
│   │   ├── lib/             # api client, zustand store, types, icons
│   │   ├── styles/          # design system globals + combat scene CSS
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── dist/                # built SPA (served by Express in prod)
├── deploy/
│   ├── Caddyfile            # HTTPS auto-cert reverse proxy
│   ├── nginx.conf           # alternative nginx config
│   ├── nexus-dominion.service       # systemd unit
│   └── entrypoint.sh        # seeds DB on first boot
├── Dockerfile               # multi-stage build
├── docker-compose.yml       # app + caddy
├── .env.example
└── README.md
```

The Express server serves the API under `/api/*` **and** the built React SPA
at `/`. There is only one process to run.

---

## Quick start

### Local development

```bash
git clone <this-repo> nexus-dominion
cd nexus-dominion
npm install
cp server/.env.example server/.env       # change JWT_SECRET!
npm run seed --workspace server          # populate items / monsters / quests
npm run dev                              # starts server (4000) + Vite (5173)
```

Then open <http://localhost:5173>. The Vite dev server proxies `/api/*` to
the Express backend.

### Production build (no Docker)

```bash
npm install
npm run build       # builds client and server
npm run seed --workspace server
PORT=4000 NODE_ENV=production JWT_SECRET="$(openssl rand -base64 48)" \
  DB_PATH=./server/data/nexus-dominion.db node server/dist/server.js
```

Then open <http://localhost:4000>.

---

## VPS deployment (recommended)

### Option A — Docker Compose (one-line deploy)

This brings up the game **plus an auto-HTTPS reverse proxy**.

```bash
# On your VPS
git clone <this-repo> /opt/nexus-dominion
cd /opt/nexus-dominion
cp .env.example .env
# Edit .env — set:
#   JWT_SECRET   to a long random string
#   DOMAIN       to e.g. nexus-dominion.yourdomain.com (must point at the VPS IP)
nano .env

docker compose up -d --build
```

Then browse to `https://your-domain` (Caddy obtains a Let's Encrypt cert
automatically on first request). The SQLite database is stored in a
docker-managed volume, so updates / re-deploys don't lose data:

```bash
docker compose pull && docker compose up -d --build  # zero-downtime restart
```

### Option B — Native node + systemd + nginx

```bash
# Install Node 20 LTS, nginx, certbot on Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nodejs npm nginx certbot python3-certbot-nginx

# Set up app
sudo adduser --disabled-password --gecos "" nexus-dominion
sudo mkdir -p /opt/nexus-dominion
sudo chown nexus-dominion:nexus-dominion /opt/nexus-dominion
sudo -u nexus-dominion bash -c '
  cd /opt/nexus-dominion
  git clone <this-repo> .
  npm ci
  npm run build
  npm run seed --workspace server
  cp .env.example .env
  sed -i "s/replace-me-with-a-long-random-string/$(openssl rand -base64 48)/" .env
'

# systemd service
sudo cp /opt/nexus-dominion/deploy/nexus-dominion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-dominion

# nginx
sudo cp /opt/nexus-dominion/deploy/nginx.conf /etc/nginx/sites-available/nexus-dominion
sudo ln -sf /etc/nginx/sites-available/nexus-dominion /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d nexus-dominion.yourdomain.com
```

The service runs as user `nexus-dominion`, restarts on failure, and stores its
SQLite database in `/opt/nexus-dominion/server/data/`.

---

## API

All authenticated endpoints require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/health` | Liveness probe |
| `POST` | `/api/auth/register` | Create account → `{ token, user }` |
| `POST` | `/api/auth/login` | Sign in |
| `GET`  | `/api/character/me` | Current character + derived stats |
| `POST` | `/api/character/create` | Create one (name, class) |
| `POST` | `/api/character/stats/spend` | Allocate stat points |
| `POST` | `/api/character/skills/spend` | Allocate skill points |
| `POST` | `/api/character/rest` | Restore HP/MP (-10 EN) |
| `GET`  | `/api/inventory` | List inventory |
| `POST` | `/api/inventory/equip` | Equip an item |
| `POST` | `/api/inventory/unequip` | Unequip |
| `POST` | `/api/inventory/use` | Use a potion |
| `POST` | `/api/inventory/sell` | Sell back |
| `GET`  | `/api/shop` | Items in merchant inventory |
| `POST` | `/api/shop/buy` | Buy an item |
| `GET`  | `/api/quest` | Quests available at current level |
| `POST` | `/api/quest/start` | Resolve a quest (combat → returns full round log) |
| `GET`  | `/api/quest/log` | Completed quests |
| `GET`  | `/api/arena/opponents` | Matchmade opponents |
| `POST` | `/api/arena/challenge` | Fight another character |
| `GET`  | `/api/arena/leaderboard` | Global rating board |
| `GET`  | `/api/mail` | Inbox |
| `POST` | `/api/mail/:id/read` | Mark read |
| `DELETE` | `/api/mail/:id` | Delete |
| `GET`  | `/api/combat/history` | Recent battles (last 50) |
| `GET`  | `/api/combat/history/:id` | Full battle replay (hero + foe + rounds) |
| `GET`  | `/api/account/me` | Account info |
| `POST` | `/api/account/password` | Change password |
| `POST` | `/api/account/delete-character` | Delete character (requires `confirm:"DELETE"`) |
| `GET`  | `/api/daily` | Streak + next reward (canClaim flag) |
| `POST` | `/api/daily/claim` | Claim today's tribute (gold + XP + milestone items) |
| `GET`  | `/api/daily/quests` | Today's 3 rotating quests with 2× bonuses |
| `POST` | `/api/daily/quests/claim` | Claim 2× bonus after completing a daily quest |
| `GET`  | `/api/wheel` | Wheel state (canSpin, segments) |
| `POST` | `/api/wheel/spin` | Spin once per day; returns weighted reward |
| `GET`  | `/api/hunting/regions` | Region list with monster counts + level gates |
| `POST` | `/api/hunting/hunt` | Cheap (2 EN) random fight in a region |
| `GET`  | `/api/dungeon` | List dungeons + active run state |
| `POST` | `/api/dungeon/enter` | Pay energy and start a multi-stage run |
| `POST` | `/api/dungeon/advance` | Resolve next stage of the active run |
| `POST` | `/api/dungeon/claim` | Claim rewards after clearing the final stage |
| `POST` | `/api/dungeon/abandon` | Discard the active run |
| `GET`  | `/api/achievements` | All achievements + unlocked flags + earned titles |
| `POST` | `/api/achievements/title` | Set your active title (must have earned it) |
| `GET`  | `/api/bestiary` | 17 monsters with discovery + kill counts |
| `GET`  | `/api/stats` | Lifetime statistics dashboard |

Combat resolution is **server-authoritative**. `POST /api/quest/start` and
`POST /api/arena/challenge` simulate the entire fight on the server and
return the round-by-round log + final state. The client then plays that
log out cinematically — the player never sees combat dice from the
client.

---

## Game design notes

- **Initiative** by speed; ties go to the hero. Speed scales with DEX.
- **Defense** uses diminishing returns: `dmg *= 1 - DEF / (DEF + 50)`.
- **Crit** = `1.8×`. **Dodge** & **miss** roll first; **block** triggers
  on defenders with non-trivial defense.
- **XP curve**: `50 × level^1.7`. Each level: +3 stat, +2 skill, +10
  HP_max, +4 MP_max.
- **Energy regen**: +1 per 6 minutes, capped at `energy_max`.
- **Loss penalty**: −10% gold. Hero is left at 1 HP, not killed.
- **Arena**: ELO with K=32; rating clamped at 0.

---

## Configuration

| Env | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP listen port |
| `JWT_SECRET` | — | **Required.** Long random string. |
| `JWT_EXPIRES_IN` | `7d` | JWT lifetime |
| `DB_PATH` | `./data/nexus-dominion.db` | SQLite file path |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `NODE_ENV` | `development` | `production` quiets request logs |
| `DOMAIN` | `nexus-dominion.example.com` | Used by the bundled Caddyfile |
| `RESEED_ON_BOOT` | `1` | Run the seed (idempotent) on each container start |

---

## Roadmap (good first issues)

- Guilds / clans
- Trading & player auction house
- Crafting (smithy, alchemy)
- Daily quests + login streak rewards
- World boss timed events
- WebSocket spectator mode for arena fights
- Mobile-first responsive polish for combat scene
- Admin dashboard

---

## License

For personal / educational use.
