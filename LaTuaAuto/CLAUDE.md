# LaTuaAuto/ — chat по табела + самопопълващи се срокове (Италия)

Италианската адаптация на модела „KolataTi“ (BG): пишеш на **табелата**, не на
човека; календарът със срокове се **пълни сам**. Проучването и решенията защо
продуктът е такъв → `research/targa-italia/README.md` (чети го преди да пипаш
чат/верификация — там са правните ограничения).

_Stack: Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma 6 ·
PostgreSQL · Tailwind 3 · next-intl (it/en/de). Конвенциите на linketto.
Root правилата са в кореновия `CLAUDE.md`._

## Команди (в `LaTuaAuto/`)

```bash
npm install
npm run dev                 # http://localhost:3000

# Качествен гейт (задължителен преди „готово“):
npm run lint
npm run typecheck
npm test                    # node:test през tsx (чисти функции, без БД)
npm run build               # prisma generate + next build (standalone)

npm run prisma:migrate:dev  # миграции (изисква PostgreSQL)
```

Env: виж примерния env файл в папката. `PLATE_PEPPER` и `SESSION_SECRET` са
тайни — само на сървъра (mode 600).

## Архитектура

```
prisma/schema.prisma   User/Session/Vehicle(PlateVerification NONE|BASE|VERIFIED)/
                       Conversation(acceptedAt, expiresAt)/Message(TEMPLATE|TEXT)/
                       Block/Report(DSA мотивирано решение)/Reminder(ReminderType)/
                       MaintenanceEntry/Fine(двата часовника)/ContactMessage.
                       НУЛА геолокация, нула телефон. Табелата е лична данна.
src/i18n/locales.ts    Единственото място за нов език. it = източник на истината
                       (IT продукт); en/de падат към it (request.ts deepMerge —
                       МАСИВИТЕ се заменят, не се сливат).
messages/<loc>.json    UI низове + правни чернови (legal.*) + шаблони (templates.*).
src/middleware.ts      Път без префикс → NEXT_LOCALE cookie → Accept-Language → it.
src/lib/plate.ts       Италиански табели: normalize/parse (AUTO AA000AA · MOTO
                       AA00000 · RIMORCHIO XA000AA · LEGACY), забранени I/O/Q/U,
                       maskPlate. Споделен с клиента — БЕЗ node: импорти.
src/lib/plate-hash.ts  hashPlate(sha256 + PLATE_PEPPER) — server-only, fail-closed.
src/lib/scadenze.ts    Чиста логика със източник на всяко правило: revisione 4+2
                       (до края на месеца), gomme 15.10–15.11 / 15.04–15.05,
                       patente 10/5/3/2 г. по възраст (изтича на рождения ден),
                       multa −30% 5 дни · GdP 30 · Prefetto 60 (неработен →
                       следващ работен ден, фиксираните ит. празници).
src/lib/messages.ts    TEMPLATE_CODES (8 шаблона за първи контакт),
                       REPORT_CATEGORIES, LIMITS (5 контакта/ден, 48 ч TTL).
src/lib/seo.ts         SITE_URL, pageMetadata (canonical + hreflang it/en/de +
                       x-default=it), BASE_KEYWORDS (≥5, „Carbon Stealth“ първа),
                       JSON-LD (Organization/WebSite/SoftwareApplication/FAQ/
                       Breadcrumb).
src/app/[locale]/      / · /come-funziona · /sicurezza · /scadenze (клиентски
                       калкулатор, нищо не се пази) · /faq · /contatti (server
                       action + honeypot → ContactMessage) · /privacy /termini
                       /cookie (LegalPage, маркирани „Bozza“).
src/app/api/health     SELECT 1 → 200/503.
public/llms.txt        AI crawlers.
```

## Правила на продукта

- **Непотвърдена табела не получава съобщения.** Никога не обръщай това.
- **Никога не потвърждавай дали табела е регистрирана** (нито в UI, нито в
  API отговор, нито по време на отговор — constant-time при бъдещ endpoint).
- **Първи контакт = шаблон.** Свободен текст само след `Conversation.acceptedAt`.
- **Нула GPS, нула телефон.** Не добавяй полета за тях без правен преглед.
- Табелата се логва **само** през `maskPlate`. Суровата — никога.
- Пари в цели центове (`costCents`) — никога float.
- Правните текстове са чернови → Правния Разбирач преди пускане.
- Всеки правен/срочен извод в UI завършва с „не е правен съвет“ (disclaimer).
- Тестовете тичат с `--conditions=react-server` (заради `server-only` в
  plate-hash.ts) — не го махай от `npm test`.

## Следващи стъпки (roadmap от проучването)

1. Етап 0 (правен): условия на Portale dell'Automobilista за автоматична
   справка; IVASS/RUI за RCA препращане; LIA + DPIA.
2. Auth (httpOnly cookie, sha256 токен в БД, bcrypt 12) + гараж + верификация Base.
3. Чат по табела с шаблони, лимити, блокиране, сигнали.
4. Push (Capacitor обвивка като medqr) + OCR на libretto в устройството.
