# CS Anticheat — Backend + панел

Приема screenshare докладите от скенера, съхранява ги, показва ги в минимален
панел и алармира в Discord. **Node ESM + Express.**

## Пускане

```bash
cp .env.example .env         # попълни CSAC_SECRET и др.
npm install
npm start                    # слуша на :8787
```

Генерирай HMAC тайна: `openssl rand -hex 32` → сложи я и в backend-а (`CSAC_SECRET`),
и подай на скенера (`-secret` / `CSAC_SECRET`).

## Endpoints

| Метод | Път | Описание |
|---|---|---|
| `POST` | `/api/v1/reports` | Приема доклад. HMAC (`X-CSAC-Signature: sha256=…`) verify. → `201 {id,url,verdict,score}` |
| `GET` | `/r/:id` | HTML преглед на доклад |
| `GET` | `/api/v1/reports/:id` | JSON на доклад |
| `GET` | `/` | Списък последни доклади (защитен с `?key=CSAC_PANEL_TOKEN` ако е зададен) |
| `GET` | `/healthz` | Health check |

## Сигурност

- **HMAC verify** (constant-time) на всеки доклад — без валиден подпис → `401`.
  Ако `CSAC_SECRET` е празна → dev режим (verify изключен, с предупреждение).
- **Path-traversal защита** — `reportId` се валидира с regex преди файлов достъп.
- **Discord** — `allowed_mentions:{parse:[]}` срещу `@everyone` injection през
  полета на доклада.
- **Панел токен** — списъкът може да се заключи с `CSAC_PANEL_TOKEN`.

## Съхранение

MVP: JSON файлове в `CSAC_DATA_DIR` (по подр. `server/data/reports`). Абстракцията
`Store` (`src/store.js`) е проектирана за смяна с **PostgreSQL + Prisma** без промяна
по route-овете (виж `../research/00-synthesis.md` — backend архитектура).

## Discord alert

При доклад с присъда ≥ `CSAC_ALERT_MIN` (по подр. `suspicious`) се праща rich embed:
хост, HWID (съкратен), сървър, тежести, топ находки, линк към панела. Задай
`CSAC_DISCORD_WEBHOOK`.

> Пълният дизайн (action бутони Ban/Kick/Appeal, `/ac` slash bot, live sticky) е в
> `../research/07-discord-integration.md` — следваща фаза.
