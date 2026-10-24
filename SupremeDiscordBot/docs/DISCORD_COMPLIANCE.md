# Discord Developer Terms & Policy — карта на съответствието (v3.4)

**Източници (сверени 13.09.2026 през help-center API-то на Discord):**
- Discord Developer Terms of Service — Effective July 8, 2024 · Last updated June 6, 2024 (статия 8562894815383, edited 2025-03-17)
- Discord Developer Policy — Effective July 8, 2024 · Last updated June 6, 2024 (статия 8563934450327, edited 2024-08-02)
- Monetization: `docs/DISCORD_MONETIZATION.md` (Premium Apps FAQ, Monetization Terms, Paid Services Terms)

Този документ е **гейтван**: `backend/src/__tests__/discordCompliance.test.js` проверява,
че всяка автоматизируема точка по-долу е реално в кода/документите. Правните
изводи не са правен съвет — при съмнение сверявай първоизточника.

## A. Developer Terms §5 — User Privacy and Security

| Изискване (цитат) | Как го покриваме | Къде |
|---|---|---|
| §5(a) „provide and adhere to a privacy policy … clearly … what data you collect, how you use and share … and how users can request deletion" | Политика за поверителност на сайта с таблица на данните, подпроцесорите и правата; линкове в App Directory (Developer Portal → General Information → Terms/Privacy URL — **ръчно, собственикът**) | `frontend/src/pages/PrivacyPage.jsx` (`/privacy`), `/terms`, `index.html` footer |
| §5(b) „give users an easily accessible way to ask for their API Data to be modified and deleted" + „promptly delete … when the applicable user requests" | Три пътя: **`/privacy delete`** в Discord за ВСЕКИ потребител (без табло, потвърждение с бутон, обхват identity, охлаждане 10 min); таблото → Privacy settings (Art. 15/17 самообслужване); админ конзола → Compliance (обработка на заявка по имейл, обхват identity/full, одит `DSR_ERASED`). И в двата обхвата **транскриптите се регенерират** от анонимизираните съобщения — готовият HTML не пази стария подпис/текст; full маха и `reviewNote` | `bot/src/commands/privacy.js`, `backend/src/lib/dsr.js`, `backend/src/routes/gdpr.js`, `backend/src/routes/adminOps.js` |
| §5(b) „promptly delete the API Data when retaining it is no longer necessary" | Автоматична ретенция: Free tier транскрипти 30 дни след затваряне; сървър без бота → лични данни след 30 дни; OAuth сесии по срок; snapshot на роли 180 дни; **опити за верификация 90 дни** | `backend/src/jobs/dataRetention.js`, `services/scheduler.js` (`archive-cleanup`, `gdpr-retention`, `retention-weekly`, `session-cleanup`) |
| §5(b) „not share API Data with any third party" освен Service Provider / закон / изрично указание | Подпроцесори само с DPA/SCC: Hetzner (хостинг), Discord (доставка), Google Gemini (**само** с изрично включен AI отговор от оператора), Sentry; изходящите webhook-и са конфигурирани от самия оператор на сървъра | `legal/DPA.md` §4.2, `legal/ROPA.md`, `PrivacyPage` §5 |
| §5(c) „encryption of the data at rest" | Токени на бранд ботове, OAuth токени, TOTP тайни (вкл. чакащата в сесията), webhook тайни И **транскриптите на тикетите** (`archiveHtml`) — AES-256-GCM на ниво приложение (`lib/transcriptAtRest.js`; заварените редове се шифрират при следващ запис); базата — на шифриран том на VPS-а (**проверява собственикът**) | `backend/src/lib/crypto.js`, `backend/src/lib/transcriptAtRest.js` |
| §5(c) „administrative, physical, and technical safeguards" | Втори фактор задължителен за staff + step-up на ВСЯКО пишещо админ действие; незадължителен IP allowlist за конзолата; известия до собственика при инциденти; стълба срещу налучкване; rate limits; сесии в Postgres с httpOnly/secure/sameSite; CSP; контейнери с `cap_drop: ALL`; секрети само на сървъра | `middleware/mfa.js`, `middleware/adminIpAllowlist.js`, `lib/securityAlerts.js`, `lib/bruteForce.js`, `index.js`, `frontend/nginx.conf`, `docker-compose.yml`, `SECURITY.md` |
| §5(c) „promptly notify us [Discord] … about any incidents of unauthorized access or use of any API Data" | Процедурата за пробив има изрична стъпка **„Уведоми Discord"** (Developer Support / dis.gd/contact) успоредно с КЗЛД (72 ч) и засегнатите | `legal/breach-procedure.md` Phase 3 |
| §3(b) developer credentials „solely with your Application … will not permit or enable any other Application to use them" + §12(a) Service Providers | White-label: клиентът е developer на СВОЕТО приложение, ние сме негов **Service Provider** — работим само по негово указание, пазим токена шифриран, спираме и изтриваме при край; EULA §8.6 го казва изрично | `frontend/src/pages/EulaPage.jsx` §8, `services/clientManager.js` |
| §3(e) API limits | discord.js рate-limit опашка; entitlement реконсилиация на 6 ч (не на минута); DM само транзакционни | `bot/src/index.js` |

