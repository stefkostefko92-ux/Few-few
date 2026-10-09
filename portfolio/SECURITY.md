# SECURITY.md — Carbon Stealth Portfolio

## Модел на заплахите (кратко)

Статичен сайт без акаунти, без бисквитки и без проследяване + ЕДНО динамично парче: контактният API
(`api/server.mjs`, `node:http`, 127.0.0.1:4187 зад Nginx `location /api/`, `POST /api/contact` + `GET /api/health`,
имейл през Brevo). Лични данни се обработват само през формата в хъба и имейла към info@carbonstealth.eu.

## Принципи

- **Статични файлове зад Nginx**, генерирани от код с нула runtime зависимости (нула supply-chain риск от npm);
  `sharp` е devDependency само за конвейера на снимките и не стига до сървъра.
- **Контактният API**: валидация на всяко поле, honeypot, лимит 5 заявки / 15 мин на IP (само в паметта),
  тяло ≤16 KB, JSON само обект (иначе 400), структурирани логове без PII, тайните САМО в `/etc/portfolio-api.env`
  mode 600, systemd под `www-data` (`deploy/portfolio-api.service`, `api/README.md`).
- **Security headers** в `nginx.conf`: строг CSP без нито една трета страна (`script-src 'self'`;
  `style-src 'self' 'unsafe-inline'`; `font-src 'self'`; `img-src 'self' data:`; `frame-src`/`frame-ancestors
  'self'` — заради живите прегледи на демотата в хъба), `X-Frame-Options: SAMEORIGIN`, `nosniff`,
  `Referrer-Policy`, HSTS, `Permissions-Policy`.
- **Екраниране**: всичко потребителско минава през `esc()`; JSON-LD се сериализира с `<` → `<`.
- **Демо формите не изпращат нищо** (само съобщение в браузъра); единственият endpoint е `/api/contact` горе.
- **Без inline скриптове**: CSP е `script-src 'self'` — всеки скрипт е файл в `/assets/` (коренът `/` пренасочва
  през `assets/root.js`; inline версията се блокираше в продукция).
- **Без проследяване** → няма банер за съгласие. Шрифтовете се хостват от нас (нула заявки към Google);
  снимките са наши асети (CC BY 2.0 през Open Images, авторите и лицензът под галерията).
- **Конвейерите** (`tools/fonts.mjs`, `tools/photos.mjs`) тръгват РЪЧНО от машина на собственика; API ключът
  за Pexels е env променлива и никога не влиза в репото (secret-scan + guard-secrets).
- **TLS** — Let's Encrypt, TLS 1.2/1.3, редирект 80 → 443. Непознат път е истинско 404.
- **Тайни**: само ключът на Brevo, на сървъра (виж горе); никога в репото или архива. IndexNow ключът (`public/indexnow-key.txt`) е публичен по протокол.
- Импресум + поверителност + условия на трите езика (`/bg/pravna-informacia/`, `/en/legal/`, `/it/note-legali/`).

## Докладване на уязвимости

info@carbonstealth.eu или през https://carbonstealth.eu — отговаряме бързо и не гоним добронамерени
изследователи. Виж и кореновия `SECURITY.md` и `/.well-known/security.txt`.
