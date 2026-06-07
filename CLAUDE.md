# Помагам Бобов дол

Гражданско приложение за сигнали (боклук, дупки и др.) за община Бобов дол.
Сигналите се модерират в админ панел и се препращат с имейл към общината
СЛЕД одобрение. Инструментът е независим граждански проект (марка „Помагам").

## Структура (monorepo)
- `apps/mobile` — Expo SDK 56 / React Native (Android) — гражданско приложение **(в разработка)**
- `apps/api` — Node 22, Express 5, Prisma, PostgreSQL, Redis, BullMQ **(в разработка)**
- `apps/admin` — React 18 + Vite + Tailwind (модерация) *(предстои)*
- `packages/shared` — zod схеми и типове, споделени api/admin *(предстои)*

## Команди
- Mobile: `cd apps/mobile && npm install && npx expo start`
- Mobile build: `cd apps/mobile && eas build -p android`
- Mobile type-check: `cd apps/mobile && npm run typecheck`
- Инфра (локално): `docker compose up -d` (PostgreSQL 5437, Redis 6383)
- API: `cd apps/api && npm install && npx prisma migrate deploy && npm run seed && npm run dev`
- API type-check: `cd apps/api && npx prisma generate && npm run typecheck`

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
