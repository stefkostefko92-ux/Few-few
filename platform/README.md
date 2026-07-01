# platform — пулт за управление на свързани уебсайтове

Централна платформа, към която свързвате уебсайтове и създавате акаунти с
достъп **само до определени сайтове**. За всеки сайт: мониторинг на здравето,
синхронизация на съдържание (CMS прокси), хъб с връзки/бележки и задействане на
деплой.

Stack: **Next.js 15 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL ·
Tailwind**. Сесии с JWT (`jose`, HS256) в `HttpOnly` бисквитка; пароли с bcrypt;
API ключовете на сайтовете се пазят **криптирани** (AES-256-GCM).

## Роли и достъп

| Роля на платформа | Какво вижда |
| ----------------- | ----------- |
| `OWNER` (собственик) | Всичко: свързва сайтове, създава акаунти, дава достъпи, управлява всеки сайт. |
| `MEMBER` (член) | Само сайтовете, за които собственикът е дал достъп. |

За всеки сайт членът има роля:

- **MANAGER (мениджър)** — може да действа: проверки, синхронизация, деплой, връзки.
- **VIEWER (наблюдател)** — само чете.

Логиката е в `src/lib/access-rules.ts` (чиста, покрита с тестове) и `src/lib/access.ts`
(DB обвивки). Всяко действие/страница проверява достъпа до конкретния сайт на сървъра.

## Команди (в `platform/`)

```bash
npm install
cp .env.example .env             # попълни DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY, OWNER_*
npx prisma db push               # схема (dev); или npm run prisma:migrate
npm run db:seed                  # създава собственика + демо сайт
npm run dev                      # http://localhost:3000

# Проверки на качеството (както в CI):
npm run lint
npm run typecheck
npm test                         # unit тестове (tsx --test)
npm run build
```

Вход: `/login` с `OWNER_EMAIL` / `OWNER_PASSWORD`.

## Как се свързва сайт

Собственикът добавя сайт от **Администрация → Сайтове → Свържи сайт**:

- **Публичен адрес** — проверява се за здраве (GET, без ключ).
- **API адрес** (по избор) — за издърпване на съдържание и деплой.
- **API ключ** (по избор) — праща се към сайта като `Authorization: Bearer …`
  (съхранява се криптиран).
- **Адрес за деплой** (по избор) — webhook, който платформата вика при деплой.

Договор, който всеки свързан сайт трябва да поддържа (по избор, според нуждите):

```
GET  <url>                                → здраве (публично)
GET  <apiBaseUrl>/api/platform/content    → { items: [{ id, kind, title, status?, url? }] }   (Bearer)
POST <deployHookUrl | apiBaseUrl/api/platform/deploy>  → 2xx при приет деплой               (Bearer)
```

## Периодичен мониторинг

Пазен с таен токен маршрут проверява всички активни сайтове:

```bash
curl -X POST -H "Authorization: Bearer $CRON_TOKEN" https://platform.carbonstealth.eu/api/cron/health
```

Закачете го на cron (systemd timer / GitHub Actions / външен уеб-хук) на желания интервал.

## Деплой

Продукционно върви като `zabobovdol` — **Docker Compose зад reverse proxy**
(`web` + `db`), а TLS/портовете 80/443 се поемат от външния nginx/Caddy. Билд +
вдигане + `prisma db push` + сийд (само първия път) са в `Dockerfile` и
`docker-entrypoint.sh`; `web` слуша на `127.0.0.1:${HTTP_PORT}` (по подр. 3000).

```bash
cp .env.example .env            # попълни тайните; chmod 600 .env
docker compose up -d --build
curl -fsS http://127.0.0.1:3000/api/health   # → {"status":"ok",…}
```

Интегриран е в `deploy/autodeploy.sh` (проект `platform`). Задължителни env:
`DATABASE_URL`, `AUTH_SECRET`≥32, `ENCRYPTION_KEY` (32B hex), `CRON_TOKEN`,
`OWNER_*`. Пълни стъпки, reverse proxy конфиг и cron за `/api/cron/health` — в
**`DEPLOY.md`**.

## Сигурност

- `AUTH_SECRET` ≥32 знака (кодът отказва примерната стойност).
- `ENCRYPTION_KEY` — 32 байта в hex; **задължителен в продукция**. Извън продукция
  се ползва dev ключ с предупреждение. Никога не комитвайте реален ключ.
- Строг CSP, `X-Frame-Options: DENY`, HSTS (`next.config.mjs`).
- Одит на всяко важно действие (`AuditLog`).
- Лимит на опитите за вход по IP.
