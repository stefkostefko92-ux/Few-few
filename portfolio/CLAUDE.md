# portfolio/ — Carbon Stealth Portfolio (portfolio.carbonstealth.eu)

Портфолио-сайт на **Carbon Stealth VCC**: 10 напълно работещи демо лендинг страници за 10 вида
бизнес (автосервиз · фитнес · мебелен магазин · адвокатска кантора · салон за красота · хотел/къща
за гости · счетоводна къща · автокъща · магазин за дрехи · бързо хранене) + страница с цени и пакети,
на **BG · EN · IT**. Пращаме го на бъдещи клиенти, за да си изберат. Root правилата — в кореновия `CLAUDE.md`.

_Stack: **генератор с нула runtime зависимости** (Node ≥20, plain ESM) → статичен `dist/` зад Nginx.
`npm install` е нужен САМО за конвейера на снимките (`sharp`, devDependency). **Дизайн езикът на хъба е
този на carbonstealth.eu** (проектът `carbonstealth/` на клон `claude/carbonstealth-scrape-redesign-ogjbgy`,
`data/design-tokens.json`): черно · cyan `#00e5ff` · Inter Tight 900 uppercase + Space Mono · 1px рамки без
радиуси · „// ТАГ" секции · boot екран · курсор · canvas hero · scramble/ghost/magnetic. По нареждане на
собственика за бранд сайта: БЕЗ prefers-reduced-motion гейт в хъба (демотата го уважават); без строб._

## Команди (гейтът)

```bash
node build.mjs                                  # → dist/ (45 файла, 39 URL в sitemap)
node --test test/build.test.mjs                 # паритет на езиците · SEO инварианти · цени ≥15% под пазара
node ../tools/qa/static-site-check.mjs dist     # препратки · ключови думи · title/lang (repo гейтът)
node serve.mjs                                  # локален преглед на http://127.0.0.1:4180/
node tools/render-images.mjs                    # og.png + apple-touch-icon.png (само при смяна на бранда)
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
src/templates/demo.mjs      шаблонът на демо страница (една структура, 10 идентичности)
src/templates/widgets.mjs   „живите" карти в hero-то: booking · schedule · tiles · stats · consult
src/templates/hub.mjs       началната (бранд тема), pricing.mjs — цените, misc.mjs — правна/404/robots/llms/sitemap
src/templates/photos.mjs    снимките на демо: чете public/img/<id>/credits.json, <picture> + srcset, кредити
src/assets/                 site.css+js+hero.js (хъб), demo.css+js + premium.css+js (демота), fx/ (4 продуктови добавки), fonts/*.css — без билд
public/                     favicon.svg, logo.png/webp, og.png, apple-touch-icon.png, fonts/*.woff2, img/<demo>/, indexnow-key.txt
photos.picks.json           ръчният подбор от Open Images (id · subset · автор · Flickr линк · CC BY 2.0) за всеки слот
photos.manifest.json        заявки към Pexels за всеки слот на всяко демо (hero · about · g1–g6) — алтернативен източник
tools/                      fonts.mjs (Google Fonts → self-host) · photos.mjs (Open Images/Pexels → webp) · render-images.mjs
test/build.test.mjs         гейтът · docs/PRICING-RESEARCH.md — проучването зад цените (с източници и дата)
nginx.conf · deploy.sh      продукционният конфиг (CSP, HSTS, истинско 404) и деплоят
```

## Конвенции (важно)

- **Ново демо** = нов `src/demos/<id>.mjs` (копирай структурата на съществуващо: `slug` ×3, `icon` от
  `icons.mjs`, `schemaType`, `theme`, `keywords` ×3 ≥4, `t` ×3 с еднакви ключове) + ред в `demos/index.mjs`.
  Тестът гейтва паритета, 6 услуги / 5 FAQ / 3 отзива, валиден widget kind.
- **Цени се сменят само в `src/pricing.mjs`.** Всяка цена трябва да е ≥15% под `market` (гейт). Пазарната
  референция иска обновено проучване — `docs/PRICING-RESEARCH.md` + `RESEARCH_DATE`.
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
- **Без бисквитки, без проследяване, без backend.** Демо формите не изпращат нищо (`demo.js` показва
  съобщение). Контактът е mailto + формата на carbonstealth.eu.
- **Live прегледи в хъба**: мащабирани iframe-и на реалните демота — само ≥901px, при влизане във viewport,
  никога при Save-Data. CSP `frame-src 'self'` / `frame-ancestors 'self'` ги позволява.
- **Reveal анимациите** са само с JS (`html.js`), елементите във viewport-а се показват веднага, има и
  предпазен таймер — без JS всичко е видимо. В демотата `prefers-reduced-motion` ги изключва; в хъба не
  (нареждане на собственика за бранд сайта).
- **ДДС текстът** (BG +20% · ЕС фирми reverse charge чл. 196 Дир. 2006/112/ЕО / чл. 21 ал. 2 ЗДДС · извън
  ЕС без БГ ДДС) завършва с „не е данъчен съвет“ — не го премахвай.
- SEO промяна → `node ../tools/seo/indexnow.mjs https://portfolio.carbonstealth.eu` (ключът е в web root-а).
