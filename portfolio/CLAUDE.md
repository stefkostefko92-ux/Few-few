# portfolio/ — Carbon Stealth Portfolio (portfolio.carbonstealth.eu)

Портфолио-сайт на **Carbon Stealth VCC**: 15 напълно работещи демо лендинг страници за 15 вида
бизнес (автосервиз · фитнес · мебелен магазин · адвокатска кантора · салон за красота · хотел/къща
за гости · счетоводна къща · автокъща · магазин за дрехи · бързо хранене · онлайн магазин · медицински
център · ресторант · агенция за имоти · строителство) + реалните проекти от carbonstealth.eu + цени и пакети,
на **BG · EN · IT**. Пращаме го на бъдещи клиенти, за да си изберат. Root правилата — в кореновия `CLAUDE.md`.

_Stack: **генератор с нула runtime зависимости** (Node ≥20, plain ESM) → статичен `dist/` зад Nginx.
`npm install` е нужен САМО за конвейера на снимките (`sharp`, devDependency). **Дизайн езикът на хъба е
този на carbonstealth.eu** (проектът `carbonstealth/` на клон `claude/carbonstealth-scrape-redesign-ogjbgy`,
`data/design-tokens.json`): черно · cyan `#00e5ff` · Inter Tight 900 uppercase + Space Mono · 1px рамки без
радиуси · „// ТАГ" секции · boot екран · курсор · canvas hero · scramble/ghost/magnetic. По нареждане на
собственика за бранд сайта: БЕЗ prefers-reduced-motion гейт в хъба (демотата го уважават); без строб._

## Команди (гейтът)

```bash
node build.mjs                                  # → dist/ (броят файлове/URL се печата; 15 демота ×3 езика + хъб · проекти · цени · правна)
node --test test/build.test.mjs                 # паритет на езиците · SEO инварианти · цени ≥15% под пазара · формата
node --test api/server.test.mjs                 # контактният API (валидация · honeypot · лимит · HTTP договор, мокнат send)
node --test test/raven.test.mjs                 # пренесеното от boy/: регулаторът на резолюцията · мълнията ≤2 импулса/s · грейдът · безопасността на hero.js
node tools/a11y.mjs                             # WCAG проверка в Chromium → a11y/report.json (гейтната в теста: 0 грешки; след промяна по шаблон/CSS)
node tools/brochure.mjs                         # брошурата А5 → public/broshura/*.pdf (след промяна по цени/демота/проекти; иска dist/ + Chromium)
node tools/project-shots.mjs [id] [--live] [--url id=http://…]   # скрийншотите на реалните проекти → public/img/projects/ (1920×1200 + -sm 960×600)
node tools/og.mjs [lang] [demo]                 # OG изображения 1200×630 от превютата → public/og/<lang>/<id>.jpg (след previews.mjs)
node ../tools/qa/static-site-check.mjs dist     # препратки · ключови думи · title/lang (repo гейтът)
node serve.mjs                                  # локален преглед на http://127.0.0.1:4180/
node tools/brand.mjs                            # всички бранд асети от brand/logo-source.png (само при смяна на логото)
node tools/previews.mjs [demo]                  # статичните превюта на демотата за хъба (след промяна по демо; иска dist/ + Chromium)
node tools/fonts.mjs                            # самостоятелно хостване на шрифтовете (при смяна на семейство)
node tools/photos.mjs --openimages [demo]       # снимките от photos.picks.json (CC BY 2.0) → public/img/<demo>/ (виж „Снимки")
PEXELS_API_KEY=… node tools/photos.mjs [demo]   # алтернатива: Pexels по photos.manifest.json
```

CI: `.github/workflows/portfolio.yml` (path-филтриран). Деплой: `sudo bash portfolio/deploy.sh` на VPS-а
(билд на сървъра → атомарен web root → certbot при първи път → `nginx.conf` от репото → health 200 на
трите езика, авто-rollback). После IndexNow (Google не поддържа — sitemap-ът е свеж).

