# FiveM Bulgaria — проучване на пазара и препоръки

_Дата: 2026-08-01 · Метод: търсене по няколко ъгъла + проверка на живите
източници. Изводът от проучването е реализиран като продукт в `FiveM/`._

---

## 1. Съществува ли официален сайт на FiveM Bulgaria?

Не съществува единен, официален и завършен сайт, който да е признат за "централния" портал на българската FiveM общност. Landscape-ът е разпокъсан на няколко неконкурентни ресурса:

- **fivembulgaria.com** — домейн с индексирани подстраници (`/serverspage/content.html` — списък със сървъри, `/partnership-req/index.html` — форма за партньорство), но в момента показва **"Coming Soon"** и не може да бъде достигнат стабилно (грешки при resolve на robots.txt/DNS при опит за fetch). Изглежда като изоставен или недовършен проект, а не активен сайт.
- **fivembg.wordpress.com** — активен, но **неофициален** WordPress hub. Съдържа: водещ сървър "Galaxy Roleplay", списък с партньори (CALM RP, DarkSquad RP, Fantasy Roleplay, Intense RP, PROJECT EX, Retrix Roleplay), правила, туториали за начинаещи, форма за оценка на сървъри (1–5) и Discord линк. Това е най-близкото до "community hub", но е построен на безплатна WordPress платформа, без брандиране на ниво professional site.
- **fivem-bg.com** ("Next Generation Gaming") — съществува, но връзката му с FiveM Bulgaria общността не е потвърдена еднозначно от наличните данни.
- **Facebook групи**: "FIVEM.BG [FiveM Bulgaria]" и "FiveM BULGARIA" (fivembulgariaofficial) — активни социални групи, не сайтове.
- **Instagram**: fivembulgariaofficial.
- **Discord**: множество тагнати "fivem"/"bg" сървъри в DISBOARD, плюс специализирани като "FiveM Bulgarian Academy".
- Индивидуални RP сървъри с българско RP (Galaxy Roleplay, Xenon RP Bulgaria и др.) имат собствени сайтове/Discord-и, но не representат общността като цяло.
- Трети страни агрегатори (trackyserver.com, game-state.com) листват български FiveM сървъри, но не са българско-специфичен бранд.

**Извод**: Има пазарна ниша. Никой не държи ролята на официален, добре изграден, SEO-оптимизиран директория сайт за българската FiveM общност — само fragmented Facebook/Discord/WordPress presence и един изоставен домейн.

## 2. Какво трябва да съдържа такъв сайт

### Основни функционалности
- **Live directory на сървъри** — динамичен списък с online статус, брой играчи, ping, tags (ESX/QBCore/QBox framework, whitelist/non-whitelist, heavy/light RP, drift, икономика и др.), лого/banner. Технически: FiveM сървърите expose-ват `/info.json` и `/dynamic.json` на своя IP:port; за `cfx.re/join/<code>` линкове първо се резолва реалния адрес, после се пингва тези endpoints за live данни (брой играчи, hostname, map, resources).
- **Детайлна страница на сървър** — описание, правила, framework, Discord линк, "Connect" бутон (`fivem://connect/...` или `cfx.re/join/<code>`), галерия със снимки/видео.
- **Ratings/reviews** с anti-spam защита (rate limit + captcha).
- **Форма за подаване на сървър** (partnership/submission) с модераторска опашка за одобрение — вече има прецедент в fivembg.wordpress.com, но нуждае от истински backend вместо статична форма.
- **Филтри и търсене**: по брой играчи, framework, whitelist статус, тип RP, език.
- **Новини/блог**: FiveM ъпдейти, нови ресурси/скриптове, community събития — важно и за SEO трафик.
- **Туториали**: инсталация на FiveM, свързване към сървър, основи на ESX/QBCore за нови играчи.
- **Discord widget/интеграция** вместо/в допълнение на форум.
- **Монетизация** (по избор): платено featured/sponsored листване за сървър owners, банер реклами.

### Технически стек (по вашия Carbon Stealth stack)
- Next.js 15 App Router + Tailwind (full-stack, SSR за SEO).
- PostgreSQL + Prisma за сървъри, ревюта, потребители, партньорски заявки.
- Redis + BullMQ за periodic job, който пинга всеки регистриран сървър (`info.json`/`dynamic.json`) и кешира online статус, вместо да го прави на всеки page load.
- Docker compose + nginx + Let's Encrypt + PM2, deploy на VPS 178.104.77.242, subdomain по pattern `fivembulgaria.carbonstealth.eu` или собствен домейн (`fivembulgaria.bg`/`.com`, ако се купи).
- JWT auth за server owner акаунти (управление на своя listing).

### SEO/GEO/AEO (според вашия enterprise стандарт)
- JSON-LD: `Organization` + `WebSite` + `ItemList` (списък със сървъри) + `FAQPage` за чести въпроси ("Как да вляза в българска FiveM RP общност", "Какво е ESX/QBCore" и др.) + `Review`/`AggregateRating` за сървърите с ревюта.
- Локализация: BG като основен език, EN за чуждестранни посетители; hreflang между тях.
- Всяка сървър-страница = уникален title/meta description, canonical URL, clean slug (`/servers/galaxy-roleplay`).
- Blog/новини секция с "last updated" дата и author за E-E-A-T.
- llms.txt в root, тъй като AI crawlers/asistенти все по-често отговарят на въпроси от типа "кой е най-добрият FiveM RP сървър в България".
- Sitemap.xml с автоматично обновяване при добавяне на нов сървър.

### Практически съвет за старта
Първата стъпка не е кода, а данните: трябва reach-out към съществуващите сървъри (Galaxy RP, CALM RP, DarkSquad RP, Fantasy Roleplay, Intense RP, PROJECT EX, Retrix Roleplay, Xenon RP Bulgaria) и Facebook/Discord общностите, за да се осигури initial listing и credibility при launch — иначе сайтът стартира празен и не пробива fragmented-ия landscape.

## Източници
- https://fivembulgaria.com/ (Coming Soon, недостъпен стабилно)
- https://fivembulgaria.com/serverspage/content.html
- https://fivembulgaria.com/partnership-req/index.html
- https://fivembg.wordpress.com/
- https://fivembg.wordpress.com/home/partners/
- https://fivembg.wordpress.com/galaxy/
- https://www.facebook.com/groups/370002667978586/
- https://www.facebook.com/groups/fivembulgariaofficial/
- https://www.instagram.com/fivembulgariaofficial/
- https://fivem-bg.com/
- https://www.trackyserver.com/fivem-server/country/BG
- https://www.game-state.com/index.php?game=fivem&location=BG
- https://disboard.org/servers/tag/fivem?fl=bg
- https://forum.cfx.re/t/galaxy-roleplay-18/5245283
- https://servers.fivem.net/ (официален FiveM server list)
- https://github.com/AvuxDemons/fivem-server-api (endpoint документация: info.json/dynamic.json/players.json)
