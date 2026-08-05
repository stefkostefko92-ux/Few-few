# Пътна карта към завършен продукт — синтез от 5-агентния преглед

Съставена 05.08.2026 от прегледите на Дискорджията (продукт/паритет), Кодаджията
(production готовност), Продавача (комерсиална фуния), SEO (растеж) и Дизайнера
(UX). Корекността на кода е одитирана отделно (3 кръга) — тук са **дупките до
„напълно професионален, завършен продукт"**, приоритизирани по ефект × усилие.

## 🔴 Ниво 0 — блокери (дни; преди каквото и да е пускане)

1. **Бекъпи на Postgres — НЯМА, а DPA обещава „daily backups, 30-day
   retention".** Невярно договорно твърдение + риск от тотална загуба.
   → systemd timer с `pg_dump -Fc` + шифроване + off-site + **тестван restore**;
   pre-deploy дъмп в `deploy_supreme()` (моделът е готов в `deploy_medqr`).
2. **Prisma schema drift**: 18 индекса живеят само в migrations, не в
   `schema.prisma` (модел `Ticket` — нула `@@index`). Следващата
   `migrate dev` ще генерира DROP на индексите → приложен в прод от
   `migrate deploy`. → синхронизирай schema ↔ migrations сега.
3. **Ботът е „сляп" health-wise**: `/health` връща ok без `client.isReady()`
   → паднал Discord gateway = „operational" на status страницата и Docker не
   рестартира. → 5-редова поправка.
4. **3 реални дефекта от прегледа на бота**: `/admin schedule remove` е
   неизползваема (отрязан ID срещу точно съвпадение — трябва autocomplete);
   `THREAD` panel режим се приема от валидатора, но не е имплементиран
   (клиентът конфигурира нещо, което не се случва); `/help` обещава
   `/setup` wizard, който не съществува.
5. **2 React Query бъга в dashboard-а**: AnalyticsPage — вечен skeleton при
   грешка (4 заявки без `isError`); Dashboard.jsx:41 рендира грешка + празен
   grid едновременно.
6. **Invite-ът иска Administrator (`permissions=8`)** — top.gg изрично го
   забранява + плаши админите. → конкретен permissions bitfield; и добави
   **публичен „Add to Discord" CTA на landing-а** (сега няма никакъв).

## 🟠 Ниво 1 — „професионален продукт" (2–4 седмици)

**Onboarding (най-голямата продуктова дупка — ботът влиза мълчаливо):**
- `guildCreate` welcome embed (system channel + DM fallback): Dashboard линк,
  „Бърза настройка", Помощ; auto-permission check (кодът на `/debug` е готов)
- Истински **`/setup` wizard** (роли → категория → log канал → първи панел)
- **Getting-started checklist** на ServerHome (сигналите вече са в API-то)

**Комерсиална комуникация (фунията днес е няма):**
- OAuth scope + `email` → транзакционни имейли: trial ден 11, payment failed
  (dunning), welcome, cancel потвърждение (или Discord DM канал през бота)
- Upsell CTA при удряне на лимит (PremiumToast има мястото, няма бутона)
- Portal: включи `cancellation_reason` (exit survey) — сега събираме 0 данни
- Stripe: махни твърдото `payment_method_types:["card"]` → EU локални методи
- Поправи афилиейт базата: комисионна върху нето (без ДДС), не бруто

**Доказателства (нула визуални доказателства днес):**
- 5–6 скрийншота на dashboard-а (WebP) + 20–40s демо клип — отключва
  наведнъж: landing конверсия, bot-list банери, App Directory, Reddit
- Реални числа („X сървъра · Y тикета") от собственото API вместо голи SLA
  твърдения; първите 3 отзива
- Оптимизирай активите: og-image 1.87MB → <100KB (убива social preview)

**Инженерна дисциплина:**
- `.github/workflows/supreme.yml` (path-filtered CI: lint+test+build) +
  Dependabot; поправи заковаващия `undici` override (11 уязвимости)
- 5-те най-ценни теста: stripe webhook (checkout/invoice/deleted), agency
  seat, discordEntitlements grant/revoke, getServerTier, admin premium
  (routes са на 0% покритие — supertest е инсталиран, неползван)

**UX консистентност (Дизайнера, пакети 1–4):**
- Едно злато: `amber-*`/`yellow-*` → `cs-gold` (~35 замени в 8 файла)
- `EmptyState` навсякъде (моделът съществува в 2 от 9 страници)
- `ToastHost` за успех/грешка + retry бутони; мъртвия CSS вън
- Drawer a11y (aria-expanded, Escape, focus trap — образецът е в Modal.jsx)

## 🟡 Ниво 2 — растеж и паритет (1–2 месеца)

- **Листване**: описания/банери/скрийншоти веднъж → top.gg + discordbotlist +
  discords.com; винаги като **„Supreme Bot by Carbon Stealth"** (името
  „Supreme" е заето от ≥4 бота, вкл. add-on на конкурент в ticket нишата);
  на 75 сървъра → Discord верификация → **App Directory** (канал №1)
- **Vote webhook** (top.gg) → 12–24h Premium перк за гласувалия сървър
- **Паритетни функции по ROI**: canned responses/`/tag` (№1 staff искане) →
  **modal форми** за ≤5 въпроса (DM-затворени потребители днес не могат да
  отворят тикет) → context-menu команди (message→ticket, user→ticket) →
  ticket priorities
- **i18n на бота**: ~246 hardcoded EN низа; горещият път първо (~40 низа =
  80% от видимото), после `setDescriptionLocalizations` на 14-те команди
  (Discord ги показва на езика на потребителя автоматично); 3→8 езика
- **Публична документация**: `/commands` страница от готовия
  `commandsCatalog.js` (prerender шаблонът съществува) — дълга опашка + AI
  цитируемост
- **Съдържание**: `/compare/ticket-tool-alternative`, `helper-gg-alternative`,
  `appy-bot-alternative`, GDPR/EU-hosting guide (нулева конкуренция),
  white-label landing; SERP-ът е 100% vendor блогове → ниска бариера
- Cooldown-и на `/poll`, `/giveaway`, `/new`; `/stats` в Discord (backend
  данните са готови); линкове в `/help`; единна embed палитра + брандиран
  footer (изключен за white-label)

## 🔵 Ниво 3 — по-късно

SLA tracking (продава B2B) · Knowledge base + предлагане на статии ·
Отговор от dashboard без Discord · Staff threads за кандидатури ·
Локализирано съдържание (DE/FR ров — конкурентите са само EN) ·
Reddit → Product Hunt (последен, пик не канал) · Affiliate включване
(след условия + нето база + clawback + чл. 73 процес) · Admin MRR/churn
дашборд · Sharding подготовка (към 2500 сървъра)

## Препоръчан старт (първите 2 седмици)

Седмица 1: Ниво 0 изцяло (бекъпи → schema sync → health → 3-те дефекта →
RQ бъговете → invite permissions + CTA).
Седмица 2: onboarding пакетът (welcome + wizard + checklist) + скрийншоти/
демо + email scope + trial имейл. Това променя първото впечатление и
фунията — най-голямото разстояние до „завършен продукт" не е в кода, а в
това какво вижда нов потребител в първите 10 минути.
