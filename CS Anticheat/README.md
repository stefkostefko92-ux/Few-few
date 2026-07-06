# CS Anticheat

Нов **FiveM античийт** на Carbon Stealth VCC — цел: да надмине двата титана в
бранша, **echo.ac** и **detect.ac**. Проприетарен, EU-hosted, GDPR-first.

> Статус: **Фаза 0 — разузнаването приключи.** 7 досиета + синтез готови.
> Още няма продуктов код. Следва фаза 1 (MVP) — виж roadmap-а в синтеза.

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
└── research/                      ← Фаза 0: разузнаване (готово)
    ├── 00-synthesis.md               ★ Синтез — теза, threat model, архитектура, roadmap
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

## Следващи фази (roadmap — детайли в `research/00-synthesis.md`)

1. ✅ **Синтез** — теза, threat model, defense-in-depth архитектура (готово).
2. **MVP** — config hardening + server-authoritative resource + backend ingestion + панел + Discord alerts.
3. **Детекция дълбочина** — behavioral AI, client integrity, heartbeat, hash-ната HWID ban мрежа.
4. **Комерсиализация** — Stripe billing, планове, onboarding, GDPR артефакти (connect notice, DPA, DPIA, appeal).

## Централен извод

echo.ac и detect.ac са **forensic „screenshare" скенери, не real-time античийтове** —
структурно не спират активен aimbot/ESP, тривиално се заобикалят (trace cleaners,
DMA/kernel слепота) и имат нулева GDPR прозрачност. Дупката: **FiveM-native,
real-time, server-authoritative** античийт с behavioral AI, споделена ban мрежа и
честен EU/GDPR модел като конкурентно предимство.