## B. Developer Policy — правила 1–21

| # | Правило | Покритие |
|---|---|---|
| 1–2 | Не променяй акаунт / не стартирай процеси без изрично разрешение | Всяко действие е потребителско (slash команда/бутон) или на оператора на сървъра (табло с ManageGuild); авто-роли/welcomer се включват от оператора |
| 3 | Не заобикаляй privacy/safety; уважавай премахване от сървър | Напуснал сървър → данни се чистят след 30 дни (`gdpr-retention`); блокирал бота потребител не получава DM (dmUser връща `{ok:false}`) |
| 4 | Никакви пароли/токени от потребители | Единственият токен, който приемаме, е **bot token на приложение, притежавано от клиента** (white-label, §3(b)/§12(a)) — никога потребителски login данни |
| 5–7 | Без нежелани DM/маркетинг/контакт извън Discord | DM само транзакционни (резултат от кандидатура, провалено плащане, известие за пробив); имейлът от OAuth е само за договорни известия (ROPA); **нула маркетинг** — гейт `marketingTruth` пази текста |
| 8–14 | Забранени дейности, възраст 13+, Community Guidelines, без импресонация | Terms §7 Acceptable Use + `report-abuse` път (`POST /api/gdpr/report-abuse`) — Policy изисква „way to report issues" |
| 15–16 | API Data само за обявената функционалност; без профилиране/чувствителни данни | Ticket/forms/verification данни само за тикет системата; аналитиката е агрегирана (`daily_metrics`); никакви здравни/финансови полета (плащанията са при Discord) |
| 17–18 | Без брокери/реклами; без продажба на API Data | Няма рекламни SDK, няма трети страни за данни — `marketingTruth` гейт + DPA списък |
| 19–20 | Без де-анонимизация / scraping | Четем само gateway събития за сървъри, в които ботът е поканен |
| 21 | „Do not use message content … to train ML/AI models" | AI отговорите са **fail-closed**: работят само при `AI_REPLY_TRAINING_ATTESTED=true` (операторът удостоверява платен Gemini tier без обучение); без него функцията връща null и логът крещи | 

## C. Monetization (Premium Apps) — виж `docs/DISCORD_MONETIZATION.md`

Паритет по конструкция (един канал), само месечни guild SKU, правата от entitlement-и,
Discord = препродавач в ЕС. Terms §5–6, EULA §7.

## D. Какво остава на собственика (не може да се автоматизира)

1. **Developer Portal**: Privacy Policy URL + Terms of Service URL попълнени (App → General Information); верификация на приложението; Team-owned; 2FA на Team. Готовите отговори за App Verification, Privileged Intent review (10 000+ потребители, годишно) и Premium onboarding → `docs/DISCORD_VERIFICATION.md` (гейтван срещу intents/правата в кода).
2. **Диск при покой**: потвърди шифриран том за Postgres на VPS-а (Terms §5(c)(i)).
3. **Gemini tier**: платен tier без обучение → `AI_REPLY_TRAINING_ATTESTED=true`; иначе AI отговорите остават изключени (правилно).
4. **Заявки по имейл** (`privacy@carbonstealth.eu`): обработвай от Admin → Compliance с бележка за референция; срок „promptly" — целта е ≤72 ч.
5. **Инцидент**: следвай `legal/breach-procedure.md` — Discord се уведомява наред с КЗЛД.
