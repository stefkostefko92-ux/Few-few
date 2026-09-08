# CLAUDE.md — Публикатор

Контент-двигател за Instagram: генерира **чернови**, човек ги **одобрява**, системата ги
**публикува** през официалния Instagram Platform API. Самостоятелен продукт в монорепото —
`cd publikator/` за всичко.

## Стек

Node ≥22 · TypeScript strict (ESM, `NodeNext`) · Express 5 · Prisma 6 + PostgreSQL ·
BullMQ + Redis · zod на всеки външен вход · pino · Anthropic SDK (`claude-opus-5`) за черновите.

## Команди (гейтът)

```bash
npm ci
npm run typecheck        # tsc над src + tests
npm run format:check     # prettier
npm test                 # unit (node:test през tsx) — без база
npm run build            # prisma generate + tsc
npm run test:integration # иска жива PostgreSQL през DATABASE_URL
npm run dev              # локален сървър
npm run worker           # BullMQ работник (публикуване + подновяване на токени)
```

„Готово" = `typecheck` + `format:check` + `test` + `build` са зелени, а при промяна по
публикуващия път — и `test:integration` срещу истинска база.

## Устройство

```
src/
  config.ts            zod над process.env — процесът не тръгва с полуготов конфиг
  crypto.ts            AES-256-GCM за токените, HMAC подпис на OAuth state
  instagram/           client (fetch + грешки) · oauth · publish (контейнер → публикуване)
  content/lint.ts      предпубликационен линт (HIGH блокира одобрението)
  content/generate.ts  чернови от модел, структуриран изход
  services/            accounts · posts · publish (инвариантите живеят тук)
  queue/               BullMQ опашка и работник
  routes/              health · oauth · posts (bearer токен на всичко под /api)
```

## Инварианти (не ги заобикаляй)

1. **Акаунтите се създават РЪЧНО от човек.** Meta забранява автоматизирано създаване на
   акаунти (Terms of Use). Тук няма и няма да има такъв код.
2. **Публикува се само пост в `APPROVED`/`SCHEDULED`.** Черновата не стига до Instagram,
   независимо от кой маршрут идва заявката.
3. **Находка `HIGH` от линта блокира одобрението.** Не се „прескача" от маршрут.
4. **Токените са криптирани в покой** и никога не влизат в лог (`logger` ги реди).
5. **Квотата се проверява преди качване** — лимитът е плаващ прозорец от 24 часа на акаунт.
6. **Черновите от модел се маркират** `aiAssisted` — одиторска следа, не украса.

## Външни зависимости, които остаряват

`IG_GRAPH_VERSION` е конфигурация, не константа в кода. Лимитите и обхватът на разрешенията
се сверяват в документацията на Meta, не по памет.
