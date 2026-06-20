# @carsigma/db

D1 (Cloudflare SQLite) схема за **CARSIGMA** — платформа за прозрачност и
интелигентност на пазара на автомобили. Моделирана по патерна на
[СИГМА](https://github.com/midt-bg/sigma): отворени данни → нормализиран граф →
прекалкулирани rollups → FTS5 търсене → SSR explorer.

## Граф на данните

```
продавач (sellers) → обява (listings) → автомобил (vehicles) → събитие (events)
                                              │
                                              └→ собственик (owners)
```

Аналогия със СИГМА: `институция → поръчка → договор → фирма`.

## Файлове

| Файл | Предназначение |
|------|----------------|
| `migrations/0000_init.sql` | Пълна схема: домейн таблици, rollups, reference, индекси, FTS5 |
| `seed.sql` | Примерен свързан граф за локална разработка |

## Таблици

**Домейн** (explorer-ът ги чете): `sellers`, `owners`, `vehicles`, `listings`, `events`.

**Rollups** (ETL ги пресъздава): `home_totals`, `model_totals`, `seller_totals`,
`owner_totals`, `segment_totals`, `seller_model_flows`, `price_history`,
`facet_counts`.

**Търсене**: `search_index` (FTS5, `unicode61 remove_diacritics`) — едно търсене
покрива VIN, рег. номер, марка/модел и продавач.

**Reference**: `makes_models`, `fx_rates`, `nuts_regions`, `data_freshness`.

## Конвенции (наследени от СИГМА)

- TEXT първични ключове (стабилни идентификатори).
- Канонична валута `*_eur`, изключва редове с флаг `suspect`.
- Флагове за качество: `ok | review | suspect` (`mileage_flag`, `price_flag`, `vin_flag`).
- Рисково индексиране: `green | yellow | red` (`vehicles.risk_level`), с причини в
  `risk_reasons` (JSON). Примери: върнат пробег, скрита катастрофа, клониран VIN,
  аномална цена спрямо `model_totals` медианата.
- Дати като ISO TEXT за съвместимост с D1.

## Локална проверка

Схемата и seed-ът са съвместими с SQLite. Бърза проверка без D1:

```bash
python3 - <<'PY'
import sqlite3
con = sqlite3.connect(':memory:')
con.executescript(open('migrations/0000_init.sql').read())
con.executescript(open('seed.sql').read())
print(con.execute("SELECT title FROM search_index WHERE search_index MATCH 'golf'").fetchall())
PY
```

С Wrangler/D1 (когато се добави `apps/web`):

```bash
wrangler d1 migrations apply carsigma            # прилага migrations/
wrangler d1 execute carsigma --file=seed.sql     # зарежда примерните данни
```