## Структура

```
build.mjs                   генераторът — всяка страница минава през head() (SEO не може да се забрави)
src/lib/html.mjs            esc(), head(), PATHS (локализирани слъгове), ORG JSON-LD, инлайн икони, credit()
src/i18n/{bg,en,it}.mjs     UI текстове на хъба/цените/правната/демо лентата — bg е източникът на истината
src/pricing.mjs             ЕДИНСТВЕНИЯТ източник на числата: пакети, добавки, пазарни диапазони, източници
src/demos/<id>.mjs          едно демо = тема (цветове, шрифтове, hero вариант) + съдържание ×3 езика
src/templates/demo.mjs      шаблонът на демо страница (една структура, 15 идентичности; catalog/кошница само при t.catalog)
src/templates/widgets.mjs   „живите" карти в hero-то: booking · schedule · tiles · stats · consult
src/templates/hub.mjs       началната (бранд тема), pricing.mjs — цените, misc.mjs — правна/404/robots/llms/sitemap
src/templates/photos.mjs    снимките на демо: чете public/img/<id>/credits.json, <picture> + srcset, кредити
src/assets/                 site.css+js+raven.js+hero.js (хъб), demo.css+js + premium.css+js (демота), fx/ (4 продуктови добавки), fonts/*.css — без билд
brand/logo-source.png       ЕДИНСТВЕНИЯТ източник на логото (1254², „CS" монограм + надпис) — не се редактира на ръка
public/                     logo.png/webp (lockup) · logo-square · mark · icon-192/512 · apple-touch-icon · favicon.ico · og.png — всички от tools/brand.mjs; fonts/*.woff2, img/<demo>/, img/previews/<lang>/<demo>.webp (tools/previews.mjs), indexnow-key.txt
photos.picks.json           ръчният подбор от Open Images (id · subset · автор · Flickr линк · CC BY 2.0) за всеки слот
photos.manifest.json        заявки към Pexels за всеки слот на всяко демо (hero · about · g1–g6) — алтернативен източник
tools/                      fonts.mjs (Google Fonts → self-host) · photos.mjs (Open Images/Pexels → webp) · brand.mjs (логото → всички асети) · previews.mjs (демо → снимка за картата)
test/build.test.mjs         гейтът · docs/PRICING-RESEARCH.md — проучването зад цените (с източници и дата)
nginx.conf · deploy.sh      продукционният конфиг (CSP, HSTS, истинско 404, proxy /api/) и деплоят (7 стъпки, API последна)
api/server.mjs              контактният API (node:http, Brevo) + server.test.mjs + README.md (env на сървъра) · deploy/portfolio-api.service — systemd юнитът
src/templates/a11y.mjs      декларацията за достъпност (числата от a11y/report.json) · brochure.mjs + assets/brochure.css — брошурата А5 (HTML noindex → PDF)
tools/a11y.mjs · brochure.mjs · lib/serve-dist.mjs   WCAG проверка (CDP, контраст/имена/заглавия/цели) · PDF печат · общият статичен сървър; a11y/report.json е проследен
src/verticals/{bg,en,it}.mjs + index.mjs   уникалният текст на SEO страниците „сайт за <бизнес>“ (h1 · title · desc · 2 увода · 3 FAQ) · src/templates/vertical.mjs — шаблонът и индексът
src/lib/color.mjs           контраст по WCAG + readable()/onColor(): темите дават вкуса, генераторът гарантира ≥4.5:1
tools/project-shots.mjs     скрийншотите на реалните проекти (1200 CSS px @2× → webp 1920 + 960, srcset); `shot` в projects.mjs се засича от диска
```

## Конвенции (важно)

