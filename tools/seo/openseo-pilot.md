# Пилот: OpenSEO + DataForSEO срещу Semrush

Дата: 2026-11-06 · Автор: SEO агент · Статус: чернова за решение на собственика. Нищо от клонинга `/home/user/every-app/open-seo` не е пускано; прочетен е като данни (README, `docs/`, `web/src/routes/_marketing/pricing.tsx`, `src/server/mcp/tools/`). Лиценз: MIT (`LICENSE:1`). Сигурност на кода и условията за пускане: прегледът на Кодаджията (раздел 6) и `tools/seo/openseo-deploy.md`.

## 1. Какво реално ползваме от Semrush

Доказателствата в репото са малко (Сигурно):
- Нито един скрипт в `tools/seo/` или `tools/agents/` не вика Semrush. Измерването е собствено: `live-check`, `cwv` (PSI/CrUX), `check-jsonld`, `ai-bots`, `indexnow`, `gsc`.
- Само `.claude/skills/seo-geo/SKILL.md:17` и `seo-hreflang/SKILL.md:17` казват „Semrush MCP, ако е свързан; DataForSEO не ползваме“. Паметта на SEO агента (`_memory/seo.md:46`) отбелязва, че на 2026-09-23 Semrush MCP не е бил достъпен.
- Домейни (`tools/seo/sites.mjs`): 19 записа. 8 са свои корен-домейни (mastilko-bg.com, vizitka-bg.com, eternaltouch.it, evanita-bg.com, ospedalitrasparenti.it, panevascensori.it, www.scuolabulgaramilano.it, uylas-kebap-center.it), хъбът carbonstealth.eu и 10 поддомейна на carbonstealth.eu.

Колко плащаме и какво отваряме в Semrush не личи от кода. **Собственикът да даде от акаунта:** брой проекти, проследявани ключови думи, кои отчети отваря. Без това „какво заменяме“ е предположение (Несигурно).

Потребности (не доказана употреба): проучване на ключови думи, проследяване на позиции, backlinks, одит на сайт, конкуренти, AI видимост.

## 2. Какво покрива OpenSEO (по код и README, не е пускано)

| Нужда | OpenSEO | Файл | Забележка |
|---|---|---|---|
| Keyword research | да | `mcp/tools/research-keywords.ts`, `get-domain-keyword-suggestions.ts` | данни от DataForSEO Labs |
| Rank tracking | да | `create-rank-tracker.ts`, `get-rank-history.ts` | дневно, седмично, месечно; страна и език |
| Backlinks | да | `get-backlinks-overview.ts`, `get-backlinks-profile.ts` | индексът е на DataForSEO, не на Semrush |
| Конкуренти / домейн | да | `get-domain-overview.ts` | |
| Site audit | да | `site-audit-tools.ts` | собствен краулър; JS рендиране иска платен Cloudflare Workers (`docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md:72`); авторите сами пишат, че са зад Ahrefs/Semrush по MCP за одит (`docs/maintainers/site-audit-pm-research.md:30`) |
| AI видимост | да | `ai-visibility-tools.ts` | |
| GSC / GA | да | `search-console-tools.ts` | |
| MCP за Claude | да | README, „MCP & Agent Skills“ | |

Липсва или не е проверено спрямо Semrush: собственият индекс и ключова-дума база на Semrush, оценка на трафик, PPC, анализ на токсични линкове, outreach, PDF отчети. Дали данните съвпадат, показва само пилотът.

## 3. Цени (отворени 2026-11-06)

