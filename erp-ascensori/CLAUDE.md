# CLAUDE.md — erp-ascensori/

ERP Ascensori Enterprise — гестионал за фирми по поддръжка/монтаж на асансьори.
**Целият UI е на италиански**; коментари/комити — на български. Схема v3.0 по
`docs/` документацията (24 таблици · 13 енумерации · 7 нива достъп · 9 статуса).

## Стек и команди

Next.js 15 App Router · React 19 · TS strict · Prisma + **PostgreSQL 16** ·
Tailwind · Zod · jose · Recharts. Path alias `@/*`.

```bash
npm run dev / build / start
npm run lint && npm run typecheck && npm test   # качествена порта (задължителна)
npx prisma db push && npm run db:seed           # локална база + демо данни (IT)
npm run scadenze:check                          # автоматизмът за сроковете (cron 24h)
```

Демо вход след seed: `master@erp-ascensori.local` / `Ascensori!2026` (по един
акаунт на всяко от 7-те нива — същата парола).

## Твърди правила на домейна (не ги чупи!)

- **Нивото на достъп се проверява ОТ СЪРВЪРА на всяка заявка** (`richiedeRuolo()`
  в `src/lib/auth.ts`). Скриването на бутони в UI не е защита. Йерархия
  MASTER(1) > ADMIN(2) > DIREZIONE(3) > RESPONSABILE(4) > TECNICO(5) >
  OPERATORE(6) > CLIENTE(7) — по-ниското число включва правата на по-високото.
- **StatoOrdine минава само по позволените преходи** (`src/lib/workflow.ts` —
  таблицата от документацията, дословно). Всеки преход пише в `storico_stati`
  + audit `STATE_CHANGE` в транзакция.
- **Тоталите не се пишат на ръка**: при всяка промяна на voce се вика
  `ricalcolaPreventivo/ricalcolaFattura` (`src/lib/totali-db.ts`). Парите се
  смятат в **цели центесими** (`src/lib/totals.ts`), half-up — никакви float.
- **Giacenza-та се движи само през движения** (`/api/movimenti`, в транзакция).
  USCITA под нула се отказва; RETTIFICA е подписана корекция.
- **Audit-ът е неизменим**: всяка редица е подписана HMAC-SHA256
  (`src/lib/audit-hmac.ts`), маршрути за промяна/изтриване НЕ съществуват.
  Проверка: POST `/api/audit/verifica`.
- **Вход**: bcrypt 10 rounds; 5 неуспеха → 15 мин блокада; refresh token само
  като SHA-256 хеш в базата, ротира се и се нулира при logout; rate limit по IP.
- **Фискален архив**: издадена фактура не се трие — сторнира се (STORNATA).
  Референцирани анагрифики не се трият (FK ги пази → 409) — деактивират се.
- **Автоматизми**: `scadenze-runner.ts` — прагове 90/60/30 (флагове еднократно),
  цветен статус на автопарка (rosso <15 дни, giallo <45), preventivi → SCADUTO,
  fatture → SCADUTA.
- **Цветовете на графиките** (8 категорийни, light+dark в `globals.css`) са
  **валидирани** (CVD ΔE≥8, контраст ≥3:1, светлотна алтернация — червено и
  зелено разделени по L). При смяна — превалидирай с dataviz валидатора.
  Цветът следва категорията (каноничен ред в `src/components/Grafico.tsx`), не позицията.

## Архитектура

- `src/lib/crud.ts` + `src/lib/entities.ts` — generic CRUD фабрика: Zod схема +
  конфигурация → пълни REST маршрути. Нова анагрифика = конфиг + 2 тънки route файла.
- `src/lib/voci.ts` — фабрика за редови подресурси (voci/righe) с ricalcola hook.
- `src/components/EntityPage.tsx` — generic списък+форма; страница = конфигурация.
- Dashboard: widget конфигурация per-браузър в `localStorage` (`ea:dashboard:v1`);
  икономическите данни се връщат само за DIREZIONE+ (сървърно).
- Тестовете покриват чистата логика (workflow/totali/hmac/lockout/scadenze/roles)
  без база — пускат се с `tsx --test`.

## Тайни

`SESSION_SECRET` и `AUDIT_HMAC_KEY` (мин. 32 знака, различни!) — само на
сървъра, mode 600. Смяната на AUDIT_HMAC_KEY инвалидира старите подписи;
смяната на SESSION_SECRET сваля всички сесии. Никога в репото.
