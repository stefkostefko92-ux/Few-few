# CLAUDE.md — vps-dashboard

**Carbon Stealth VPS Dashboard** — пълен контролен панел за VPS сървърите с графичен
интерфейс. Управлява **всичко** от един екран: метрики на живо, systemd услуги,
Docker, процеси, journal логове, деплой (по канона на autodeploy.sh), apt ъпдейти,
сигурност (ufw/fail2ban/TLS/SSH/портове), бекъпи, крон/таймери, файлов браузър,
уеб терминал, агентския флот и одиторски дневник. Управлява **и двата VPS-а** от
един панел през federation (peer proxy).

## Стек
- **Backend:** Node ≥20, `node:http` — **нула runtime зависимости** (като ospedali).
  Само `devDependencies` няма — тества се с вградения `node --test`.
- **Frontend:** vanilla ES modules + `<canvas>` за графиките — нула build стъпка,
  нула външни ресурси (CSP-friendly, `noindex`).
- **Данни:** без база — конфиг в `/etc/vps-dashboard/config.json` (mode 600), state
  (одит журнал) в `/var/lib/vps-dashboard`.

## Команди (quality gate)
```bash
cd vps-dashboard
npm run lint     # node --check на всеки .js/.mjs (scripts/syntax-check.mjs)
npm test         # node --test test/*.test.js
npm start        # прод (иска /etc/vps-dashboard/config.json)
npm run dev      # CSD_DEV=1 — ефимерен конфиг + еднократна парола в конзолата
```
Гейтът е `npm run lint && npm test`. Пусни го преди commit/PR.

## Оформление
```
server.js                вход (http сървър, статик + рутер + сигнали)
src/
  config.js              зареждане/валидация на конфига (+ dev fallback)
  auth.js                scrypt пароли + HMAC сесии + login rate-limit
  httpd.js               рутер, JSON, SSE, статик, cookies (нула deps)
  exec.js                execFile обвивка (без shell по подразбиране)
  jobs.js                фонови задачи + жив изход (SSE), ексклузивни ключове
  audit.js               append-only JSONL одит (без тайни)
  metrics.js             /proc + df метрики + 24ч история
  services.js            systemd list/action/status + journal (tail/follow)
  docker.js              контейнери/образи/stats/logs/действия
  system.js              обзор, процеси, apt, сигурност, бекъпи, крон, захранване
  deploy.js              releases/архиви + пускане на autodeploy.sh + product health
  agents.js              флот от agents.json + allowlist на агентските инструменти
  files.js               файлов браузър (само четене) + преглед
  nodes.js               federation: proxy към peer VPS + статус
  routes.js              всички API маршрути + auth/CSRF/audit гардове
public/                  index.html · app.js · ui.js · style.css · favicon.svg
scripts/syntax-check.mjs zero-dep линтер
deploy/                  install.sh · vps-dashboard.service · nginx.conf.example
test/                    unit.test.js
```

## Конвенции (важни)
- **Нула зависимости.** Не добавяй npm пакети — всичко е stdlib. Ако нещо иска пакет,
  напиши го на ръка или го изостави.
- **Fail-closed сигурност.** Всеки API маршрут минава през `guard()` (сесия/Bearer),
  мутациите — и през CSRF (custom header + Origin). Системните команди вървят през
  `execFile` с масив аргументи (**без shell**); shell има само `/api/terminal/run`,
  изрично и **одитирано**. Имената на unit-и/контейнери минават през allowlist regex.
- **Тайните живеят само на сървъра** (config.json mode 600). Никога в репото/архива.
  Одитът никога не записва пароли/токени. Панелът слуша само на `127.0.0.1` — публично
  само зад Nginx + TLS (+ по избор Basic-auth).
- **Деплой = канонът на репото.** Панелът не преоткрива деплой: пуска `deploy/autodeploy.sh`
  като фонова задача с жив изход. Продуктовите health URL-и в config съвпадат с него.
- **Български UI.** Всички низове на потребителя са на български („…“ кавички).
- **Federation.** Един и същ панел на всеки VPS. `peers[]` в config сочат другите; заявки
  към `/api/nodes/<id>/*` се проксират с `peerToken` (Bearer). Другият край приема
  Bearer == своя `peerToken`.

## Тестове
`test/unit.test.js` покрива чистите функции: пароли/сесии (auth), парсване на
`/proc` (CPU делта, meminfo, netdev, df), рутера (path params + wildcard),
allowlist-а на unit имена, списъка с проекти. Живите системни извиквания не се
мокват — тестват се само детерминистичните парсери.