| Позиция | Цена | Източник |
|---|---|---|
| SERP, Google organic, 10 резултата | standard $0.0006 · priority $0.0012 · live $0.002; всеки следващ 10 +1 базова цена | https://dataforseo.com/pricing/serp/google-organic-serp-api |
| Labs (идеи, ranked keywords, конкуренти) | $0.012 на задача + $0.00012 на ред | https://dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api |
| Keywords Data (Google Ads, обем) | standard $0.06 · live $0.09 на задача, до 1000 думи | https://dataforseo.com/pricing/keywords-data/google-ads |
| Backlinks | $0.024 на заявка + $0.000036 на ред | https://dataforseo.com/pricing/backlinks |
| Месечен минимум за Backlinks | няма от 2026-07-01 („$100 monthly commitment … is now removed“) | https://dataforseo.com/update/pricing-update-in-dataforseo-apis |
| Минимално зареждане | $50, балансът не изтича, без абонамент | https://dataforseo.com/pricing |
| OpenSEO хоствано | $10/мес с $10 ползване; +28% върху DataForSEO | https://openseo.so/pricing, README:73 |
| Semrush „SEO“ | $117.33/мес (годишно плащане), 500 думи дневно, 5 сайта | https://www.semrush.com/prices/ |
| Semrush „Starter“ | $165.17/мес, +50 AI промпта дневно | същата страница |
| Semrush „Pro+“ | $248.17/мес, 1500 думи, 15 сайта | същата страница |

Бележки:
- Страницата на Semrush днес показва SEO, Starter, Pro+, Advanced, не Pro и Guru. Дали са преименувани, или страницата е регионална, е **за проверка**.
- Отпадането на $100 минимума е от една страница на DataForSEO, а търсачката още връща стари страници с $100. Вероятно е вярно; потвърди в таблото преди зареждане.
- Примерът на Backlinks страницата е вътрешно несъответен ($0.05 срещу изчислени $0.06). Ползвам формулата.
- OpenSEO смята допълнителна страница SERP по $0.00045 (`pricing.tsx:50`), официалната страница казва +1 базова цена ($0.0006). Взех официалната, по-скъпата.

### Месечен разход (self-host, суров DataForSEO)

Допускания: 6 домейна; 50 думи общо (горна граница 6×50=300); едно четене на проверка. OpenSEO залага до 6 четения на проверка (`pricing.tsx:40-44`), така че горната граница може да е до ×6.

| Дейност | Изчисление | USD/мес |
|---|---|---|
| Позиции, 50 думи седмично, дълбочина 10 | 200 × 0.0006 | 0.12 |
| Позиции, 50 думи дневно, дълбочина 10 | 1500 × 0.0006 | 0.90 |
| Позиции, 300 думи дневно, дълбочина 40 | 9000 × 0.0024 | 21.60 |
| Проучване: 30 търсения по $0.042 (`pricing.tsx:51-56`) | 30 × 0.042 | 1.26 |
| Обем: 5 задачи | 5 × 0.06 | 0.30 |
| Ranked keywords, 6 домейна × 1000 реда | 6 × (0.012 + 0.12) | 0.79 |
| Backlinks веднъж: преглед + 1 г. история + списък 1000 реда, 6 домейна | 6 × (0.0612 + 0.06) | 0.73 |
| AI видимост: 20 промпта × 3 платформи × 4 седмици | 240 × 0.0012 (`pricing.tsx:64`, не е от официална страница: за проверка) | 0.29 |
| Site audit | собствен краулър, без такса на DataForSEO | 0 |

- **Ниска сметка** (50 думи седмично, дълбочина 10): ≈ $3.70/мес, ≈ $44/год. Първите $50 стигат за ~13 месеца.
- **Висока сметка** (300 думи дневно, дълбочина 40): ≈ $25/мес, ≈ $300/год.
- Хоствано OpenSEO: ниска ≈ $10/мес; висока ≈ $10 + (25×1.28 − 10) ≈ $32/мес.
- Semrush за година (12 × показаната месечна цена): SEO $1 408 · Starter $1 982 · Pro+ $2 978.
- Docker на наш VPS: приемам $0 допълнително, не е измерено.

## 4. Протокол за пилота (2 седмици, ≤ $50 само първо зареждане, очаквано изгаряне < $5)

Домейни: **mastilko-bg.com** (БГ, корен), **panevascensori.it** (IT, локален бизнес), **zabobovdol.carbonstealth.eu** (поддомейн, гранична проверка). Една страна и език на домейн, едно устройство, същия ден и час в Semrush и OpenSEO. Трети източник за истина: `GOOGLE_OAUTH_TOKEN=… node tools/seo/gsc.mjs <site> <start> <end>`.

