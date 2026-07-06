# CLAUDE.md — CS Anticheat

Насоки за AI асистенти по **CS Anticheat** — FiveM античийт на Carbon Stealth,
целящ да надмине echo.ac и detect.ac. Проприетарен, EU-hosted, **GDPR-first**.

> Продуктът е **два компонента, различни toolchain-и** — `cd` в компонента и не
> смесвай зависимости (както в целия монорепо).

## Компоненти

| Дир | Компонент | Stack | Пускане |
|---|---|---|---|
| `client/` | Screenshare скенер (`.exe`) | **Go 1.25+**, cross-compile към Windows | `./build.sh` → `dist/CSAnticheat.exe` |
| `server/` | Backend + панел | **Node ESM + Express** | `npm start` (:8787) |
| `research/` | Разузнаване (Фаза 0) | Markdown | — |

## Как работи (поток)

1. Играчът пуска `CSAnticheat.exe` при screenshare проверка.
2. Скенерът сканира Windows forensic артефакти (процеси, Prefetch, регистър/BAM,
   драйвери, DMA устройства, файлове), прави **хеширан** HWID, сглобява доклад.
3. Докладът се записва локално и по избор се качва към backend-а
   (`POST /api/v1/reports`, подписан с **HMAC**).
4. Backend-ът съхранява, показва в панел (`/r/:id`) и алармира в **Discord**.

## Правила за този продукт

- **Go клиентът е Windows-only по функция.** Реалните модули са зад
  `//go:build windows`; не-Windows има stub, за да минава `go build ./...`.
  Винаги компилирай с `GOOS=windows`. Не добавяй CGO (`CGO_ENABLED=0`) — искаме
  single static `.exe` без зависимости.
- **Никакви сурови идентификатори не напускат машината** — само salted SHA-256
  (GDPR data-minimisation). `salt` и HMAC `secret` идват от env/флаг, **не в repo**.
- **Всяка находка е хипотеза, не присъда.** Крайното решение е на човек
  (GDPR чл. 22 — виж `research/05-gdpr-legal.md`). Автоматичен permanent ban без
  human review е правен риск — не го добавяй без изричен ъпдейт по правния слой.
- **Сигнатурите** (`client/internal/signatures/`) идват от разузнаването
  (`research/01`). Разширявай ги с източник, не по догадка.
- **Не комитвай бинарки** — `client/*.exe` и `client/dist/` са в `.gitignore`.
  `.exe`-то е build артефакт (deploy моделът е ZIP, виж root `CLAUDE.md`).
- **Не комитвай `server/.env`** — тайните са на сървъра (mode 600).

## Качествен gate преди „готово"

```bash
# client
cd client && GOOS=windows go vet ./... && GOOS=linux go build ./... && ./build.sh
# server
cd server && npm install && node --check src/index.js && npm test
```

## Roadmap (следващи фази)

Пълният план е в `research/00-synthesis.md`. Накратко:
- **Фаза 2** — server-authoritative FiveM ресурс (config hardening + OneSync
  детекция за god mode/teleport/event-spam) + behavioral AI за DMA; hash-ната
  HWID ban federation мрежа. **Тук влиза Геймъра** (FiveM Lua).
- **Фаза 3** — Stripe billing + планове (виж `research/06`) + GDPR артефакти
  (connect notice модул, DPA шаблон, DPIA, appeal flow).
- **Фаза 4 (по избор)** — kernel driver: само след бюджет + правен ревю
  (EV cert + MS attestation). **Спри-и-питай собственика.**

## Разузнаване

`research/` държи 7 досиета + синтез (`00-synthesis.md`), изработени от
специализираните ни агенти. Чети синтеза преди архитектурни решения.
