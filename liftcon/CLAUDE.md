# CLAUDE.md — liftcon/ (LiftCon, consulenza tecnica ascensori)

Презентационен сайт на **LiftCon** — консултантска услуга за асансьори на Carbon Stealth VCC в Милано,
Città metropolitana, Monza e Brianza и цяла Ломбардия. Публика: администратори на кондоминиуми и частни лица.
**Само италиански.** Домейн: `liftcon.it` (сменя се на едно място — `src/config.mjs` или `LIFTCON_SITE_URL`).

## Стек
- `build.mjs` + `src/` — статичен генератор **без зависимости** (Node ≥22, ESM). Пише в `public/`
  детерминистично (датите от `SITE.updated`, не от часовника). `public/` се комитва; CI проверява синхрона.
- `server/` — бекендът на формата: Node 22 + TS strict + Express 5 + zod + pino; Brevo Transactional API
  (HTTPS — SMTP портовете на сървъра са блокирани). **Нищо не се пази** — само се препраща по имейл.
- `deploy/` — `nginx.conf` + `liftcon-headers.conf` (CSP, HSTS…), `deploy.sh` (бекъп → атомарна смяна → Docker →
  Nginx → health → откат). Порт на бекенда: `127.0.0.1:4370` (`LIFTCON_HTTP_PORT`).
- `art/` — 3D рендерите (three.js, bundled; правило „никога SVG“). `scripts/brand-assets.py` — растерните
  активи от `brand/liftcon-logo-originale.png`.

## Съдържание — правила (важно)
- Услугите са **т. 1–4 от каталога на клиента**; т. 5–7 (Lettera F, бревет) **не** са на сайта.
- **Т. 8 е закон за текста:** никога „verifica ufficiale“, „certificazione“, „collaudo“, „perizia“,
  „dichiarazione DM 37/2008“ като наша услуга; всяка страница за услуга има „Limiti dell'incarico“.
  Тестът `test/site.test.mjs` пази забранените думи и нормативните капани.
- **Нормативни факти — само проверени** спрямо действащия текст на Normattiva (Асансьорчика, 26.11.2026):
  modifiche costruttive = art. 2 c. 1 **lett. cc)** (не i); messa in esercizio = **60 дни** (не 10);
  **DM 23/07/2009 е отменен от TAR Lazio** — не го представяй като задължение. Източниците: `src/content/fonti.mjs`.
- Съдържание от UNI/EN норми **не влиза** (лицензът е само вътрешен) — само наименование и издание.
- Без измислени числа, години опит, клиенти, отзиви, цени, „gratuito“. Регистър: **Lei**.

## Гейт (преди „готово“)
```bash
node liftcon/build.mjs && node --test liftcon/test/*.test.mjs && node tools/qa/static-site-check.mjs liftcon/public
cd liftcon/server && npm ci && npm run typecheck && npm test
```
CI: `.github/workflows/liftcon.yml` (path-filtered).

## SEO/GEO/AEO
Всяка страница: уникален title ≤60, description ≤160, един H1, canonical, hreflang it-IT + x-default, OG/Twitter,
гео мета, ≥5 ключови думи с „Carbon Stealth“, JSON-LD `@graph` (Organization + ProfessionalService + WebSite +
WebPage + BreadcrumbList + Service/Article/FAQPage/HowTo/DefinedTermSet според страницата, Speakable).
Файлове: `sitemap.xml` (с изображения), `sitemap.txt`, `robots.txt` (AI ботове позволени), `llms.txt`,
`llms-full.txt`, `guide/feed.xml`, `site.webmanifest`, `.well-known/security.txt`, IndexNow ключ.
След промяна на живо: `node tools/seo/indexnow.mjs https://liftcon.it`.
