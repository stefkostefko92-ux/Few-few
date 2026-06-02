---
name: seo-audit
description: >-
  Audit a website against the enterprise SEO / GEO / AEO checklist (technical
  SEO, local/geo schema, AI/voice answer optimization). Use when the user wants
  an SEO audit, to check/improve a site's search visibility, validate structured
  data (JSON-LD), prepare a site for launch, or fix Core Web Vitals / metadata /
  sitemap issues. Do NOT use for backend-only or API-only projects.
allowed-tools: Bash, Read, Edit, Write, WebFetch
---

# SEO / GEO / AEO одит (enterprise)

Проверка срещу задължителния checklist от `CLAUDE.md`. Минавай по секции,
докладвай само счупеното и какво да се поправи (не повтаряй кое е наред).

## Кога
Потребителят иска одит/подобрение на сайт за търсене, валидация на JSON-LD,
подготовка за launch, или fix на Core Web Vitals / метаданни / sitemap.

## Вход / Изход
- **Вход:** URL или път до сайта (репо/билд).
- **Изход:** отчет с FAIL/PASS по точка + конкретни fix-ове (diff/файлове).

## 1. SEO технически
- [ ] Уникален `<title>` <60 знака, `meta description` <160 — per page.
- [ ] Един `<h1>` per page, семантичен HTML5.
- [ ] `<link rel="canonical">` на всяка страница.
- [ ] `robots.txt` + `sitemap.xml` (lastmod/changefreq/priority); sitemap index при >50K URLs.
- [ ] Custom 404/500, clean URLs без query strings за контент.
- [ ] HTTPS + HSTS + security headers (CSP, X-Frame-Options, Referrer-Policy).
- [ ] Open Graph пълен набор + Twitter Card `summary_large_image`.
- [ ] `hreflang` за всеки език + `x-default`.
- [ ] JSON-LD: Organization + WebSite + BreadcrumbList на всяка страница;
      Service/Product/Article/FAQPage/HowTo/Review според съдържанието.
- [ ] Internal linking ≤3 клика от home; breadcrumbs визуални + schema.
- [ ] `alt` на всички изображения, lazy loading, WebP/AVIF, explicit
      width/height, `srcset`.
- [ ] Lighthouse 95+ на 4-те категории; LCP <2.5s, CLS <0.1, INP <200ms.
- [ ] Видима "last updated" дата + author bio (E-E-A-T).
- [ ] RSS feed за блог секции.
- [ ] Responsive на всеки device.

## 2. GEO (локално търсене)
- [ ] LocalBusiness JSON-LD: address, geo(lat/lng), openingHours, telephone,
      areaServed, priceRange.
- [ ] NAP идентичен навсякъде и в schema.
- [ ] Geo meta: geo.region, geo.placename, geo.position, ICBM.
- [ ] Локални landing pages с град/регион в title/H1/URL slug.
- [ ] Embedded карта (Google Maps или Leaflet/OSM) на contact.

## 3. AEO (AI / voice / featured snippets)
- [ ] FAQPage schema; въпрос като H2/H3; директен отговор в първото изречение.
- [ ] HowTo schema за процеси/tutorials.
- [ ] Speakable schema за voice search.
- [ ] Article schema с author/datePublished/dateModified.
- [ ] `llms.txt` в root с описание + линкове към ключови страници.
- [ ] Conversational headings (въпроси), кратки структурирани отговори.

## 4. Footer (без изключение)
- [ ] "Created and Designed by Carbon Stealth VCC" →
      `https://carbonstealth.eu`, `target="_blank" rel="noopener"`.

## Команди (бърза проверка)
```bash
set -euo pipefail
# Метаданни и H1 по HTML файлове
grep -rEl "<title>" . | while read -r f; do echo "== $f =="; done
# Валидни JSON-LD блокове (изисква node)
# Lighthouse CI (ако е инсталиран):
# npx lighthouse "$URL" --quiet --chrome-flags="--headless" --only-categories=performance,accessibility,best-practices,seo
```

## Готово =
- [ ] Всяка FAIL точка има конкретен fix (diff или файл).
- [ ] Структурираните данни валидират.
- [ ] Core Web Vitals в зелено.
