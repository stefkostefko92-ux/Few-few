# Разработка

Кратко ръководство за работа по проекта.

## Изисквания

- Node.js 20+ (`.nvmrc`)
- PostgreSQL 16 (локално или през Docker)

## Стартиране локално

```bash
npm install
cp .env.example .env          # попълнете DATABASE_URL и тайните
npx prisma db push            # създава схемата в базата
npm run db:seed:all           # примерни/начални данни + администратор
npm run dev                   # http://localhost:3000
```

## Проверки преди commit

Кодът минава през следните гейтове (същите като в CI):

```bash
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm run typecheck   # tsc --noEmit
npm test            # модулни тестове (node:test)
npm run build       # продукционен билд
```

## Конвенции

- TypeScript, без неоправдан `any`; данните се валидират със Zod.
- Страниците, които четат от базата, са `force-dynamic` (билдът върви без база).
- Достъпът до базата минава през `@/lib/prisma`; настройките през `@/lib/settings`.
- Структурираните данни (JSON-LD) се изграждат от `@/lib/seo`.
- Текстовете са на български; за кавички се ползват „ и “.

## Структура

- `src/app` — маршрути (App Router), вкл. админ панел и API.
- `src/components` — споделени компоненти.
- `src/lib` — логика без UI (auth, prisma, seo, markdown, settings…).
- `prisma` — схема и сийд скриптове.
- `scripts` — деплой и бекъп помощници.
