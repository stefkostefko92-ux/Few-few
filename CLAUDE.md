# Помагам Бобов дол

Гражданско приложение за сигнали (боклук, дупки и др.) за община Бобов дол.
Сигналите се модерират в админ панел и се препращат с имейл към общината
СЛЕД одобрение. Инструментът е независим граждански проект (марка „Помагам").

## Структура (monorepo)
- `apps/mobile` — Expo SDK 56 / React Native (Android) — гражданско приложение **(в разработка)**
- `apps/api` — Node 22, Express 5, Prisma, PostgreSQL, Redis, BullMQ **(в разработка)**
- `apps/admin` — React 18 + Vite + Tailwind (модерация) **(в разработка)**
- `packages/shared` — zod схеми и типове, споделени api/admin **(в разработка)**

## Команди
- Shared (build преди api/admin): `cd packages/shared && npm install && npm run build`
- Mobile: `cd apps/mobile && npm install && npx expo start`
- Mobile build: `cd apps/mobile && eas build -p android`
- Mobile type-check: `cd apps/mobile && npm run typecheck`
- Инфра (локално): `docker compose up -d` (PostgreSQL 5437, Redis 6383)
- API: `cd apps/api && npm install && npx prisma migrate deploy && npm run seed && npm run dev`
- API worker (опашка/имейл): `cd apps/api && npm run worker`
- API type-check: `cd apps/api && npx prisma generate && npm run typecheck`
- Admin: `cd apps/admin && npm install && npm run dev` (Vite прокси към API на 4400)
- Admin type-check/build: `cd apps/admin && npm run build`

## Бележки по монорепото
- `apps/api` и `apps/admin` зависят от `@pomagam/shared` през `file:` връзка.
  Пакетът няма `prepare` (за да не се компилира при `npm ci` на консуматорите) —
  затова `packages/shared` трябва да е build-нат (`dist/`) **преди** type-check /
  build / деплой на api/admin. CI го прави като отделна стъпка; `dist/` не се
  commit-ва. `apps/mobile` е независим (Expo), не ползва workspaces.

## Бележки по схемата
- `Category` и `Settlement` ползват `slug` като първичен ключ — четим, стабилен
  ключ, който мобилното приложение изпраща директно (опростение спрямо
  първоначалната MVP схема с cuid `id`).

## Правила
- TypeScript strict, без `any` (`unknown` + type guard).
- Български UI текстове; английски за код/логове/commits.
- Без hard-coded secrets/URL/портове — само env / app config.
- Чист, ръчно прегледан код без TODO/коментари-следи и без шаблонни заглушки.
- Conventional commits; без force-push на main.

## Референтни данни
- 8 категории сигнали (`apps/mobile/src/data/categories.ts`).
- 18 населени места — Бобов дол + 17 села (`apps/mobile/src/data/settlements.ts`).
- Получател на сигналите се конфигурира на backend чрез `EMAIL_TO_MUNICIPALITY`
  (по подразбиране delovodstvo@bobovdol.egov.bg) — никога не се кодира твърдо.

## Поток на сигнала (mobile)
Категория → Снимка/клип → Локация и населено място → (по желание) описание и
контакт → Изпращане. Работи офлайн: сигналът се пази локално и се качва, щом
има мрежа. Сигналът тръгва със статус PENDING; нищо не напуска системата без
човешко одобрение в админ панела.
