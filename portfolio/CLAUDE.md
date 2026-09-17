# portfolio/ — Carbon Stealth Portfolio (portfolio.carbonstealth.eu)

Портфолио-сайт на **Carbon Stealth VCC**: 10 напълно работещи демо лендинг страници за 10 вида
бизнес (автосервиз · фитнес · мебелен магазин · адвокатска кантора · салон за красота · хотел/къща
за гости · счетоводна къща · автокъща · магазин за дрехи · бързо хранене) + страница с цени и пакети,
на **BG · EN · IT**. Пращаме го на бъдещи клиенти, за да си изберат. Root правилата — в кореновия `CLAUDE.md`.

_Stack: **генератор с нула зависимости** (Node ≥20, plain ESM) → статичен `dist/` зад Nginx. Няма
`npm install`. Бранд палитрата е от `mascot/tokens.json` (карбон `#050706` + неон `#5AB60D`/`#99E72A`)._

## Команди (гейтът)

```bash
node build.mjs                                  # → dist/ (45 файла, 39 URL в sitemap)
node --test test/build.test.mjs                 # паритет на езиците · SEO инварианти · цени ≥15% под пазара
node ../tools/qa/static-site-check.mjs dist     # препратки · ключови думи · title/lang (repo гейтът)
node serve.mjs                                  # локален преглед на http://127.0.0.1:4180/
node tools/render-images.mjs                    # og.png + apple-touch-icon.png (само при смяна на бранда)
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
src/assets/                 site.css+js (хъб), demo.css+js (демота) — без билд, копират се в dist/assets
public/                     favicon.svg, og.png, apple-touch-icon.png (генерирани), indexnow-key.txt (публичен)
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
  отгоре го казва изрично. Никакви реални имена на хора. Без снимки: визуалът е типография + CSS карти.
- **Ключови думи** ≥5 с „Carbon Stealth“ на всяка страница — `head()` я добавя автоматично, но тестът я иска.
- **title ≤60 · description 70–160 · един h1 · canonical · hreflang bg/en/it + x-default (→ /bg/)** — гейтнати.
- **Без бисквитки, без проследяване, без backend.** Демо формите не изпращат нищо (`demo.js` показва
  съобщение). Контактът е mailto + формата на carbonstealth.eu.
- **Live прегледи в хъба**: мащабирани iframe-и на реалните демота — само ≥981px, при влизане във viewport,
  никога при Save-Data. CSP `frame-src 'self'` / `frame-ancestors 'self'` ги позволява.
- **Reveal анимациите** са само с JS (`html.js`) и с предпазен таймер — без JS всичко е видимо;
  `prefers-reduced-motion` ги изключва.
- **ДДС текстът** (BG +20% · ЕС фирми reverse charge чл. 196 Дир. 2006/112/ЕО / чл. 21 ал. 2 ЗДДС · извън
  ЕС без БГ ДДС) завършва с „не е данъчен съвет“ — не го премахвай.
- SEO промяна → `node ../tools/seo/indexnow.mjs https://portfolio.carbonstealth.eu` (ключът е в web root-а).
