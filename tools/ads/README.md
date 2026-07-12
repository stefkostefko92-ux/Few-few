# tools/ads — ръцете на „Рекламчика"

Инструменти за платена реклама (Google Ads + Meta Marketing API). Без външни зависимости
(Node ≥20).

## ads-lint.mjs

Статичен детектор на рекламни анти-шарки:

```bash
node tools/ads/ads-lint.mjs                # проверява SupremeAdManager/src
node tools/ads/ads-lint.mjs path/to/code   # или конкретен път
```

Какво лови (тежест):

| Правило | Тежест | Защо |
|---------|--------|------|
| `hardcoded-token` | HIGH | Meta `EAA…`/Google `ya29.`/`AIza…` в кода — тайните живеят в средата, криптирани |
| `active-at-create` | HIGH | създаване със `status: ACTIVE/ENABLED` — всичко ново тръгва PAUSED |
| `teen-profiling` | HIGH | `age_min < 18` — DSA чл. 28(2) забранява профилиране на непълнолетни |
| `missing-special-categories` | MED | POST /campaigns без `special_ad_categories` (задължително поле, Meta) |
| `eu-without-dsa` | MED | ЕС таргетиране без `dsa_payor`/`dsa_beneficiary` (задължителни от 16.08.2023) |
| `capi-no-event-id` | MED | CAPI без `event_id` → няма дедуп с пиксела → двойно броене |
| `budget-not-micros` | MED | подозрително малък `amountMicros` (забравено ×1e6) |
| `tight-retry` | LOW | retry без backoff (Meta 17/613/80004, Google RESOURCE_EXHAUSTED) |
| `insecure-final-url` | LOW | `final_url` с http:// |

Exit 1 при HIGH находка → става за CI гейт.

Продуктът, който тези инструменти пазят: **`SupremeAdManager/`** (виж `SupremeAdManager/RESEARCH.md`
за пълното проучване с източници).
