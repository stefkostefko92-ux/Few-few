# Car Monitor

Платформа за **прозрачност и интелигентност на пазара на автомобили**. Агрегира
данни за коли (обяви, история, събития) в бърз, свързан и търсим граф, и маркира
съмнителното — върнат километраж, скрити катастрофи, клонирани VIN, аномални цени.

Моделирана по патерна на [СИГМА](https://github.com/midt-bg/sigma) (отворени
данни за обществени поръчки): отворени данни → нормализиран граф → прекалкулирани
rollups → FTS5 търсене → SSR explorer на Cloudflare edge.

## Граф на данните

```
продавач (sellers) → обява (listings) → автомобил (vehicles) → събитие (events)
                                              └→ собственик (owners)
```

Аналог на СИГМА: `институция → поръчка → договор → фирма`.

## Архитектура

TypeScript монорепо (pnpm + turbo) върху Cloudflare:

**Приложения**
- `apps/web` — React Router v7 SSR worker (`car-monitor`), чете D1 директно през `@car-monitor/db`.
- `apps/etl` — cron-only worker (`car-monitor-etl`), освежава скорошен прозорец на всеки 6 часа.

**Пакети**
- `@car-monitor/db` — D1 схема, миграции, rollups, заявки.
- `@car-monitor/ingest` — нормализация на сурови данни + рисково индексиране.
- `@car-monitor/shared` — споделени утилити (EUR, нормализация, риск логика).
- `@car-monitor/api-contract` — форми на отговорите.
- `@car-monitor/config` — конфигурация и източници.

**Инфраструктура**: Cloudflare Workers (compute), D1 (SQLite), статични assets.
Подготвено за бъдещ AI асистент и допълнителни източници (КАТ/ГТП/застрахователи).

## Рисково индексиране

Наследено от „suspect“ редовете на СИГМА, разширено за автомобили:

| Сигнал | Флаг | Ниво |
|--------|------|------|
| Върнат километраж | `mileage_flag = suspect` | 🔴 |
| Скрита катастрофа | — | 🔴 |
| Клониран VIN | `vin_flag = suspect` | 🔴 |
| Аномална цена (под 60% от медианата за модела) | `price_flag = review` | 🟡 |
| Невалиден VIN | `vin_flag = review` | 🟡 |

## Бърз старт

```bash
pnpm setup    # еднократно: проверки, инсталация, D1 миграции + seed
pnpm dev      # ежедневно: web на :5173 + ETL worker на :8789 (miniflare)
```

`pnpm import` зарежда пълния корпус (виж `docs/etl.md`).
`pnpm import --catchup` сам пресмята прозореца за синхронизация.

## Команди

| Команда | Предназначение |
|---------|----------------|
| `pnpm typecheck` | Проверка на типове |
| `pnpm test` | Тестове (node:test) |
| `pnpm lint` / `format` | Prettier |
| `pnpm bootstrap` | Пробно създаване на Cloudflare ресурси |
| `pnpm import [--catchup] [--remote]` | Зареждане на данни + rollups |
| `pnpm --filter @car-monitor/web run preview:static` | SSR рендира страниците върху SQLite в `apps/web/.preview/*.html` (за визуален преглед) |

## Източници на данни

- **Публични / scrape-ваеми:** обяви (mobile.bg, cars.bg, OLX) → MVP веднага.
- **EU:** Safety Gate (recalls).
- **Изискват споразумение** (третират се като production secrets, както в СИГМА):
  КАТ, ГТП пунктове, застрахователи / Гаранционен фонд.

## Лиценз

MIT.
