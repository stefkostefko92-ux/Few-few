# Видимост — стъпки след деплой (GSC · Bing · GBP · IndexNow)

Техническото SEO е готово (sitemap-и, hreflang, JSON-LD, блог, гео). Тези стъпки
са **извън кода** — правят се веднъж от собственика и отключват реалните позиции и
query данни. Ред по важност.

---

## 0. Позелени CI (Dependency graph)
GitHub → repo **Settings → Security & analysis → Dependency graph = Enable**.
Това маха червения `dependency-review` check (той е репо-настройка, не код).
За частно репо може да иска и GitHub Advanced Security.

---

## 1. Google Search Console (най-важното — без него си сляп)
1. https://search.google.com/search-console → **Add property → Domain** → `carbonstealth.eu`.
2. Верификация чрез **DNS TXT** запис (при регистратора на домейна). Domain property
   покрива и `www`, и `http/https`, и поддиректориите (/en/, /bg/).
3. След верификация → **Sitemaps** → подай:
   - `https://carbonstealth.eu/sitemap.xml` (индексът — води до pages/blog/geo)
4. **URL Inspection** за началната + 2–3 ключови страници → *Request indexing*.
5. Проследявай седмично: Performance (impressions/clicks/позиции по заявка),
   Coverage/Pages (индексирани vs изключени), Core Web Vitals доклада.

## 2. Bing Webmaster Tools (лесно, +Bing/ChatGPT трафик)
1. https://www.bing.com/webmasters → **Import from Google Search Console** (1 клик).
2. Или ръчно: добави сайта → верификация → подай `sitemap.xml`.
3. Bing захранва и Copilot/ChatGPT търсенето → важно за AEO.

## 3. Google Business Profile (локални позиции + Map Pack)
1. https://business.google.com → създай профил за **Carbon Stealth VCC**.
2. Адрес/зона: седалище **Бобов дол, ул. Самуил 3** (или „Обслужвам клиенти" —
   service-area business, ако не приемаш посещения на адрес).
3. **NAP да съвпада 1:1** със сайта: Name „Carbon Stealth VCC", телефони
   (+39 379 296 9699 / +359 877 414 874), сайт `carbonstealth.eu`.
4. Категории: *Website designer* (осн.) + *Software company*, *Marketing agency*.
5. Service areas: София, Пловдив, Милано, Рим и т.н. (същите градове като гео
   страниците).
6. Публикувай услуги + описание с ключови думи + снимки/лого. Искай **отзиви**
   (реални) — те са силен локален сигнал (и после може истински AggregateRating).

## 4. IndexNow (бързо индексиране — вече е вграден)
След **всеки деплой** с нови/променени страници:
- Влез в админ панела (Ctrl+Shift+A → парола) → таб **INDEXNOW** → *Bulk submit*.
- Това чете `sitemap-{pages,blog,geo}.xml` и подава всички URL-и към IndexNow
  (Bing, Yandex и др.) чрез `api/indexnow.php?action=bulk` (admin-gated).
- Ключът вече е хостнат на `/{key}.txt`. Google не ползва IndexNow, но GSC
  „Request indexing" го покрива.

---

## 5. Off-page старт (авторитет — тук се печелят конкурентните думи)
Техниката е ~готова; позициите за „siti web milano" и т.н. се движат от:
- **NAP цитати** (еднакви Name/Address/Phone) в 10–20 директории:
  IT — PagineGialle, Europages, Trustpilot профил; BG — Zlatnastranica, Bgmaps,
  Google/Apple/Bing бизнес; общи — LinkedIn Company, Clutch, GoodFirms.
- **Backlink-и**: гост-статии, партньорски линкове, каталози на агенции,
  „built by" линк в подвала на клиентски сайтове.
- **Вътрешни линкове**: началната да сочи към топ гео градове + нови блог статии
  (topic clusters хъб→спица).

## 6. Измерване и итерация
- 30/60/90 дни: в GSC виж кои заявки/страници носят импресии и разшири
  печелившите теми (нови статии в същия клъстер).
- Дръж `dateModified` актуален при ъпдейт на страница (freshness сигнал).
- Каденс на съдържание: 2–4 статии/седмица от `docs/CONTENT-PLAN.md`.
