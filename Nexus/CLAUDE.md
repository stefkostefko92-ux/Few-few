# Nexus/ — Nexus Dominion (браузър MMORPG)

Full-stack browser MMORPG: turn-based fantasy combat with quests, classes, skills,
equipment and a PvP arena. Designed for VPS deployment as a single production
Docker image (optional bundled Caddy/TLS). Root rules live in the repo-root
`CLAUDE.md`.

_Stack: server — Node.js · Express · better-sqlite3 · JWT; client — React · Vite ·
**TypeScript** · Zustand. npm **workspaces** (`server`, `client`)._

## Commands (run at `Nexus/` root)

```bash
npm run dev              # concurrently: server + client (blue/magenta)
npm run build            # build server then client
npm start                # node server/dist/server.js (serves built client)
npm run seed             # seed the SQLite DB
```

## Layout

```
server/           Express API + better-sqlite3 + JWT (game logic, combat resolution)
server/src/, server/scripts/
client/           React + Vite + TS + Zustand SPA
client/src/, client/public/
deploy/           Docker / Caddy deploy assets
docs/             design + deployment notes
```

## Conventions (important)

- **Server-authoritative:** all combat, loot, economy and progression are resolved
  and validated **on the server** — the client only renders and sends intents. Never
  trust client-reported outcomes.
- **Auth:** JWT; keep the signing secret out of the repo (`.env`, see `.env.example`).
- **SQLite (better-sqlite3):** synchronous API; use prepared statements /
  transactions; note better-sqlite3 constraints (e.g. bound params not allowed
  inside virtual-table module arguments).
- Client is strict TypeScript + Zustand for state.
- **SEO head is server-rendered per request** (`server/src/lib/seoHead.ts`): `/?lang=it|bg`
  get their own `<html lang>`, title, description and a SELF canonical; app screens get
  `noindex, follow` and no canonical/hreflang. Locale strings live in
  `client/public/seo-locales.json` (the landing imports the same file).
- **IndexNow:** key in `client/public/indexnow-key.txt` (public by design). `autodeploy.sh`
  does not ping Nexus — after page/sitemap changes run, from the repo root,
  `node tools/seo/indexnow.mjs https://nexus.carbonstealth.eu`.
- Ship as one Docker image (`Dockerfile` + `docker-compose.yml`).
