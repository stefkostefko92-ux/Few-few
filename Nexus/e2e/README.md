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

# 2) целият Playwright пакет (auth/hunting/combat-loops/economy/social-guild/misc)
cd ../e2e
npm test                          # headless, list reporter
npm run test:ui                   # интерактивен UI режим
npx playwright test tests/hunting.spec.ts   # само един файл

# 3) API сонди (без браузър — 401/403/400/паралелни дублирани заявки)
npm run probe                                       # играч API
NEXUS_E2E_ADMIN_TOKEN=<jwt> node admin-probe.mjs    # админ API (виж "Admin probe setup")
```

### Admin probe setup

`admin-probe.mjs` и `combat-loops.spec.ts` (подземие/Mythic+)/`social-guild.spec.ts`
(гилдия)/`misc.spec.ts` (фракции/маунт/бос/профил) искат промотиран админ, за да
вдигат ниво/злато/репутация на тестови герои без реален grind:

```bash
# веднъж на тестова БД:
node -e "require('/api/auth/register')" # (регистрирай обикновено през UI/API)
cd Nexus/server && npm run promote --workspace server -- <username>

# всеки run — вземи токен и подай го на спековете/сондата:
curl -s -X POST http://localhost:4100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"<username>","password":"<password>"}'
NEXUS_E2E_ADMIN_TOKEN=<token> npx playwright test
NEXUS_E2E_ADMIN_TOKEN=<token> node admin-probe.mjs
```

Без `NEXUS_E2E_ADMIN_TOKEN` тези тестове/сондата се **пропускат чисто**
(`test.skip(...)` / ранен `return`) — останалата част от пакета не зависи от
админ и минава без него.

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
- `tests/combat-loops.spec.ts` — куест, подземие, Mythic+, арена, кула.
- `tests/economy.spec.ts` — инвентар, пазар, аукцион, размяна между играчи.
- `tests/social-guild.spec.ts` — приятели/блок, чат, гилдия (пълен цикъл).
- `tests/misc.spec.ts` — фракции, маунт, световен бос, известия, профил,
  акаунт (парола/GDPR експорт/изтриване).
- `api-probe.mjs` — API-ниво сонда (без браузър, само `fetch`): 401 без
  токен, чужд обект, невалидно тяло, паралелни дублирани заявки за
  награда/покупка, отрицателни/огромни числа — по мутиращите endpoint-и.
- `admin-probe.mjs` — същото за `/api/admin/*`: 401/403 по маршрут,
  валидация, паралелно разпускане на гилдия (анти-дупликация на audit/notify).

## Известни ограничения (докладвани, не поправени тук)

- `hunting.spec.ts`: CombatScene 3D анимацията (`client/src/combat/engine/**`
  — извън обхвата ми) може да увисне за над 60s под софтуерен GL рендерер
  (swiftshader, без GPU — точно тази среда), дори след merge-натия no-GPU
  fallback (nexus-boy-combat, 12s watchdog + бутон „Покажи резултата"):
  watchdog-ът пази прехода loading→ready, но не и залепване СЛЕД ready
  (боят стига до `engine==='ready'`, после засяда по време на реалното
  изпълнение на кадрите — "Skip to the end" също не помага). Тестът затова
  не чака резултатния панел, само детерминистичното (server data flow +
  cooldown) — виж коментара в спека и основния доклад.
