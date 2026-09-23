# SECURITY.md — Evanita Sport

## Модел на заплахите (кратко)

Статичен едностраничен сайт без backend, без форми, без бисквитки, без
акаунти и без обработка на лични данни → повърхността е минимална по дизайн.

## Принципи

- **Без сървърна логика** — само статични файлове зад Nginx.
- **Security headers** в `nginx.conf`: строг CSP (script-src 'self'; frame-src
  само Google Maps; fonts само Google Fonts; `frame-ancestors 'none'`),
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `server_tokens off`. CSP пази `'unsafe-inline'` в
  `style-src` нарочно — страницата ползва inline `style=`.
- **Хедърите важат за всеки отговор, вкл. css/js/снимки.** Капан на nginx: `add_header`
  в `location` отменя ВСИЧКИ `add_header` от `server`. Кеш location-ите ползват само
  `expires`. Преди поправката (2026-09-23) css/js/снимките получаваха само HSTS и двоен
  `Cache-Control` — проверено на истински nginx.
- **Deny правилата стоят ПРЕД кеш regex-ите** — nginx проверява regex location-ите по ред
  и печели първият. Преди `/.git/x.js`, `/.hidden.css` и `CLAUDE.md` връщаха 200, ако са
  на сървъра; сега 403.
- **Симлинкове:** `rsync --no-links` не ги качва, nginx е с `disable_symlinks on
  from=$document_root` (преди симлинк сервираше файл извън сайта).
- **Ограничение на заявките:** `limit_req` 20 r/s, burst 120 на IP — нормални зареждания
  и презареждания минават, наводнение от един IP → 429. Тяло ≤ 1 KB, методи извън
  GET/HEAD → 405, `absolute_redirect off`.
- **Без проследяване** — нула аналитика, нула бисквитки → няма банер за
  съгласие; Google Maps iframe е lazy и с `no-referrer-when-downgrade`.
- **TLS** — Let's Encrypt, TLS 1.2/1.3 (1.2 само ECDHE + AEAD), без session tickets,
  редирект 80 → 443.
- **Деплой (`deploy.sh`):** rsync allowlist с `--delete-excluded` (в уеб корена е точно
  публичното; изтритото се отпечатва), собственик root и файлове 644, `sudo test` за
  сертификата, `nginx -t` с връщане на предишния конфиг при провал — един сайт не сваля
  останалите на сървъра.
- Непознат път връща **истинско 404** (не soft-404), скрити файлове са
  забранени, `/.well-known/` е изрично разрешен.
- IndexNow ключът (`indexnow-key.txt`) е **публичен по протокол** — не е тайна.

## Докладване на уязвимости

Пиши през https://carbonstealth.eu — отговаряме бързо и не гоним
добронамерени изследователи. Виж и кореновия `SECURITY.md`.
