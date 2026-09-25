# SECURITY.md — Evanita Sport

## Модел на заплахите (кратко)

Статичен едностраничен сайт без backend, без форми, без бисквитки, без
акаунти и без обработка на лични данни → повърхността е минимална по дизайн.

## Принципи

- **Без сървърна логика** — само статични файлове зад Nginx.
- **Security headers** в `nginx.conf`: строг CSP (script-src 'self'; frame-src
  само Google Maps; fonts само Google Fonts), `X-Frame-Options: SAMEORIGIN`,
  `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`.
- **Без проследяване** — нула аналитика, нула бисквитки → няма банер за
  съгласие; Google Maps iframe е lazy и с `no-referrer-when-downgrade`.
- **TLS** — Let's Encrypt, TLS 1.2/1.3, редирект 80 → 443.
- Непознат път връща **истинско 404** (не soft-404), скрити файлове са
  забранени, `/.well-known/` е изрично разрешен.
- IndexNow ключът (`indexnow-key.txt`) е **публичен по протокол** — не е тайна.

## Докладване на уязвимости

Пиши през https://carbonstealth.eu — отговаряме бързо и не гоним
добронамерени изследователи. Виж и кореновия `SECURITY.md`.
