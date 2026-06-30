# Uylas Kebap Center — официален сайт

Професионален, готов за продукция сайт за **Uylas Kebap Center** — турски kebab & pizza
ресторант в **Bareggio (MI)**, Италия. Статичен сайт (HTML/CSS/JS), без билд стъпка,
без бекенд — деплой навсякъде (Apache, Nginx, Netlify, обикновен хостинг).

Език на сайта: **италиански** (източник) с **EN** превключвател. Кодът и тази документация
са на български според конвенцията на монорепото; целият UI текст е на италиански/английски.

## Структура

```
uylas/
├── index.html              едностраничен сайт: hero, меню, за нас, защо, галерия,
│                           отзиви, доставка, контакти/карта, футър, cookie банер
├── privacy.html            Политика за поверителност (GDPR, IT)
├── cookie.html             Политика за бисквитки (ePrivacy, IT)
├── 404.html                персонализирана грешка
├── css/style.css           дизайн система (палитра „жар/пламък/злато“, отзивчив)
├── js/app.js               i18n IT/EN, табове на менюто, мобилна навигация,
│                           cookie consent, карта с consent gating, scroll ефекти
├── img/                    лого (SVG), favicon, mark — векторни, без растер
├── robots.txt, sitemap.xml, llms.txt, manifest.webmanifest
├── .well-known/security.txt
└── .htaccess               security headers, HTTPS/www redirect, gzip, cache
```

## Локален преглед

Няма билд. Просто статичен сървър:

```bash
cd uylas
python3 -m http.server 8080      # → http://localhost:8080
```

## Реални данни на бизнеса (вградени)

- **Адрес:** Via Milano 102, 20008 Bareggio (MI)
- **Телефон:** +39 329 409 4420
- **Работно време:** всеки ден 12:00–24:00
- **Оценка:** 4.6/5 в Google
- **Доставка:** Just Eat, Deliveroo
- **Соц. мрежи:** Facebook, Instagram (@uylas_kebab_cornaredo_bareggio)

## ⚠️ Преди пускане в продукция (попълни/замени)

1. **`og:image`** — добави реална снимка `img/og.jpg` (1200×630) за споделяне в соц. мрежи.
2. **Снимки** — замени CSS placeholder-ите в „Галерия“ и „За нас“ с реални фотографии
   (`img/`), включително самото меню. Това дава най-голям ефект.
3. **Меню и цени** — цените в `index.html` са **примерни**; синхронизирай с реалното меню.
4. **Юридическо лице** — в `privacy.html`, `cookie.html` и футъра попълни **юридическо
   наименование, Partita IVA и e-mail** на бизнеса (маркирани като „da inserire“).
5. **Домейн** — каноничните URL сочат към `https://uylas-kebap-center.it/`; смени при нужда.
6. **Google Business / отзиви** — отзивите са примерни; може да се свържат с реални.

## Съответствие (EU)

- Cookie банер с **изричен избор** (Accetta tutti / Solo necessari) — без предварителни
  cookie-та; Google Maps се зарежда **само след съгласие** (consent gating).
- Politica privacy + cookie по GDPR / ePrivacy с линкове и права на субекта.
- Само технически localStorage ключове по подразбиране (`uylas_lang`, `uylas_consent`).

## Достъпност и качество

- Семантичен HTML, `aria-*` за табове/навигация/диалог, skip-link, focus-visible.
- Пълно зачитане на `prefers-reduced-motion` (спира embers, float, marquee, reveal).
- Без inline скриптове — строг CSP (`script-src 'self'`). Никакъв външен JS/тракер.
- Responsive mobile-first; векторно лого (без тежки изображения).

## Деплой

Статични файлове → произволен уеб сървър. За Apache `.htaccess` вече налага HTTPS,
www→non-www, security headers, gzip и кеш. За интеграция с автоматизирания деплой на
монорепото виж `deploy/` в корена.
