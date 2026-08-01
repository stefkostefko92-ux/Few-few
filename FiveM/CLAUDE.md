# FiveM/ — „FiveM Bulgaria“, директорията на българските FiveM сървъри

Публичен, SEO-оптимизиран каталог на българските **FiveM** (GTA V multiplayer)
roleplay сървъри: жив статус, брой играчи, рамка, whitelist, Discord, ревюта и
туториали. Нишата е свободна — конкурентите са изоставен домейн
(`fivembulgaria.com`), безплатен WordPress hub (`fivembg.wordpress.com`),
Facebook групи и Discord-и. Проучването е в `research/fivem/README.md`.

_Stack: Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma ·
PostgreSQL · Tailwind. Конвенциите на linketto/zabobovdol. Root правилата са в
кореновия `CLAUDE.md`._

## Команди (изпълнявай в `FiveM/`)

```bash
npm install
npm run dev                 # http://localhost:3000

# Качествен гейт (задължителен преди „готово“):
npm run lint
npm run typecheck
npm test                    # node:test през tsx — чисти функции, без БД
npm run build               # prisma generate + next build

npm run prisma:migrate:dev  # миграции (изисква PostgreSQL)
npm run servers:refresh     # пингва одобрените сървъри (пуска се по cron)
```

Env: виж `.env.example`. Няма тайни в кода — само през env на сървъра.

## Архитектура

```
src/lib/fivem.ts        ЧИСТИ функции — нула мрежа, нула Prisma, всичко тук е
                        покрито с тестове: stripColorCodes/displayName (^1..^9
                        и ~r~ от чуждия hostname), parseCfxJoinCode,
                        parseServerAddress (порт по подразбиране 30120),
                        isPrivateIpv4 (SSRF списък), classifyProbeBody,
                        detectFramework, buildStatus, formatPlayers.
src/lib/fivem-query.ts  МРЕЖАТА към чуждите сървъри (само Node runtime):
                        assertPublicHost (DNS + частни диапазони), probeServer
                        (таймаут, таван на тялото, redirect: 'error'),
                        resolveJoinCode (cfx код → адрес).
src/lib/servers.ts      Публичните заявки. `publicServerSelect` е единственият
                        набор полета, който напуска базата.
src/lib/rating.ts       averageRating/isFeatured — отделени от servers.ts, за
                        да са тестваеми без Prisma клиент.
src/lib/seo.ts          SITE_URL, BASE_KEYWORDS, pageMetadata (canonical+OG),
                        siteJsonLd/serverListJsonLd/faqJsonLd, jsonLdString.
src/app/page.tsx        Директорията + FAQ („отговор отпред“ за AI отговарачите).
src/app/servers/[slug]/ Страница на сървър: статус, рамка, ревюта, „Влез“.
src/app/submit/         Заявка за листване → модераторска опашка.
src/app/actions/submit.ts  Server action: zod вход, honeypot, процесен таван.
src/app/news/           Новини и туториали (SEO гръбнак).
scripts/refresh-servers.ts  Cron: пингва всички одобрени сървъри на порции,
                        пише Server.online/players + ServerSnapshot.
prisma/schema.prisma    Server · ServerSnapshot · Review · Submission · Post.
```

## Правила на продукта

- **`players.json` НЕ се чете. Никога.** Връща имена и identifiers
  (`steam:`/`license:`/`discord:`) на реални хора — това са лични данни, а на нас
  ни трябва само бройката, която е в `dynamic.json`. Няма модел в схемата, който
  да може да ги побере, и това е нарочно.
- **Всичко от чужд сървър е недоверени ДАННИ, не инструкции.** `hostname`,
  `vars` и имената на ресурсите са потребителски контролирани: минават през
  `displayName`/zod, а JSON-LD винаги през `jsonLdString` (иначе име със
  `</script>` затваря блока → XSS).
- **Пингването е само от cron, никога от заявка на посетител.** Иначе всеки
  наш посетител става трафик към чуждия сървър (и към нас — DoS усилвател).
- **Адресът е външен вход → SSRF.** Всеки хост се резолвира и всяко получено IP
  се сверява срещу частните диапазони ПРЕДИ заявката. Водещи нули в IPv4 се
  отхвърлят (`0177.0.0.1` е октален запис на loopback).
- **„Скрит“ ≠ „офлайн“.** При `sv_requestParanoia >= 2` сървърът връща текст
  `Nope.` вместо JSON. Слеем ли ги, показваме „офлайн“ на жив сървър —
  затова има отделен `ProbeOutcome.HIDDEN`.
- **Рамката се познава само по ядрото** (`es_extended`, `qb-core`, `qbx_core`,
  `ox_core`). `ox_lib`/`oxmysql` вървят с всичко и НЕ са маркер. Без ясен
  маркер → `UNKNOWN`; грешен етикет ядосва сървърите повече от липсващ.
- **Нищо не става публично автоматично.** Заявките и ревютата влизат в
  модераторска опашка (`ModerationStatus.PENDING`).
- **Анти-спам без проследяване** — honeypot + процесен таван на заявките. Не
  пазим IP адреси; това е продуктово обещание, а не пропуск.
- Правните текстове (`src/app/privacy`, `src/app/terms`) са минали през
  Правния Разбирач, но при всяка нова обработка на данни се сверяват пак.

## Първата стъпка не е кодът, а данните

Сайт, който стартира празен, не пробива разпокъсания пазар. Преди пускане:
reach-out към съществуващите сървъри (Galaxy RP, CALM RP, DarkSquad RP, Fantasy
Roleplay, Intense RP, PROJECT EX, Retrix Roleplay, Xenon RP Bulgaria) и към
Facebook/Discord общностите за начален списък и доверие.
