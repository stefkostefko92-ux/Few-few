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
  `nginx.conf`, `deploy.sh`, `images/photos.json`) не се копират от `deploy.sh` (allowlist,
  `--delete-excluded` трие и стари копия), а Nginx ги забранява като втори слой. **Deny правилата
  стоят ПРЕД кеш regex-ите** — nginx проверява regex location-ите по ред и печели първият; обратният
  ред пускаше `/.git/x.js` и `/.secret/y.png` с 200 (възпроизведено от червения екип).
- **Симлинкове:** `rsync --no-links` не ги качва, nginx има `disable_symlinks on from=$document_root`,
  CI пада при симлинк в `vfr/`. Без това симлинк от комит чете всеки файл, достъпен за nginx.
- **Ограничение на заявките:** `limit_req` 20 r/s, burst 120 на IP (едно зареждане ≈ 22 заявки;
  4 бързи презареждания минават; наводнение от 600 → ~450×429). Тяло на заявка ≤ 1 KB, методи
  извън GET/HEAD → 405. `absolute_redirect off` — пренасочванията не отразяват Host заглавката.
- `deploy.sh` приема само валидно DNS име в `DOMAIN` (иначе `../../etc` би насочил `rsync --delete` към /etc).
- **Деплоят не може да остави счупен nginx:** `deploy.sh` пише конфига, пуска `nginx -t` и при
  провал връща предишния (или маха новия), без reload — един продукт не сваля останалите на VPS-а.
- Уеб коренът е собственост на **root** (файлове 644, папки 755) — nginx worker-ът само чете.
- CI actions са **пинати по SHA**, `persist-credentials: false`, `permissions: contents: read`.
- Непознат път връща **истинско 404**; скритите файлове са забранени,
  `/.well-known/` е изрично разрешен.
- IndexNow ключът (`indexnow-key.txt`) е **публичен по протокол** — не е тайна.
- `tools/fetch-photos.mjs` сваля само по **https** от домейни в allowlist (Unsplash/Pexels), приема
  само `image/*` отговори до 15 MB и екранира `alt`; нищо от свалените файлове не се изпълнява.
- **Проверено на истински nginx** (1.24, 2026-09-23): седемте хедъра на html/css/avif/404, 403 за
  скрити/служебни/симлинкнати файлове, 200 за публичните, 405 за POST, относителен 301.
- **За сървъра (извън това репо):** catch-all `listen 443 ssl default_server; ssl_reject_handshake on;`,
  за да не стане vfr сървърът по подразбиране за чужди имена; nginx ≥ 1.25.1 заради `http2 on`.

## Докладване на уязвимости

Пиши през https://carbonstealth.eu — отговаряме бързо и не гоним добронамерени
изследователи. Виж и кореновия `SECURITY.md`.
