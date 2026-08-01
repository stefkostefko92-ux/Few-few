# Staffe — гестионале за склад (WMS)

**Staffe** е складова система (WMS — Warehouse Management System, „система за
управление на склад“) за малка фирма, която произвежда и продава **скоби и
крепежни аксесоари за асансьори**. Дава наличности в реално време по
ubicazione (склад/зона/рафт/място), баркод/QR сканиране, поръчки за покупка и
продажба, приемане на стока, пикинг/пакинг (подготовка и опаковане на
поръчки), инвентаризация и отчети.

Потребителският интерфейс е изцяло **на италиански** (клиентът е италианска
фирма); тази документация е на български, съгласно правилото на монорепото.

За кого: складов персонал (`MAGAZZINO`), търговски отдел (`VENDITE`) и
администратор на малка/средна италианска фирма за метални изделия.

## Стек и изисквания

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Prisma ·
PostgreSQL · Tailwind · JWT (`jose`) · PWA.

- Node.js **≥ 20** (`package.json` → `engines.node`)
- PostgreSQL достъпен (локално, Docker или отдалечено — виж [`DEPLOY.md`](DEPLOY.md))

## Бърз старт (локално)

```bash
cd staffe
npm install
cp .env.example .env
```

Задай в `.env`:

- `DATABASE_URL` — връзка към PostgreSQL (`postgresql://user:pass@host:5432/db?schema=public`).
- `AUTH_SECRET` — **задължителен, ≥ 32 знака** (без него `auth.ts` хвърля грешка —
  умишлено: резервна стойност би направила токените подправяеми). Генерирай с:

  ```bash
  openssl rand -base64 48
  ```

- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — задължителни за сийда (иначе
  скриптът спира вместо да създаде администратор с предвидима парола).

След това:

```bash
npx prisma migrate deploy   # или: npm run prisma:migrate:dev — прилага миграциите
npm run db:seed             # демо каталог + ubicazioni + трима потребители (по един на роля)
npm run dev                 # http://localhost:3000
```

Проверено на живо в тази среда (PostgreSQL 16, чисто ново демо-обкръжение):
`npm install`, `prisma migrate deploy`, `npm run db:seed`, `npm run dev` +
`GET /api/health` → `{"stato":"ok","database":"ok"}`, вход през
`POST /api/auth/login` с сийднатия администратор и заявка към защитен
маршрут (`GET /api/prodotti`) — всички минаха с реални отговори (виж
[`docs/openapi.yaml`](docs/openapi.yaml) за пълния договор). Не е тествано
**„от нулата на чужда машина“** — горното е потвърдено само в тази работна
среда; при друга ОС/версия на PostgreSQL сверявай сам.

## Пълният гейт (задължителен преди „готово“)

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # node:test през tsx — чисти функции, без база (87 теста)
npm run build       # prisma generate + next build
```

Всичките четири команди са пуснати реално в тази среда и минават чисто
(0 грешки, 87/87 теста, успешен production build).

## Карта на модулите

| Модул (`src/lib/`) | Отговорност |
|---|---|
| `stock.ts` | Двигателят на наличностите — единственото място, което пише `StockItem.qty` |
| `money.ts` | Пари (евроцентове) и проценти (базисни точки) — чисти, тествани функции |
| `auth.ts` / `auth-shared.ts` | JWT сесия (`jose`) в httpOnly бисквитка + ред `Session` за реална revocation |
| `rbac.ts` | Единствената матрица на правата (`Permission` × `Role`) |
| `api.ts` | REST договорът: `ok`/`created`/`fail`/`route`/`readBody`/`pagination` |
| `audit.ts` | Одитна следа (`AuditLog`) — чувствителни полета падат преди запис |
| `sequence.ts` | Номерация на документи по година (OA/OV/RIC/PRL/SPD/INV) |
| `labels.ts` | Италианските етикети на всички enum-и |
| `barcode.ts` | Генерира SVG баркод/QR (`bwip-js`) |
| `uploads.ts` | Качване на файлове — списък разрешени формати, съхранение извън `public/` |
| `report.ts` / `forecast.ts` | Данни за отчетите и прогнозата за търсене |
| `notifiche.ts` | Видимост/четене на известия (общи и лични) |

## Карта на маршрутите (REST API)

Пълният, машинно четим договор (пътища, права, тела, кодове на грешки) е в
[`docs/openapi.yaml`](docs/openapi.yaml). Обобщено по модул:

| Път | Модул |
|---|---|
| `/api/auth/*` | Вход/изход |
| `/api/prodotti*`, `/api/categorie` | Каталог продукти |
| `/api/ubicazioni*` | Складови места |
| `/api/giacenze`, `/api/movimenti` | Наличности и ръчни движения (трансфер/ректификация) |
| `/api/fornitori*`, `/api/clienti*` | Анагрaфики (доставчици/клиенти) |
| `/api/acquisti*`, `/api/ricevimenti*` | Поръчки за покупка и приемане на стока |
| `/api/vendite*`, `/api/prelievi*`, `/api/spedizioni*` | Поръчки за продажба, пикинг, доставка |
| `/api/inventario*` | Инвентаризация (цикличен/пълен пребой) |
| `/api/report/*` | Износ на отчети (CSV) |
| `/api/notifiche*` | Център за известия |
| `/api/utenti*`, `/api/audit` | Управление на потребители, одитна следа |
| `/api/allegati*`, `/api/barcode`, `/api/ricerca`, `/api/etichette/*` | Прикачени файлове, баркод/QR, глобално търсене, печат на етикети |
| `/api/health` | Публична сонда за деплой/мониторинг |

Всеки отговор е `{ data, meta? }` (успех) или `{ error: { message, code,
details? } }` (грешка) — виж `src/lib/api.ts`. Автентикацията е httpOnly
бисквитка `staffe_session`; почти всеки маршрут изисква сесия
(`requireUser`) и/или конкретно право (`requirePermission`).

## Роли и достъп

Три роли (`Role` в Prisma schema): `AMMINISTRATORE` (всичко),
`MAGAZZINO` (приемане, пикинг, пакинг, сканиране, инвентар), `VENDITE`
(оферти, поръчки, клиенти, наличности, отчети). Пълната матрица на правата е
в `src/lib/rbac.ts`. Забележимо: магазинерът **не вижда** себестойност/марж
(`costi:leggi`), търговецът **не коригира** наличности (`giacenze:rettifica`).

## Инварианти

Продуктът има непреодолими правила за коректност на данните (пари в
евроцентове, наличност само през `stock.ts`, документ = транзакция, права на
сървъра, „не се трие — деактивира“...). Пълният списък е в
[`CLAUDE.md`](CLAUDE.md) — там е предназначен за AI асистенти/разработчици,
не се преповтаря тук.

## Сигурност, деплой, API договор

- [`SECURITY.md`](SECURITY.md) — какви данни се обработват, контроли, GDPR.
- [`DEPLOY.md`](DEPLOY.md) — деплой на VPS (Docker Compose + PostgreSQL),
  бекъп/rollback, диагностика.
- [`docs/openapi.yaml`](docs/openapi.yaml) — пълният REST договор (OpenAPI 3.1).
