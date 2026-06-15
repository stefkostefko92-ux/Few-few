# За Бобов дол (zabobovdol.bg)

Дигитален помощник за град **Бобов дол** — портал на едно място за местни
услуги и телефони, обяснения „Как да…“ за е-услуги, събития, обяви, каталог на
местния бизнес и помощ на гише. Независима гражданска инициатива, без участие
на общината.

## Какво включва

- **Публичен сайт** (бърз, адаптивен за всички устройства, PWA).
- **SEO/GEO/AEO**: структурирани данни (JSON-LD за Organization, WebSite,
  FAQPage, LocalBusiness, Event, BreadcrumbList), `sitemap.xml`, `robots.txt`,
  Open Graph, гео мета тагове, канонични адреси.
- **Дигитален помощник (чатбот)**: по подразбиране работи без AI (търси в
  съдържанието); готов за включване на Claude с един ключ.
- **Административен панел** с роли (Администратор/Редактор), одит лог и
  модерация на обявите.
- **Търсене** в целия сайт + запис на „търсения без резултат“ (валидация какво
  търсят хората).

## Технологии

Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind CSS ·
Docker.

## Структура

```
src/
  app/                 публични страници + админ + API + robots/sitemap/manifest
  components/          UI и админ компоненти
  lib/                 site, prisma, auth, seo, search, chat, markdown
  lib/admin/           конфигурация на ресурси + сървърни действия
prisma/schema.prisma   модел на данните
prisma/seed.ts         администратор + примерни данни
```

## Локална разработка

```bash
cp .env.example .env        # попълнете AUTH_SECRET и данни за достъп
npm install
npx prisma db push          # създава таблиците
npm run db:seed             # създава администратор + примерни данни
npm run dev                 # http://localhost:3000
```

Вход в администрацията: `/admin/login` с данните от `.env`.

## Продукция (Docker на VPS)

Вижте **[DEPLOY.md](./DEPLOY.md)** за пълните стъпки. Накратко:

```bash
cp .env.example .env        # задайте силни AUTH_SECRET / ADMIN_PASSWORD
docker compose up -d --build
docker compose exec app npm run db:seed   # еднократно
```

## Включване на AI чатбота (по избор)

В `.env`:

```
CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

Без ключ помощникът работи на база съдържанието (нулев разход).

## Важно

Сайтът е независим и не е официален сайт на община Бобов дол. Примерните данни
от seed са обозначени и трябва да се заменят с реални от админ панела.
