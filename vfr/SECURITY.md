# SECURITY.md — V.F.R.

## Модел на заплахите (кратко)

Статичен сайт витрина без backend, без форми, без бисквитки, без акаунти и без
аналитика → повърхността е минимална по дизайн. Единствените лични данни на
страницата са публичните контакти на фирмата (NAP), публикувани по нейно желание.

## Принципи

- **Без сървърна логика** — само статични файлове зад Nginx.
- **Security headers** в `nginx.conf`: строг CSP (`script-src 'self'`, `style-src 'self'`
  **без `'unsafe-inline'`** — нула inline стилове, и 404 ползва `css/404.css`; шрифтове
  self-hosted, `frame-src` само Google Maps, `frame-ancestors 'none'`), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, HSTS, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
  `server_tokens off`. TLS 1.2 само с ECDHE + AEAD шифри, без session tickets.
- **Хедърите важат за всеки отговор, вкл. css/js/снимки/шрифтове.** Капан на nginx: `add_header`
  в `location` отменя ВСИЧКИ `add_header` от `server`. Затова location-ите за кеш ползват само
  `expires`. Нов `add_header` в location = повтори целия набор или не го слагай.
- **Минимум данни към Google:** картата се зарежда с `referrerPolicy=strict-origin-when-cross-origin`
  (праща само origin-а, не пълния URL).
- **Нула заявки към трети страни преди действие на потребителя:** шрифтовете са
  локални (без Google Fonts), картата на Google се зарежда **само след клик**
  (click-to-load) — затова няма нужда от банер за бисквитки.
- Служебните файлове (`CLAUDE.md`, `SECURITY.md`, `package.json`, `tools/`,
  `nginx.conf`, `deploy.sh`, `images/photos.json`) не се копират от `deploy.sh` (allowlist),
  а Nginx ги забранява като втори слой.
- **Деплоят не може да остави счупен nginx:** `deploy.sh` пише конфига, пуска `nginx -t` и при
  провал връща предишния (или маха новия), без reload — един продукт не сваля останалите на VPS-а.
- Уеб коренът е собственост на **root** (файлове 644, папки 755) — nginx worker-ът само чете.
- CI actions са **пинати по SHA**, `persist-credentials: false`, `permissions: contents: read`.
- Непознат път връща **истинско 404**; скритите файлове са забранени,
  `/.well-known/` е изрично разрешен.
- IndexNow ключът (`indexnow-key.txt`) е **публичен по протокол** — не е тайна.
- `tools/fetch-photos.mjs` сваля само от домейни в allowlist (Unsplash/Pexels) и
  приема само `image/*` отговори; нищо от свалените файлове не се изпълнява.

## Докладване на уязвимости

Пиши през https://carbonstealth.eu — отговаряме бързо и не гоним добронамерени
изследователи. Виж и кореновия `SECURITY.md`.
