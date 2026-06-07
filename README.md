# Few-few

Работно хранилище за **KAGURA SPIN** (神楽スピン — *Realm of Spirits*) — anime social-casino / build-raid игра за iOS и Android.

## Документация

- [KAGURA SPIN — Game Design Document & Пазарно проучване (v1.0)](docs/KAGURA_SPIN_GDD.md)

Документът покрива core gameplay loop, икономика, монетизация, арт направление, техническа архитектура, юридическо съответствие, roadmap и KPI.

## Код

- [`backend/`](backend/) — server-authoritative backend на core loop-а (фаза Prototype, GDD §13.1): spin → build → attack → raid → summon, с double-entry ledger, CSPRNG и публикувани gacha шансове. TypeScript + Express 5, in-memory data слой зад repository интерфейс (production → Prisma/Postgres). Виж [`backend/README.md`](backend/README.md).

```bash
cd backend && npm install && npm test   # 38 теста
npm run dev                              # стартира API на :3000
```

> Codename: KAGURA · Поверително · Created and Designed by Carbon Stealth VCC
