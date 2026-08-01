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
npm run prune               # изтрива изтеклите данни (пуска се по cron, дневно)
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
                        resolvePublicIpv4 (DNS + частни диапазони, ВРЪЩА IP-то),
                        readCapped (поточен таван на тялото), probeServer,
                        resolveJoinCode (cfx код → адрес).
src/lib/servers.ts      Публичните заявки. `publicServerSelect` е единственият
                        набор полета, който напуска базата. `reviewSummary` смята
                        средното и броя с ОТДЕЛЕН aggregate (не от отрязания
                        списък).
src/lib/site.ts         Реквизитите на издателя — единствен източник за
                        импресума, подвала и политиките.
src/lib/messages.ts     Кодове на грешки → български текст. През URL пътува код,
                        никога свободен текст.
src/lib/rate-limit.ts   Процесен таван по действие (анти-спам без IP).
src/lib/rating.ts       averageRating/isFeatured — отделени от servers.ts, за
                        да са тестваеми без Prisma клиент.
src/lib/seo.ts          SITE_URL, BASE_KEYWORDS, pageMetadata (canonical+OG),
                        siteJsonLd/serverListJsonLd/faqJsonLd, jsonLdString.
src/app/page.tsx        Директорията + FAQ („отговор отпред“ за AI отговарачите).
src/app/servers/[slug]/ Страница на сървър: статус, рамка, ревюта, „Влез“.
src/app/submit/         Заявка за листване → модераторска опашка.
src/app/actions/submit.ts  Заявка за листване: zod вход, honeypot, таван.
src/app/actions/review.ts  Ревю от посетител (единственият път за създаване).
src/app/actions/report.ts  Сигнал по чл. 16 DSA (четирите задължителни елемента).
src/app/impresum/       Импресум по чл. 4 ЗЕТ + точки за контакт по DSA.
src/app/report/         Формата за сигнали (noindex).
src/app/news/           Новини и туториали (SEO гръбнак).
scripts/refresh-servers.ts  Cron: пингва всички одобрени сървъри на порции,
                        пише Server.online/players + ServerSnapshot.
prisma/schema.prisma    Server · ServerSnapshot · Review · Submission · Report · Post.
scripts/prune.ts        Cron: изтрива по обявените в /privacy срокове.
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
- **Адресът е външен вход → SSRF.** Хостът се резолвира, всяко получено IP се
  сверява срещу частните диапазони, и заявката отива към **проверения IP** —
  името пътува само в `Host` хедъра. `fetch(host)` резолвира втори път при
  connect, тоест проверка на името НЕ се пренася върху заявката (DNS rebinding).
  Затова `resolvePublicIpv4` връща `string`, не `void`; върне ли се пак `void`,
  дупката се отваря тихо. Водещи нули в IPv4 се отхвърлят (`0177.0.0.1` е
  октален запис на loopback).
- **Чуждото тяло се чете поточно с таван** (`readCapped`, 512 KB).
  `(await res.text()).slice(0, CAP)` не е таван — буферира всичко, преди да
  реже. Всяка бройка минава през `MAX_PLAYER_COUNT`, иначе `clients:
  999999999999` препълва `int4` и сваля целия cron пробег.
- **„Скрит“ ≠ „офлайн“.** При `sv_requestParanoia >= 2` сървърът връща текст
  `Nope.` вместо JSON. Слеем ли ги, показваме „офлайн“ на жив сървър —
  затова има отделен `ProbeOutcome.HIDDEN`.
- **Рамката се познава само по ядрото** (`es_extended`, `qb-core`, `qbx_core`,
  `ox_core`). `ox_lib`/`oxmysql` вървят с всичко и НЕ са маркер. Без ясен
  маркер → `UNKNOWN`; грешен етикет ядосва сървърите повече от липсващ.
- **Нищо не става публично автоматично.** Заявките и ревютата влизат в
  модераторска опашка (`ModerationStatus.PENDING`).
- **Анти-спам без проследяване** — honeypot + процесен таван по действие
  (`src/lib/rate-limit.ts`). Не пазим IP адреси към ревю или заявка; това е
  продуктово обещание, а не пропуск.
- **Ревюта се пишат САМО от посетители.** Никога не сийдвай ревюта и не пиши
  „редакционни оценки“ в таблицата `Review` — вписано от оператора ревю е
  фалшив потребителски отзив (Прил. I, т. 23в от Дир. 2005/29/ЕО), забранен при
  всички обстоятелства. Оттам и правилото: пътят за създаване
  (`src/app/actions/review.ts`) съществува преди първото ревю, не след него.
- **Оценките не са проверени.** Затова страницата на сървъра носи разкритието
  „не проверяваме дали авторът е играл“ до самата оценка, а `aggregateRating`
  JSON-LD **липсва нарочно** — структуриран рейтинг към търсачките е твърдение,
  което не можем да подкрепим. Средното и броят идват от отделен `aggregate`
  (`reviewSummary`), не от `.length` на отрязания списък: иначе сайтът публично
  твърди „4.6 / 5 от 20“ при 100 ревюта.
- **Класирането е обявено.** Платеното промотиране е първи критерий в
  `listPublicServers` → значка „промотиран (платено)“ и в списъка, и на
  страницата, плюс раздел „Как подреждаме сървърите“ в условията. Скрито платено
  класиране е забранена практика. Подредбата по `featuredUntil` иска изрично
  `nulls: 'last'` — Postgres подрежда NULL **първо** при `DESC`, тоест без него
  непромотираните изместват промотирания най-отдолу, точно обратното на
  обявеното.
- **Маскотът се копира, не се редактира.** `src/components/mascot/` е копие от
  пакета `mascot/` в корена (zero-dep, продуктите копират каквото ползват).
  Поправка отива в `mascot/svg/*` + `node mascot/build.mjs`, после копираш пак —
  затова папката е и извън eslint. Нивата не са козметика: `icon` (≤32 px,
  шапката в навигацията и `app/icon.svg`), `medium` (без филтри — 404), `full`
  (герой-кадърът на началната). Клиентската граница е `src/components/Mascot.tsx`.
- **Сроковете имат изпълнител.** `scripts/prune.ts` изтрива по същите срокове,
  които `/privacy` обявява. Промениш ли единия, промени и другия.
- Правните текстове (`src/app/impresum`, `privacy`, `terms`, `report`) са писани
  по одит на Правния Разбирач. При всяка нова обработка на данни или нов вид
  съдържание се сверяват пак — включително дали `/report` още покрива четирите
  елемента по чл. 16, ал. 2 DSA.

## Първата стъпка не е кодът, а данните

Сайт, който стартира празен, не пробива разпокъсания пазар. Преди пускане:
reach-out към съществуващите сървъри (Galaxy RP, CALM RP, DarkSquad RP, Fantasy
Roleplay, Intense RP, PROJECT EX, Retrix Roleplay, Xenon RP Bulgaria) и към
Facebook/Discord общностите за начален списък и доверие.
