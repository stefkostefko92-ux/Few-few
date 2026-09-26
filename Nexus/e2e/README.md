# Nexus Dominion — e2e (Playwright)

Локални Playwright спекове срещу **реалния билд** (`Nexus/server` сервира
`Nexus/client/dist` статично на един и същ origin — виж
`server/src/server.ts` → `app.use(express.static(clientDist))`). Не срещу
vite dev server, не мокнат свят.

## Еднократно

```bash
cd Nexus/server
npm ci
cp .env.example .env
# .env: DB_PATH=./data/e2e.db, PORT=4100, CORS_ORIGIN=http://localhost:5273
npm run seed                      # засява items/monsters/quests/... в data/e2e.db
cd ../client && npm ci && cd ..
npm run build --workspace client   # dist/ трябва да е пресен спрямо client/src
cd e2e && npm ci
```

## Всеки run

```bash
# 1) РЕСТАРТИРАЙ сървъра ПРЕСЕН преди e2e (важно — виж "Рейт-лимити" по-долу)
cd Nexus/server
NEXUS_E2E_AUTH_RATE_MAX=1000 npm run dev &     # PORT/DB_PATH от .env

# 2) пусни спековете
cd ../e2e
npm test                          # headless, list reporter
npm run test:ui                   # интерактивен UI режим
npx playwright test tests/hunting.spec.ts   # само един файл

# 3) API-сонда (без браузър — 401/403/400/паралелни дублирани заявки)
npm run probe
```

## Рейт-лимити (защо да РЕСТАРТИРАШ сървъра преди run)

Всеки e2e тест регистрира собствен изолиран тестов потребител (нула споделен
стейт), което лесно бие production анти-abuse лимитите за секунди:

- `/api/auth/register|forgot|reset` — твърд лимит **8/час/IP**
  (`server/src/server.ts` `sensitiveAuthLimiter`, нарочно НЕ settings-backed
  — админ грешка не бива да отваря abuse прозореца). За локални e2e run-ове
  **само** извън production: `NEXUS_E2E_AUTH_RATE_MAX=<число>` вдига прага
  за текущия процес. В production променливата се игнорира изцяло.
- Общият `/api/auth` лимит (`login_rate_max_per_min`, по подразбиране 20/мин)
  Е settings-backed — `global-setup.ts` го вдига директно в тестовата БД
  (`data/e2e.db`) преди първия тест. Работи само ако сървърът **още не е
  прочел** настройката тази сесия (in-memory кеш без TTL) — затова стъпка 1
  по-горе е рестарт, не просто "увери се, че върви".

## Layout

- `tests/helpers.ts` — `apiRegister`/`apiCreateCharacter` (бързо, извън UI за
  тестовете, които не тестват самата регистрация) + `loginAsInBrowser`
  (инжектира JWT в `localStorage` както `client/src/lib/api.ts` го чете,
  плюс cookie-consent/onboarding-tour ключовете, за да не прихващат кликове —
  виж коментара в helpers.ts).
- `tests/auth.spec.ts` — регистрация (UI) → герой → вход/изход/изтекла сесия;
  всеки успешен път + 2 гранични случая.
- `tests/hunting.spec.ts` — лов: успешен път + заключен регион + паралелна
  дублирана заявка (сървърът е авторитетен — cooldown race регресия).
- `api-probe.mjs` — API-ниво сонда (без браузър, само `fetch`): 401 без
  токен, чужд обект, невалидно тяло, паралелни дублирани заявки за
  награда/покупка, отрицателни/огромни числа — по мутиращите endpoint-и.

## Известни ограничения (докладвани, не поправени тук)

- `hunting.spec.ts`: CombatScene 3D анимацията (`client/src/combat/engine/**`
  — извън обхвата ми) може да увисне за над 90s под софтуерен GL рендерер
  (swiftshader, без GPU — точно тази среда) дори през "Skip ahead". Тестът
  затова не чака пълната анимация — виж коментара в спека и основния доклад.
