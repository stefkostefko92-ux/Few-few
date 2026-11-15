# Content Plan — Carbon Stealth VCC

Цел: повече импресии в търсенето чрез покриване на реален intent (long-tail),
топикална авторитетност и повърхности за цитиране от AI (AEO). Основен пазар:
Италия (IT), после EN и BG. Всяка статия е трилингвална (it/en/bg), answer-first,
с FAQPage schema, вътрешни линкове и CTA. Генерира се през `scripts/generate-blog.py`.

Правила за качество (за да НЕ ни накаже Google за „scaled content"):
- 500–800 думи реално, полезно съдържание на език (не машинен превод дума по дума).
- Никакви измислени статистики, отзиви или клиенти.
- Цени, консистентни със сайта: сайт от €800, e-commerce от €1.200, софтуер от
  €2.000, ERP от €5.000, app от €3.000, SEO от €500/мес.
- Всяка статия линква към 3–4 реални вътрешни страници (услуги/гео).

## Batch 1 — в процес (8 статии × 3 езика = 24 страници)

Комерсиален intent (пари) + информационен авторитет:

| # | slug | Основна ключова фраза (IT) | Intent |
|---|------|----------------------------|--------|
| 1 | quanto-costa-sito-web | „quanto costa un sito web" | Комерсиален / BOFU |
| 2 | quanto-costa-ecommerce | „quanto costa un e-commerce" | Комерсиален |
| 3 | woocommerce-vs-shopify | „woocommerce vs shopify" | Сравнение / MOFU |
| 4 | sito-vetrina-o-ecommerce | „sito vetrina o e-commerce" | Сравнение |
| 5 | quanto-costa-app-mobile | „quanto costa un'app" | Комерсиален |
| 6 | cos-e-un-erp | „cos'è un erp" | Информационен / AEO |
| 7 | seo-per-piccole-imprese | „seo per piccole imprese" | Информационен |
| 8 | core-web-vitals-guida | „core web vitals" | Информационен / AEO |

## Batch 2 — следващи (roadmap)

| slug | Тема | Intent |
|------|------|--------|
| app-nativa-vs-pwa | Нативно приложение vs PWA | Сравнение |
| migrazione-sito-senza-perdere-seo | Смяна на сайта без загуба на позиции | Информационен |
| sicurezza-sito-web-checklist | Сигурност на сайт — чеклист | Информационен |
| quanto-tempo-per-un-sito | Колко време отнема сайт | Комерсиален |
| landing-page-che-converte | Landing page с висока конверсия | MOFU |
| headless-cms-vantaggi | Headless CMS — кога и защо | Информационен |
| integrazione-pagamenti-online | Онлайн плащания (Stripe/PayPal) | Информационен |
| erp-vs-gestionale | ERP vs класически gestionale | Сравнение |
| accessibilita-web-eaa-2025 | Уеб достъпност (EAA) — задължения | Информационен / правен |
| schema-markup-guida | Structured data / JSON-LD гайд | Информационен / AEO |
| chatgpt-perplexity-citazioni | Как да те цитират AI търсачките | AEO |
| reverse-engineering-ricambi-3d | Reverse engineering + 3D печат на резервни части | Ниша / уникален |
| plc-modbus-integrazione | PLC/Modbus интеграция (индустрия) | Ниша B2B |
| hosting-vps-vs-condiviso | VPS vs споделен хостинг | Информационен |
| velocizzare-wordpress | Ускоряване на WordPress | Информационен |
| preventivo-sito-web-come-leggerlo | Как да четеш оферта за сайт | BOFU |

## Гео × услуга комбинации (мащаб)

Има вече 60 гео страници („Siti Web {град}"). Следваща фаза: добавяне на
услуга×град статии за най-силните комбинации (напр. „E-commerce Milano",
„ERP Sofia") — през разширение на `generate-geo.py`. Правят се само когато има
реално уникално локално съдържание (иначе е doorway spam).

## Каденс

- 2–4 статии/седмица от roadmap-а, с реални `dateModified` при обновяване.
- Всяка нова статия → добавяне в 3-те blog hub-а + `sitemap-blog.xml` +
  IndexNow ping за бързо индексиране.
- На 30/60/90 дни: преглед в Search Console кои носят импресии и
  разширяване на печелившите теми (topic clusters).
