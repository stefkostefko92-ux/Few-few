# Few-few

Работно хранилище за **KAGURA SPIN** (神楽スピン — *Realm of Spirits*) — anime social-casino / build-raid игра за iOS и Android.

## Документация

- [KAGURA SPIN — Game Design Document & Пазарно проучване (v1.0)](docs/KAGURA_SPIN_GDD.md)

Документът покрива core gameplay loop, икономика, монетизация, арт направление, техническа архитектура, юридическо съответствие, roadmap и KPI.

## Код

- [`backend/`](backend/) — server-authoritative backend на core loop-а (фаза Prototype, GDD §13.1): spin → build → attack → raid → summon, с double-entry ledger, CSPRNG и публикувани gacha шансове. TypeScript + Express 5. Data слоят е зад repository/ledger интерфейси с **два взаимозаменяеми backend-а**: in-memory (по подразбиране, нула infra) и **Postgres (Prisma 7) + Redis** (когато са зададени `DATABASE_URL`/`REDIS_URL`). Виж [`backend/README.md`](backend/README.md).

```bash
cd backend && npm install && npm test   # 74 in-memory теста (без infra)
npm run dev                              # стартира API на :3000 (+ WebSocket /ws)

# С персистенция:
docker compose up -d && cp .env.example .env && npm run db:push
npm run test:integration                 # тестове срещу жив Postgres + Redis
```

- [`client/`](client/) — **TypeScript SDK** (zero-dependency, isomorphic) + **playable web demo** (§11.1 client). `KaguraClient` покрива целия API + clan-chat WebSocket; демото е single-page игра (spin/build/summon/shop/leaderboard/clan chat) с GDD §9.2 палитра. Виж [`client/README.md`](client/README.md).

```bash
cd client && npm install && npm run build      # SDK → dist/
npm run demo                                    # http://localhost:5173/demo/ (backend с CORS+dev receipts)
```

> Codename: KAGURA · Поверително · Created and Designed by Carbon Stealth VCC
