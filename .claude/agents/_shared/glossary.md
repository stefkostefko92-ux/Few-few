# Споделен глосар и факти за проекта (за всички агенти)

Каноничен източник за повтарящи се термини (BG → EN → IT) и базови факти за репото.
Агентите четат този файл, за да не повтарят и да не се разминават. Преводач е
**owner**-ът на езиковата част; останалите само четат. „Източник на истината" е BG.

> ⚠️ **Безопасно-критично:** клиничните преводи долу са **проверени** и одобрени за
> ползване. Всеки термин извън тази таблица се проверява в двуезичен медицински
> речник или се маркира за човешка проверка — **никога не превеждай клиничен термин
> „на сляпо"** (medqr е GDPR чл. 9 / EAA контекст).

## Контролирани клинични стойности (medqr) — BG · EN · IT

| BG (източник) | EN | IT |
| --- | --- | --- |
| Без слухови проблеми | No hearing problems | Nessun problema uditivo |
| Намален слух | Reduced hearing | Udito ridotto |
| Ползва слухов апарат | Uses a hearing aid | Usa un apparecchio acustico |
| Кохлеарен имплант | Cochlear implant | Impianto cocleare |
| Глух/а | Deaf | Sordo/a |
| Мога да говоря | Can speak | Può parlare |
| Говоря ограничено | Speaks with difficulty | Parla con difficoltà |
| Не мога да говоря | Cannot speak | Non può parlare |
| Български жестов език | Bulgarian Sign Language | Lingua dei segni bulgara (LIS-BG) |
| Международен жестов език | International Sign | Segni internazionali |
| Не ползвам жестов език | Does not use sign language | Non usa la lingua dei segni |
| Не знам | Unknown | Sconosciuto |

## Чести медицински/спешни етикети — BG · EN · IT

| BG | EN | IT |
| --- | --- | --- |
| Кръвна група | Blood type | Gruppo sanguigno |
| Алергии | Allergies | Allergie |
| Заболявания | Conditions | Patologie |
| Медикаменти | Medications | Farmaci |
| Спешен контакт | Emergency contact | Contatto di emergenza |
| Спешен медицински профил | Emergency medical profile | Profilo medico di emergenza |
| Обади се на 112 | Call 112 | Chiama il 112 |

## Чести UI/граждански термини — BG · EN · IT

| BG | EN | IT |
| --- | --- | --- |
| Начало | Home | Home |
| Услуги | Services | Servizi |
| Новини | News | Notizie |
| Събития | Events | Eventi |
| Обяви | Listings | Annunci |
| Поверителност | Privacy | Privacy |
| Общи условия | Terms | Termini e condizioni |
| Бисквитки | Cookies | Cookie |
| Съгласие | Consent | Consenso |

## Типографски правила (резюме)
- **BG:** „ … " · **EN:** " … " · **IT:** « … » (вложени „ ").
- IT: малки букви за дни/месеци/езици; учтива форма **Lei**; дата ДД/ММ/ГГГГ;
  десетична запетая; € **след** сумата (`12,50 €`).

## Базови факти за репото (за да не се пита/гадае)
- Монорепо, **без** коренен `package.json`; `zabobovdol/` (Next.js 15 · Prisma · Postgres),
  `medqr/` (Express · SQLite · ESM).
- **Prisma:** zabobovdol е на **Prisma 6** (`@prisma/client`, `prisma-client-js`) към
  момента — провери `zabobovdol/package.json`, преди да предложиш Prisma-7 синтаксис.
- Auth cookie: `zbd_session` (JWT, jose, HS256). Prisma singleton: `@/lib/prisma`.
- i18n: zabobovdol BG/EN; medqr `src/i18n.js` (BG/EN + `CLINICAL_EN`, `TRANSLIT`).
  **IT все още не е вкаран в живите приложения** — таблиците горе са готовата основа.
- Дата на последна проверка на факти/версии: **2026-06-25**. Опреснявай на ~3 месеца.