- **SEO/GEO/AEO архитектура.** Главните фрази („изработка на сайт“ · „website design“ · „realizzazione siti
  web“) са в title/H1/keywords на хъба; **вертикалите** `/bg/sait-za/<slug>/` (EN `/website-for/`, IT `/sito-per/`)
  — една на демо ×3 езика — целят „сайт за <бизнес>“: H1 = фразата, уникален увод ×2 и 3 FAQ в
  `src/verticals/<lang>.mjs` (**никакъв шаблонен текст там — само браншово**), какво включва (от данните на демото),
  цени/срок от `pricing.mjs`, реалният Lighthouse от `perf/lab.json`, Service + FAQPage + BreadcrumbList + Speakable.
  Хъбът носи FAQ секция (`i18n.faq`, същият текст във FAQPage) + `ProfessionalService` (geo, areaServed BG/IT,
  OfferCatalog на вертикалите). Вътрешна мрежа: демо лентата „Искам такъв сайт“ → вертикалата; карта в хъба →
  вертикала; вертикала → демо · оферта `?demo=<id>` · цени · 4 други вертикали · блог · градове. Sitemap с
  `image:image` за превютата; `llms.txt` листва вертикалите. `{business}` в `i18n.vertical` е браншът (заменя се
  ПРЕДИ `tx()`, чийто `{business}` е цената на пакета). Ново демо → нов запис в трите `verticals/*.mjs` (гейтнато).
  Семруш обеми не са сверявани (без API единици) — фразите са по утвърдените търсения, не по измерени числа.
- **Asset версии**: `build.mjs` добавя `?v=<sha1 на файла>` към всеки `/assets/*.css|js` в HTML-а (гейтнато в теста) —
  nginx кешира css/js 7 дни и без това след деплой браузърът сглобява нов HTML със стар css/js. Не пиши URL към
  asset на ръка извън `head()`/шаблоните (root/404 страниците минават през същия `put()`).
- **Никакви класове/id с префикс `ad-`, `ads`, `adv`, `banner`, `sponsor`, `promo`.** Adblock филтрите (EasyList) ги
  скриват козметично — демото на админ панела беше `ad-app`/`ad-wrap` и изчезваше при собственика с adblock (сега
  `cms-*`). Тестът гейтва `class="ad-` в dist/.
- **Ново демо** = нов `src/demos/<id>.mjs` (копирай структурата на съществуващо: `slug` ×3, `icon` от
  `icons.mjs`, `schemaType`, `theme`, `keywords` ×3 ≥4, `t` ×3 с еднакви ключове) + ред в `demos/index.mjs`.
  Тестът гейтва паритета, 6 услуги / 5 FAQ / 3 отзива, валиден widget kind.
- **Цени се сменят само в `src/pricing.mjs`.** Всяка цена трябва да е ≥15% под `market` (гейт). Пазарната
  референция иска обновено проучване — `docs/PRICING-RESEARCH.md` + `RESEARCH_DATE`. **ДДС конвенция = тази на
  carbonstealth.eu** (`cs-revolution/src/pricing.json`): числата са брутни → BG ги показва „с включен 20% ДДС“,
  EN/IT показват нето ÷1,20 „excl. VAT / IVA esclusa“ (`shown()`/`shownMarket()`/`tx()`); тестът държи двете
  места равни число по число. Смяна на цена = първо сайтът, после тук (или обратното, но едновременно).
- **Съдържанието на демотата е примерно** (фиктивни фирми, `.example` имейли, фиктивни телефони) — лентата
  отгоре го казва изрично. Никакви реални имена на хора.
