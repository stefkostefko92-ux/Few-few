# CS Anticheat

Нов **FiveM античийт** на Carbon Stealth VCC — цел: да надмине двата титана в
бранша, **echo.ac** и **detect.ac**. Проприетарен, EU-hosted, GDPR-first.

> Статус: **Фаза 0 — дълбоко разузнаване** (research). Още няма продуктов код.
> Продуктовата архитектура се пише след като разузнаването приключи.

## Защо

Server owners в FiveM плащат месечно на echo.ac / detect.ac, но и двата се
заобикалят (spoofers, kernel/DMA cheats), имат false positives, performance
overhead и **нулева GDPR прозрачност**. Има място за по-добър продукт: по-точна
детекция, споделена ban мрежа, честен ценови модел и правна изрядност като
конкурентно предимство за EU пазара.

## Структура

```
CS Anticheat/
├── README.md                      ← този файл
└── research/                      ← Фаза 0: разузнаване (пише се от агентите)
    ├── 01-fivem-cheat-landscape.md   Геймъра — cheat екосистема (враг intel)
    ├── 02-echo-ac.md                 Кодаджията — echo.ac security teardown
    ├── 03-detect-ac.md               Кодаджията — detect.ac security teardown
    ├── 04-tech-foundation.md         VPS-аджията — CFX API, kernel, backend, infra
    ├── 05-gdpr-legal.md              Правният Разбирач — законност HWID/screenshot
    ├── 06-market-pricing.md          Продавача — пазар, цени, SaaS модел
    └── 07-discord-integration.md     Дискорджията — Discord alerts/bot дизайн
```

## Метод

Разузнаването се прави от специализираните ни субагенти (`.claude/agents/`), всеки
през своята лупа и с активния self-learning loop (`SubagentStop → _memory`), така
че наученото остава в паметта на агента за следващите фази.

## Следващи фази (след разузнаването)

1. **Синтез** — обединяване на 7-те доклада в продуктова архитектура + threat model.
2. **MVP** — server-side detection resource + backend ingestion + панел + Discord alerts.
3. **Детекция дълбочина** — client integrity, screenshot, HWID мрежа, behavioral/ML.
4. **Комерсиализация** — Stripe billing, планове, onboarding, GDPR артефакти.
