# `tools/discord/` — инструменти на Дискорджията

Статични помощници за Discord ботове и webhook интеграции. Не заместват реалния тест срещу
Discord (свързване на Gateway, регистриране на команди, PING→PONG) — хващат типичните грешки
и рискове предварително.

## `discord-lint.mjs`

```bash
node tools/discord/discord-lint.mjs path/to/bot
```

Маркира:
- **HIGH** — твърдо вписан bot токен или webhook URL в кода (трябва env); HTTP interaction handler
  без **Ed25519** верификация на подписа.
- **MEDIUM** — привилегирован intent (`MESSAGE_CONTENT`/`GUILD_MEMBERS`/`GUILD_PRESENCES`) без
  обосновка; interaction отговор след `await` към външно API без **defer** (3-секунден риск);
  плътен цикъл от REST заявки без rate-limit пауза.
- **INFO** — `@everyone`/`@here` без `allowed_mentions` guard.

Изход: `0` = чисто/само INFO; `1` = има HIGH находки.

**Планирано (M):** валидатор на embed лимитите (title 256 / desc 4096 / 25 полета / ≤6000 общо),
schema проверка на slash командите, permission-bit диф между версии.

## Изисквания

Node ≥ 20. Без външни зависимости.
