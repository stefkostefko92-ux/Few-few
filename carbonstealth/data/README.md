# Carbon Stealth — dataset от живия сайт

Машинно-четимо извлечение на **АБСОЛЮТНО ВСИЧКО** от живия сайт
https://carbonstealth.eu (Vite React SPA + prerender HTML), снето на
**2026-07-10** от локално огледало (126 prerender-нати страници + SPA бъндъла
`assets/index-B1S7a37X.js`, sitemap-и, feed.xml, robots.txt, llms.txt).
Текстовете са **дословни** — това е source of truth за новия сайт.

## Файлове

| Файл | Съдържание |
|------|-----------|
| `design-tokens.json` | Пълната дизайн система от бъндъла: цветова палитра (hex + всички rgba варианти с употреба), шрифтове (Inter Tight 100–900, Space Mono), tracking/typography скали, бордюри, breakpoints, custom курсор, всички CSS keyframes и **23 JS/canvas/WebGL ефекта** (boot, particle text, monument, print forge…) |
| `site.json` | Организацията: име, слоган, адрес, EIK/VAT BG208725180, телефони (IT/BG), email, работно време, соц. мрежи, founder, гео координати, ценоразпис в JSON-LD, **пълният JSON-LD @graph** от началната страница, manifest.webmanifest, llms.txt (дословно), контакт/monument API, админ панел |
| `content.it.json` / `content.en.json` / `content.bg.json` | Цялото UI съдържание на езика от бъндъла: 54 UI ключа (nav, hero, about, CTA, cookie банер, форма), **13 услуги** (n/t/d/tags), ценоразпис, статистики, портфолио (5), продукти (4), **11 World Firsts**, FAQ (6), футър (3 колони + бадж/копирайт), monument етикети, boot секвенция, декоративни низове + **`pages`** — съдържанието на всички 17 статични prerender страници на езика (услуги, правни, hub, home, test) с видими блокове, суров HTML и noscript AEO съдържание |
| `blog.json` | Всичките 5 статии × 3 езика: title/meta/h1/дата/пълно тяло (структурирани блокове) + noscript + пълния JSON-LD на всяка |
| `geo.json` | Всичките 20 града × 3 езика: title/meta/h1/hero интро/секции (услуги+цени, FAQ, съседни градове)/координати/JSON-LD |
| `seo.json` | За **всеки от 126-те URL-а**: title, description, canonical, hreflang, og/twitter/geo тагове, robots, JSON-LD типове. Плюс: robots.txt (суров + резюме: AI ботове allow, Ahrefs/Semrush/MJ12/DotBot disallow), трите sitemap-а (парсирани), feed.xml, SPA-инжектираните мета тагове |
| `assets/` | `logo.png` (**внимание: реално е JPEG**, 1373×585), `og-image.png` (1200×630), `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `manifest.webmanifest`, `feed.xml` |

## Откъде какво идва

- **SPA бъндълът** (`index-B1S7a37X.js`, ~157KB min) съдържа: i18n речника
  (54 ключа × 3 езика), 13-те услуги, FAQ, футъра, продуктите, портфолиото,
  World Firsts, всички ефекти и дизайн константите (`#00e5ff`, `0,229,255`).
  **НЕ съдържа**: блог статиите, geo страниците, правните страници, цените.
- **Prerender HTML страниците** съдържат: блога (пълен текст), geo градовете,
  услугите с цените (€800/€1.200/€2.000/€5.000/€3.000/€500/€29 на месец),
  правните страници (privacy/cookie/termini), chi-siamo/contatti и богато
  noscript AEO съдържание.
- **robots.txt и llms.txt** са снети от живия сайт (липсваха в огледалото).

## Особености, забелязани при извличането (така е в източника)

- Блогът е с **различна пълнота по език**: IT = пълни статии, EN = съкратени,
  BG = 1 абзац резюме.
- Продуктовите описания (Nexus Dominion, CS Anti-Cheat, Treti Mart, CS ERP
  Demo) са **само на италиански** в бъндъла — еднакви за трите езика.
- Noscript AEO съдържанието на BG/EN правни и „за нас“ страници на места е
  **италианското** (напр. `bg/za-nas.html` носи noscript на chi-siamo).
- `test.html` е интерактивен инструмент „Анализ на сайта“ — текстовете му са в
  inline `<script>` шаблони, затова е приложен суровият HTML (`pages.test.rawPageHtml`).
- Бъндълът реферира lazy chunk `three-B6Q6Cxwm.js` (Three.js) — **не беше в
  огледалото**, само визуален runtime, без съдържание.
- Иконите `icon-192.png` / `icon-512.png` от manifest-а не бяха в огледалото.
- В бъндъла има скрит **CS MONITOR админ панел** (Ctrl+Shift+A) — вътрешен
  мониторинг (VPS метрики, лийдове, SMTP); не е публично съдържание и не е
  извлечен дословно (отбелязан в `site.json.adminPanel`).
- Umami analytics е подготвен, но закоментиран в HTML.

## Какво НЕ успя да се извлече

- `three-B6Q6Cxwm.js` (lazy Three.js chunk) — липсва в огледалото; не съдържа текст.
- `icon-192.png`, `icon-512.png` — липсват в огледалото.
- `/api/contact.php` и `/api/monument.php` — сървърни endpoint-и (PHP), кодът им
  не е публичен; договорите им са документирани в `site.json`.
