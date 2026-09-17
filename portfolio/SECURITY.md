# SECURITY.md — Carbon Stealth Portfolio

## Модел на заплахите (кратко)

Статичен сайт без backend, без акаунти, без бисквитки, без проследяване и без обработка на лични
данни → повърхността е минимална по дизайн. Единственият вход за данни е имейл към info@carbonstealth.eu.

## Принципи

- **Само статични файлове зад Nginx**, генерирани от код с нула зависимости (нула supply-chain риск от npm).
- **Security headers** в `nginx.conf`: строг CSP без нито една трета страна (`script-src 'self'`;
  `style-src 'self' 'unsafe-inline'`; `font-src 'self'`; `img-src 'self' data:`; `frame-src`/`frame-ancestors
  'self'` — заради живите прегледи на демотата в хъба), `X-Frame-Options: SAMEORIGIN`, `nosniff`,
  `Referrer-Policy`, HSTS, `Permissions-Policy`.
- **Екраниране**: всичко потребителско минава през `esc()`; JSON-LD се сериализира с `<` → `<`.
- **Демо формите не изпращат нищо** — няма endpoint, който да бъде злоупотребен.
- **Без проследяване** → няма банер за съгласие. Шрифтовете се хостват от нас (нула заявки към Google);
  снимките са наши асети (CC BY 2.0 / Pexels, авторите и лицензът под галерията). Единственият backend-ов код е нула.
- **Конвейерите** (`tools/fonts.mjs`, `tools/photos.mjs`) тръгват РЪЧНО от машина на собственика; API ключът
  за Pexels е env променлива и никога не влиза в репото (secret-scan + guard-secrets).
- **TLS** — Let's Encrypt, TLS 1.2/1.3, редирект 80 → 443. Непознат път е истинско 404.
- **Тайни**: няма. IndexNow ключът (`public/indexnow-key.txt`) е публичен по протокол.
- Импресум + поверителност + условия на трите езика (`/bg/pravna-informacia/`, `/en/legal/`, `/it/note-legali/`).

## Докладване на уязвимости

info@carbonstealth.eu или през https://carbonstealth.eu — отговаряме бързо и не гоним добронамерени
изследователи. Виж и кореновия `SECURITY.md` и `/.well-known/security.txt`.
