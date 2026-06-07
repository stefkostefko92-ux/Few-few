# Помагам Бобов дол

Гражданско приложение за сигнали (боклук, дупки, осветление, ВиК и др.) за
община Бобов дол. Гражданинът подава сигнал със снимка/клип и местоположение за
под минута, без регистрация. Сигналите се модерират в админ панел и се
препращат с имейл към общината **след** човешко одобрение. Независим граждански
проект под марката „Помагам".

## Структура (monorepo)

| Папка | Технология | Статус |
| --- | --- | --- |
| `apps/mobile` | Expo SDK 56 / React Native (Android) | в разработка |
| `apps/api` | Node 22, Express 5, Prisma, PostgreSQL, Redis, BullMQ | в разработка |
| `apps/admin` | React 18 + Vite + Tailwind | в разработка |
| `packages/shared` | zod схеми и типове | в разработка |

## Мобилно приложение

Поток на сигнала в 3–4 стъпки: **категория → снимка/клип → локация и населено
място → (по желание) описание и контакт → изпращане**. Работи офлайн —
сигналът се запазва локално и се качва автоматично, щом има мрежа.

```bash
cd apps/mobile
cp .env.example .env        # задай EXPO_PUBLIC_API_BASE_URL към твоя backend
npm install
npx expo start             # стартирай на Android устройство/емулатор
```

## Споделен пакет

`apps/api` и `apps/admin` ползват общи zod схеми и типове от `@pomagam/shared`.
Изгради го **преди** тях (няма авто-build при `npm ci` на консуматорите):

```bash
cd packages/shared && npm install && npm run build
```

## Backend (API + worker)

Сигналът пристига със статус `PENDING`. Нищо не напуска системата, докато
модератор не го одобри — тогава отделен worker праща имейл към общината и
сигналът става `SENT`.

```bash
docker compose up -d                       # PostgreSQL (5437) + Redis (6383)
cd apps/api
cp .env.example .env                       # задай JWT_SECRET, SMTP_*, ADMIN_*
npm install
npx prisma migrate deploy && npm run seed  # схема + референтни данни + админ
npm run dev                                # API на :4400
npm run worker                             # опашка/имейл (отделен процес)
```

## Админ панел

React 18 + Vite + Tailwind за модерация: вход, опашка по статус, преглед на
снимките и одобри/откажи. В разработка прокси-то на Vite сочи към API-то.

```bash
cd apps/admin
npm install
npm run dev                                # :5173, прокси към API на :4400
```

Подробности и правила за разработка — виж [CLAUDE.md](./CLAUDE.md).
