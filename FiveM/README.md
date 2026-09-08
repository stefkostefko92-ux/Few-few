# FiveM Bulgaria

Директория на българските **FiveM** (GTA V multiplayer) roleplay сървъри: жив
статус, брой играчи, рамка (ESX/QBCore/Qbox), whitelist, Discord, ревюта,
правила и туториали на български — плюс кой излъчва български GTA V roleplay в
момента (Twitch, Kick, YouTube, TikTok). Пълна английска версия.

Продукт на [Carbon Stealth VCC](https://carbonstealth.eu). Независим проект —
не е свързан с Rockstar Games, Take-Two Interactive или Cfx.re.

## Бърз старт

```bash
npm install
cp .env.example .env        # попълни DATABASE_URL
npm run prisma:migrate:dev
npm run dev                 # http://localhost:3000
```

## Как работи живият статус

Всеки FiveM сървър излага публично `/info.json` и `/dynamic.json` на своя
`host:port` (по подразбиране порт 30120). `npm run servers:refresh` минава през
одобрените сървъри на порции, чете двата endpoint-а и записва статуса —
пуска се **по cron** (напр. на 3 минути), не при зареждане на страница.

`players.json` (имена и идентификатори на играчи) **не се чете** — виж
`SECURITY.md`.

## Гейт преди „готово“

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Подробности за архитектурата и правилата на продукта: `CLAUDE.md`.