| Метрика | Извадка | „Съвпада“, ако |
|---|---|---|
| Позиции | 30 думи на домейн (10 марка, 10 от GSC, 10 цел) | ≥80% в рамките на ±3 места в топ-20; Spearman ≥0.9; и двата източника ≤3 места от средната позиция в GSC за думите с импресии |
| Обем | 50 думи | ≥80% в рамките на ×2; Spearman ≥0.8 |
| Backlinks и рефериращи домейни | 3 домейна | общо ±30%; ≥50% припокриване на топ-50 рефериращи домейни |
| AI видимост | 20 промпта | ≥70% съвпадение „има/няма“ (проучвателно) |
| Site audit | mastilko-bg.com | открива всички блокиращи проблеми на `live-check`/`prelaunch-audit` |
| Разход и труд | реално таксувано | ±25% от прогнозата; ≤1 час поддръжка/мес |

**„Заменя“:** позиции, обем и backlinks минават и реалният разход ≤ $30/мес. Пада само backlinks → „частично“. Падат позициите → „не“.

Предусловия (решава човек):
1. Политиката „DataForSEO не ползваме“ (`seo-geo/SKILL.md:17`, `seo-hreflang/SKILL.md:17`) се отменя изрично за пилота.
2. `DATAFORSEO_API_KEY` стои само на сървъра (mode 600), не в репото.
3. Преди self-host: преглед на кода (направен — раздел 6) и условията от `tools/seo/openseo-deploy.md`. Към DataForSEO отиват само публични домейни и думи, без лични данни.
4. Не ползваме партньорските връзки `?aff=` от README.

## 5. Препоръка

**Частично (Вероятно, преди пилота).** OpenSEO + DataForSEO е достатъчен за проучване на думи, позиции, преглед на backlinks, AI видимост и GSC за нашия обем при ≈ $4–25/мес срещу $1 408–2 978/год за Semrush (спестяване ≈ 80–97%).

„Заменя“ не може да се твърди, докато:
- (а) собственикът не покаже какво реално ползва в Semrush;
- (б) пилотът не потвърди, че индексът на backlinks и обемите на DataForSEO са достатъчно близки;
- (в) одитът на сайт не покрие нуждите ни. Той е по-слаб по думите на авторите и е дублиран от `live-check`/`prelaunch-audit`.

Ако пилотът мине, спираме Semrush. Ако падне само backlinks, оставяме най-евтиния план за него.

## 6. Сигурност на кода (Кодаджията, open-seo @ 78c5d85, статичен преглед)

Условно приемливо зад нашия Nginx+TLS само при тези условия (подробностите са в `tools/seo/openseo-deploy.md`):
1. Само `deploy/standalone/compose.yaml` — никога кореновия `compose.yaml` (`AUTH_MODE=local_noauth` = без вход, root, телеметрия по подразбиране).
2. Образ по `@sha256:` от прегледан release; `:latest` е всеки commit в main, без подпис.
3. Достъп само за собственика (IP allowlist / basic auth) от първата секунда: първият регистрирал се става админ, а `GET /api/sign-up-status` издава незаявена инсталация (`src/server/standalone/sign-up.ts:13-23`).
4. Силни ключове за хранилището; `BETTER_AUTH_URL=https://…`.
5. Без покани (поканата се заема по имейл); нов човек — само `admin create-user`.
6. Лимит на харченето в DataForSEO акаунта.
7. CSP + HSTS + `limit_req` на `/api/auth/` в нашия Nginx; WebSocket за чата.
8. Без ключ за OpenRouter по подразбиране — праща данни за проекта в САЩ.
9. Бекъпите на тома `config` (тайните) — само криптирани.

Излизащи данни при standalone: `api.dataforseo.com` (домейни, думи, конкуренти), `cloudflare-dns.com` (DoH за одита), `api.ahrefs.com` (безплатен DR по домейни), краул на одитираните сайтове. Телеметрията (PostHog) е изключена принудително в standalone.
