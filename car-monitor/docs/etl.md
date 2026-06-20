# ETL

## Поток

```
адаптер (източник) → RawListing → normalizeListing() → upsert в D1 → rollups.sql
```

- **Адаптери** (`apps/etl/src/adapters.ts`) — по един на източник. Сменя се само
  parser-ът; нормализацията нататък е обща. Демонстрационният `fixturesAdapter`
  се заменя с HTTP клиент към mobile.bg / cars.bg / OLX.
- **Нормализация** (`@car-monitor/ingest`) — стабилни идентификатори (VIN →
  `v_<vin>`, ЕИК → `s_eik_<eik>`), каноничен EUR, рисково индексиране.
- **Upsert** (`apps/etl/src/refresh.ts`) — D1 prepared statements с `ON CONFLICT`.
- **Rollups** (`packages/db/rollups.sql`) — пресъздаване на derived таблиците.

## CLI

```bash
# Генерира SQL от източниците (прилага с --apply):
node --experimental-strip-types apps/etl/scripts/load-listings.mjs --apply

# Миграции + данни + rollups (локално):
pnpm import

# Автоматичен прозорец за синхронизация:
pnpm import --catchup

# Срещу продукционната D1:
pnpm import --remote
```

## Продукционен refresh

Worker-ът `car-monitor-etl` се стартира по cron (`0 */6 * * *`) и обработва малък
скорошен прозорец (`config.refreshWindowDays`). За дебъг: `GET /?days=3`.

## Качество

- `value_flag` / `mileage_flag` / `price_flag`: `ok | review | suspect`.
- Редове със `suspect` цена се изключват от каноничните EUR агрегати.
- `detectMileageRollback` ползва толеранс 1000 км за грешки при въвеждане.