- **Снимки** (реални, свободно лицензирани): каноничният източник е `photos.picks.json` — ръчно подбрани
  Flickr снимки от набора Open Images (CC BY 2.0; изолираната среда стига до S3 на Open Images, но не и до
  Pexels/Unsplash). `node tools/photos.mjs --openimages` ги сваля, изрязва на 3:2 по „вниманието" в кадъра,
  прави лек грейд (контраст + острота), webp + `-sm` и `credits.json` (автор · Flickr линк · лиценз).
  **Билдът ги засича автоматично** — с тях hero-то е върху снимка, „за нас" има снимка, галерия с lightbox и
  ред с авторите („изрязани и обработени" — CC BY иска бележка за промяна); без тях демото е чисто типографско.
  Смяна на снимка = нов запис в `photos.picks.json` (еднакво добра или по-добра, без водни знаци, без
  разпознаваеми известни личности, без кредит, който би изглеждал зле под демо), после конвейерът. Алтернативи:
  `PEXELS_API_KEY=… node tools/photos.mjs` (по `photos.manifest.json`, ключът НИКОГА в репото) и
  `--from <папка>` с локални hero.jpg, about.jpg, g1..g6.jpg. Снимките се проследяват в git (те са асети).
- **Маркетинг слой** (`premium.css` + `premium.js`, след demo.css): това, което истински сайт на агенция
  има — и нищо „за ефект". Hero върху снимка с бавен Ken Burns и лек тон в акцента (`.tint`); **ред с
  доказателства** под CTA-тата (`hero.proof`: рейтинг · брой клиенти · срок на отговор); **оферта-банер**
  (`offer: {tag,title,text,cta,note}` — конкретно предложение с условие и срок); trust strip без икони; линк
  за действие във всяка карта-услуга; плочките в hero картата носят реални снимки от галерията; галерия с
  надпис; lightbox с размазан фон/надпис/брояч/swipe; навигация, която се скрива надолу и маркира активната
  секция; аватари в отзивите; плавен FAQ; View Transitions. **Съзнателно махнато** (бие на „генериран" сайт):
  завеса при вход, custom cursor, магнитни бутони, зърно, spinning рамки/блясък, split-text заглавия, гигантска
  outline дума, marquee ленти, номера на секции, воден знак във футъра, canvas частици/снежинки/конфети.
  Хъбът има **преглед на устройства** (`#devmodal`: десктоп · таблет · телефон рамка около живото демо),
  proof ред под CTA-тата и „включва" ред на всяка карта. **Скрийншоти за проверка**: headless `--screenshot`
  замразява CSS анимациите ~0.3s след зареждане и има минимална ширина ~485px — за телефон ползвай CDP с
  `Emulation.setDeviceMetricsOverride` и review копие с нулеви `animation-delay/duration`.
- **Интерактивни добавки** (`src/assets/fx/`): само продуктови функции, никакви декорации — `core.js`
  (токени + `swatches()`), `salon.js`/`mebeli.js` (проба на цвят/материал — сменя акцента на живо),
  `schetovodstvo.js`/`avtokashta.js` (калкулатори). Шаблонът зарежда fx/ само за демотата в `FX_MODULES`.
  Ново демо с добавка → нов `fx/<id>.js` + id в `FX_MODULES`. Никога строб.
- **Шрифтове**: всички се хостват от нас (`tools/fonts.mjs` → `public/fonts/`, `src/assets/fonts/<семейство>.css`);
  `head()` включва само семействата на страницата. Нова Google Fonts препратка в HTML е грешка (гейтната в теста).
- **„Живите" hero карти са реални UI**: резервация (услуга → цена, дата, час, име → потвърждение), график (избор
  на занятие), плочки (избор + брояч + сума), показатели (count-up). Логиката е в `demo.js`, без backend.
- **Ключови думи** ≥5 с „Carbon Stealth“ на всяка страница — `head()` я добавя автоматично, но тестът я иска.
- **title ≤60 · description 70–160 · един h1 · canonical · hreflang bg/en/it + x-default (→ /bg/)** — гейтнати.
- **Без бисквитки, без проследяване.** Демо формите не изпращат нищо (`demo.js` показва съобщение).
  **Единственият backend е контактният API** (`api/server.mjs` — `node:http`, нула зависимости, `POST
  /api/contact` + `GET /api/health`, 127.0.0.1:4187 зад Nginx `location /api/`, systemd
  `deploy/portfolio-api.service` под www-data, имейл през Brevo HTTPS API; тайните САМО в
  `/etc/portfolio-api.env` mode 600 — `api/README.md`). Формата в хъба (`contactForm()` в `hub.mjs`,
  `site.js` → fetch JSON; без JS — обикновен POST и HTML отговор) има honeypot `website`, консент с линк към
  правната, `?demo=<id>` избира демото. Валидация · лимит 5/15 мин · JSON логове без PII · `node --test
  api/server.test.mjs` (мокнат send). Правната страница описва обработката (чл. 6(1)(б), Brevo чл. 28).
- **Прегледи в хъба**: картата носи **статична снимка** (`img/previews/<lang>/<id>.webp`, 960×600, от
  `tools/previews.mjs` — headless Chromium + `--virtual-time-budget`, после sharp; **проследени в git**, след
  промяна по демо ги прегенерирай). Живият iframe идва **само при hover** (fine pointer, ≥901px, не LITE, не
  Save-Data) и живи са най-много 2 — 10 пълни документа с анимации в 10 iframe-а бяха основният лаг на хъба
  на слаба машина. CSP `frame-src 'self'` / `frame-ancestors 'self'` ги позволява.
- **Производителност (гейтната в теста)**: един общ `requestAnimationFrame` цикъл в `site.js` (`FRAME[]`),
  работа само при движение на курсора; без фосфорна следа (full-screen canvas с `mix-blend-mode`, презаписван
  всеки кадър); магнитните букви с кеширани правоъгълници и само `transform` (без `font-weight` — variable
  шрифт се пренарежда всеки кадър); **без `backdrop-filter` на фиксирани/sticky навигации** (преизчислява се на
  всеки scroll кадър; фонът е 92–97% плътен и изглежда същото); без `will-change` на reveal елементите.
  **Hero = езикът на „Двубой в Рейвънхолд“ (`boy/`, клон `claude/medieval-3d-fight-animation-9ybhpo`)**:
  `raven.js` (класически скрипт, `window.CSRaven`) носи общото — регулаторът на `boy/src/quality.js` (мести
  вътрешната резолюция, не FPS-а), началната скала 0.5/0.75, мълнията като два импулса (`flashAt`, ≤2 за секунда —
  под прага на WCAG 2.3.1, няма я при reduced motion/LITE) и грейдът на `boy/src/post-grade.js` като GLSL (ACES
  RRT/ODT · split-tone · S-крива · зърно · дитер). `hero.js` е ЕДИН фрагментен шейдър (WebGL2, един триъгълник):
  ядрото на бранда (икосаедър, проектиран на CPU → 30 сегмента) в буря — облаци, лунни лъчи, дъжд, жарава, мъгла,
  мокър карбонов под с отражение; 30 кадъра/с, старт след `load` + `requestIdleCallback`, паралелна компилация,
  пауза при скрит таб/извън екрана. **LITE при старта или софтуерен WebGL (SwiftShader/llvmpipe) → изобщо не
  компилира**, показва CSS постера (`.hero::before`: ядро · пръстен · жарава · лъчи; `html.hero-static`) — един
  кадър на CPU е ~0.4 s блокирана нишка (desktop 83 → 100). LITE по-късно → замразен кадър. Бранд атмосферата на
  останалите страници е само CSS на псевдоелементи (`body.hub …section::before`, `body.hub::after` винетка + зърно)
  — така a11y проверката вижда истинския фон. Boot екранът е с резервирана височина и `transform` сканираща линия
  (растящият списък даваше CLS 0.022). **LITE режим** (`html.lite`): по Navigator API (≤4 ядра / ≤4 GB /
  Save-Data / `update: slow`) или измерени <40 FPS две секунди подред (след 4-тата s) — спира безкрайните
  декоративни анимации, филтрите, живите iframe-и; в демотата спира Ken Burns + color blend. Съдържанието и
  функциите са същите. Reading progress в демото е `transform:scaleX`, не `width`.
- **Достъпност (гейтната)**: `tools/a11y.mjs` зарежда всяка BG страница + EN/IT хъб в Chromium и проверява
  alt · достъпно име на контроли/бутони/линкове · title на iframe · един h1 без прескачане · lang · уникални id ·
  без tabindex>0 · `<main>` · **контраст ≥4.5:1** (3:1 едър) · цели ≥24×24 (само предупреждение). Тестът иска
  `a11y/report.json` с 0 грешки, покритие на всички BG страници и дата <6 месеца — **след промяна по шаблон или
  CSS пусни го пак** (иначе докладът лъже). Акцентът/приглушеният цвят на демотата минават през `readable()`
  (`src/lib/color.mjs`) — не „поправяй“ контраста на ръка в темата. Заглавията в подножието са `h2.foot-h`, картите
  под h1 са h2 (без h1→h3). Бутонът „Анимации: стоп“ (`data-fx-toggle`, и в мобилното меню) е потребителският
  контрол по WCAG 2.2.2 — включва LITE и се помни в `localStorage` (`cs-lite`); не го махай. Декларацията
  (`/bg/dostapnost/` ×3) описва честно известните ограничения — при нова, добави я в `a11y.limits`.
- **Снимките на реалните проекти** (`public/img/projects/<id>.webp` 1920×1200 + `<id>-sm.webp` 960×600, проследени в git):
  `tools/project-shots.mjs` снима при **1200 CSS px и DPR 2** (не 1440 — в карта от ~400 px пълният десктоп става
  нечетима каша) и картата ползва `srcset` 960w/1920w. Източник: живият URL от `projects.mjs`; където той не се
  достига (изолирана среда), локален източник — статична папка в монорепото (evanitasport · ospedalitrasparenti/site ·
  panev), готов PNG (Nexus/screenshots-final) или пуснат локален сървър през `--url id=http://127.0.0.1:…/` (vizitka ·
  mastilko `next start` · eternaltouch с локален Postgres). Двата размера идват направо от Chromium (DPR 1.6/0.8, webp)
  — `sharp` трябва само за PNG източник. **ouvaptsarov · erp · tretimart нямат източник в репото** — снимат се от
  машина с интернет: на VPS-а `npx --yes playwright@latest install --with-deps chromium` (веднъж), после
  `node tools/project-shots.mjs ouvaptsarov erp tretimart --live --out /opt/portfolio/img-projects` — постоянната
  папка, която `deploy.sh` налива в `public/img/projects/` преди билда (репото има предимство, `cp -n`); за да са и в
  git, копирай webp-ите в `public/img/projects/` и commit. Няма файл → `shot=false` → типографска обложка (никога
  placeholder снимка).
- **Брошура А5** (`/bg/broshura/` ×3, noindex; `tools/brochure.mjs` → `public/broshura/carbon-stealth-portfolio-<lang>.pdf`,
  6 страници, проследени в git, линк „Брошура · PDF A5“ в подножието): същите данни като сайта (демота · проекти
  със снимка · цени от `pricing.mjs` · процес · защо · контакт). Смяна на цена/демо/проект → регенерирай PDF-ите
  (тестът проверява само, че съществуват с 6 страници — свежестта е твоя).
- **Reveal анимациите** са само с JS (`html.js`), елементите във viewport-а се показват веднага, има и
  предпазен таймер — без JS всичко е видимо. В демотата `prefers-reduced-motion` ги изключва; в хъба не
  (нареждане на собственика за бранд сайта).
- **ДДС текстът** (BG +20% · ЕС фирми reverse charge чл. 196 Дир. 2006/112/ЕО / чл. 21 ал. 2 ЗДДС · извън
  ЕС без БГ ДДС) завършва с „не е данъчен съвет“ — не го премахвай.
- SEO промяна → `node ../tools/seo/indexnow.mjs https://portfolio.carbonstealth.eu` (ключът е в web root-а).
