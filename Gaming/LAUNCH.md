# АСО — Контролен списък за официално пускане

Статус на кодовата база и какво трябва да направи **собственикът** преди go-live.
(Това не е правен съвет — правните текстове изискват преглед от юрист.)

## ✅ Готово в кода

- **Сигурност**: httpOnly + SameSite cookies, JWT pin (HS256), CSRF Origin guard,
  rate-limit (IP + per-account login), helmet, nginx HSTS + CSP, argon2, Zod
  валидация навсякъде, Stripe webhook с подпис + идемпотентност, 0 известни
  уязвимости (`pnpm audit --prod`).
- **Надеждност**: HTTP timeouts, graceful shutdown (realtime финализира живи
  мачове), crash-only при uncaughtException, SMTP/Stripe timeouts, correlation
  IDs (x-request-id), бот заместване + reclaim.
- **Наблюдаемост**: Prometheus `/metrics` на api (RED HTTP), realtime (активни
  мачове/сокети/лобита) и worker (job counters на :9091). Sentry (env-gated) с
  PII scrubbing. Структурирани логове (pino) с redaction.
- **Достъпност (WCAG 2.1 AA)**: семантика, фокус-капан в модали, aria-live
  грешки, контраст, `<html lang>` синхрон, етикети на иконо-бутони.
- **i18n**: BG/EN/IT с пълен паритет в web приложението (вкл. лоби + Магнат).
- **GDPR**: експорт + изтриване (анонимизация) на акаунт; 18+ съгласие при
  регистрация (записано в `termsAcceptedAt`); правни линкове в футъра.
- **Тестове**: game-core 193, api 29 (auth + stripe webhook), realtime 15, web +
  Playwright e2e (room flow). CI gate: typecheck + lint + test + build.
- **PWA/SEO**: manifest, OG/Twitter, robots, sitemap (marketing).

## 🔧 Само собственикът (операции — НЕ в репото)

1. **Тайни в прод** (никога в git): `JWT_SECRET`, `JWT_REFRESH_SECRET`
   (≥32 знака), `INTERNAL_API_SECRET`, `DATABASE_URL`, `REDIS_URL`,
   `COOKIE_DOMAIN` (apex домейн), `CORS_ORIGINS` (реалните origins).
2. **Stripe**: реални `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` +
   `VITE_STRIPE_PK`; регистрирай webhook към `/webhooks/stripe`. Без тях
   магазинът връща 503 (останалото работи).
3. **Email/SMTP**: `SMTP_HOST` и т.н., иначе verify/reset писмата само се
   логват (в прод се изпускат).
4. **OAuth** (по избор): Google/Facebook id+secret + callback URL-и.
5. **TLS/DNS**: `certbot --nginx` за домейна (HSTS/CSP вече са в конфигурацията);
   насочи DNS към VPS-а.
6. **DB миграции**: `pnpm --filter @aso/db migrate:deploy` срещу прод базата
   (НЕ `db push`). Резервно копие преди това.
7. **Мониторинг**: насочи Prometheus да scrape-ва `/metrics` на трите услуги
   (зад защитна стена/само вътрешна мрежа — не са на публичния vhost).
8. **Sentry** (по избор): задай `SENTRY_DSN`; дръж `SENTRY_TRACES_SAMPLE_RATE=0`
   в прод (PII минимизация).
9. **Правен преглед**: Общи условия, Поверителност, Бисквитки, Отговорна игра,
   18+ и imprint трябва да се прегледат от юрист за съответната юрисдикция.

## 📌 Препоръчани (след пускане, не блокиращи)

- e2e в CI (изисква вдигане на стека в pipeline-а).
- Worker: season rollover / quest lifecycle тестове.
- Per-game OpenGraph изображения; OpenAPI документация.
- Лимити за отговорна игра (сесиен таймер / self-exclusion) за SVARA.
