# Eternal Touch — поправки след одит (2026-07-09)

Одит от агентите на Carbon Stealth (Кодаджията · Правния Разбирач · SEO · VPS-аджията)
и приложени поправки. Всички промени са runtime-проверени (сайтът буутва, страниците
рендерират, hreflang/CSP/шрифтове проверени).

## ⚠️ ЗАДЪЛЖИТЕЛНО РЪЧНО ДЕЙСТВИЕ — ротирай тайните

`.env` и `CREDENTIALS.txt` бяха извадени от този архив (изтекоха в носим файл). Смятай
за компрометирани и **ротирай на сървъра всички**:

- `JWT_SECRET`, `COOKIE_SECRET`, `SESSION_SECRET` — `openssl rand -base64 48`
- `DB_PASSWORD` (после `docker compose down && up -d --build` + смяна на паролата в Postgres)
- `ADMIN_PASSWORD` (нов силен; влез и смени)
- `SMTP_PASS` / паролата на пощата `info@eternaltouch.it` (беше същата — смени я в Register.it)

Пази тайните само в `.env` на сървъра (`chmod 600`), никога в git/архив/Docker image.

## Приложени поправки по код

### Сигурност
- Fail-fast при липсващ/къс `JWT_SECRET`/`COOKIE_SECRET`/`ADMIN_PASSWORD` (без вградени дефолти).
- JWT алгоритъм пиннат (`HS256`) при подпис и проверка.
- Админ cookie → `SameSite=Strict` (CSRF втвърдяване); премахнати мъртви `csurf`/`express-session`.
- `/healthz` вече връща само `{ok,timestamp}` (без Node версия/env/броячи от БД).
- Строг rate limit на `/api/contact` (5 / 15 мин / IP) срещу спам + email амплификация.
- 5xx грешки не изтичат `err.message` към API клиенти.
- `uncaughtException` вече прекратява процеса (рестарт от Docker) вместо да сервира в неопределено състояние.
- Path-traversal guard при триене на качени файлове (`safeUnlinkPublic`, само в `uploads/`).
- Open-redirect guard на `/lang/:code` (само same-site относителни пътища).
- JSON-LD изход екраниран (`</script>` breakout защита).
- CSP затегнат (`object-src none`, `base-uri`, `frame-ancestors`), без Google хостове.

### GDPR / право
- **Google Fonts self-hosted** (`/fonts/`, latin+кирилица) — нула заявки към Google, нула IP трансфер.
- Контактната отметка е „запознаване с Политиката", основание 6(1)(б)/(е) (не „съгласие").
- Одит-следата вече пази само timestamp (без пълен User-Agent) — минимизиране.
- 24-мес. retention реално наложен (дневен purge на стари `ContactMessage`).
- Register.it (SMTP) добавен като обработващ по чл.28 в Политиката.
- ODR платформата (закрита 20.07.2025) заменена с препратка към АРС органи (IT/BG), и в трите езика.
- Премахнат фалшивият „PEC"; ЕИК обозначен и като ДДС № (ЕС) в импресума.

### SEO / достъпност
- Счупеният hreflang поправен — canonical и алтернативите вече са коректни на всички IT/EN страници.
- Езиковият превключвател сочи реални префикс-URL (`/`, `/it`, `/en`) — вътрешни връзки + дедупликация.
- `og:image` → реалния `.jpg`; og/twitter title с fallback.
- Добавен `mobile-web-app-capable`; генерирани `favicon.ico` + `apple-touch-icon.png`.
- Поправен двоен `</a>` в хедъра; skip-link с коректен текст (нов locale ключ `common.skipToContent`).
- `aria-live` на статуса на формата; width/height на статичното лого.
- Product `Offer` → валиден `priceSpecification` (без невалидна цена).

### Деплой / инфраструктура
- `docker-compose`: `env_file: .env` (поправя тихо изключените имейл известия) + хардънинг
  (`cap_drop: ALL`, `no-new-privileges`, `mem_limit`, `pids_limit`).
- `.dockerignore`: блокира `CREDENTIALS.txt`, `.env.*`, `*.pem`, `*.key`.
- nginx: модерен TLS профил + session cache + OCSP stapling, `http2 on;`, security headers
  повторени на статиката/uploads (add_header не се наследява), gzip за `application/xml`.
- certbot: `--deploy-hook "systemctl reload nginx"` + renew_hook (авто-reload при подновяване).
- `DEPLOYMENT.md`/`.env.example`: без вградена парола; генерира се на сървъра; SMTP/SESSION добавени.

## Останало за теб (по избор)
- AEO: кратък фактологичен абзац „кои сме/какво правим/къде" високо на началната (редактира се от админ панела).
- `multer` е на 1.4.5-lts (закърпен); ъпгрейд до 2.x е по-голяма промяна — по желание.
- robots.txt допуска обучаващи AI ботове — съзнателен избор; потвърди дали го искаш.
