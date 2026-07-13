# Автоматизиран деплой (`deploy/autodeploy.sh`)

Деплой на монорепото от **ръчно качен GitHub архив** до жив сървър — едно действие.

## Работен поток

1. **Ръчно:** в GitHub → **Code → Download ZIP** (или `tar.gz` от Releases).
2. **Ръчно:** качи архива в **root папката (`/root`)** на VPS-а (напр. през `scp`):
   ```bash
   scp Few-few.zip root@СЪРВЪР:/root/
   ```
3. **Автоматично:** влез в сървъра и пусни скрипта (той е и вътре в архива):
   ```bash
   ssh root@СЪРВЪР
   cd /root && unzip -o Few-few.zip >/dev/null   # само за да стигнеш до скрипта
   sudo bash /root/few-few-*/deploy/autodeploy.sh
   ```
   Оттук нататък всичко е автоматично: разопаковане в нов release → билд → миграции →
   сийд (само първия път) → health check → презареждане на прокси/TLS.

## Какво прави

- Намира най-новия архив в `/root`, разопакова го в `/opt/few-few/releases/<час>` и
  нормализира GitHub горната папка (`few-few-*`).
- **zabobovdol:** пренася съществуващия `.env`, после `scripts/deploy.sh` (Docker Compose
  билд + вдигане + миграции, сийд само при първо пускане).
- **medqr:** rsync в `/opt/medqr` (без `data/`, `.env`), `npm ci --omit=dev`,
  `systemctl restart medqr`; при провал — автоматичен rollback към предишния код.
- **mastilko:** rsync в `/opt/mastilko` (без `.env`), `npm ci` + `npm run build`
  (Next.js се билдва на сървъра) + `npm prune --omit=dev`, самоинсталиращ се
  systemd unit (`mastilko/deploy/mastilko.service`, порт `127.0.0.1:3200`),
  `systemctl restart mastilko`; при провал — автоматичен rollback. Еднократно:
  Nginx vhost + TLS → `mastilko/deploy/DEPLOY.md`.
- **SupremeDiscordBot** (Supreme Bot): пренася четирите `.env` файла (`SupremeDiscordBot/.env`,
  `backend/.env`, `bot/.env`, `frontend/.env`), после `SupremeDiscordBot/deploy.sh` (Docker Compose
  билд + вдигане; миграциите се пускат от backend entrypoint-а; регистрира slash командите).
  Health на публичния frontend порт `127.0.0.1:8080`; останалите services са вътрешни.
- **eternaltouch** (Eternal Touch): пренася `eternaltouch/.env` (или го генерира с random
  secrets при пръв деплой — `SMTP_PASS` остава `CHANGE_ME` за ръчно попълване веднъж),
  после `eternaltouch/deploy.sh` (Docker Compose билд + вдигане; схемата се пуска от
  `docker-startup.sh`; идемпотентен seed; Nginx + certbot с auto-reload hook). Health на
  `127.0.0.1:4300/healthz`; app + postgres слушат само на localhost зад Nginx.
- **adblock** (Supreme AdBlock): ЧИСТ СТАТИЧЕН сайт — без билд, Node или база. Копира само
  трите обслужвани файла (`adblock/server/{index.html,privacy.html,filters.json}`) в
  `/var/www/adblock`, инсталира/обновява Caddy сайт-блока (`adblock/server/Caddyfile` →
  `/etc/caddy/sites/adblock.caddy` + `import sites/*.caddy` в главния Caddyfile),
  `caddy validate` **преди** reload (нула downtime; при невалиден конфиг — връща стария
  блок и не презарежда). Разширението тегли `filters.json`; `index.html` е витрина, а
  `/privacy` (rewrite към `privacy.html`) е политиката за поверителност от Web Store.
  Health-ът е best-effort HTTPS на публичния адрес — минава едва след като **DNS A/AAAA
  за `adblock.carbonstealth.eu` сочи VPS-а** (ръчна стъпка) и Caddy издаде TLS; провал тук
  е предупреждение, не блокира деплоя. Няма тайни (чисто статично).
- Health check на всеки сервис; маркира `current` release; пази последните 5 за връщане назад.

## Конфигурация

Промени блока „КОНФИГУРАЦИЯ“ най-горе в `autodeploy.sh` (или подай env променливи):

| Променлива | По подразбиране | Смисъл |
| --- | --- | --- |
| `PROJECTS` | `zabobovdol medqr nexus SupremeDiscordBot vizitka mastilko eternaltouch adblock supreme-admanager` | кои проекти да се разгръщат тук |
| `ADBLOCK_WWW` | `/var/www/adblock` | www root на статичния adblock сайт |
| `CADDY_SITES_DIR` / `CADDY_MAIN` | `/etc/caddy/sites` · `/etc/caddy/Caddyfile` | къде се инсталира adblock сайт-блокът + главен Caddyfile |
| `ARCHIVE` | (най-новият в `/root`) | конкретен архив |
| `FORCE_SEED` | `0` | принудителен сийд на zabobovdol |
| `MEDQR_DIR` | `/opt/medqr` | път на medqr |
| `ADMANAGER_DIR` | `/opt/supreme-admanager` | път на Supreme AdManager (systemd, порт 3060; .env с ENCRYPTION_KEY/SESSION_SECRET/ADMIN_* — ENCRYPTION_KEY е лениво валидиран, проверявай ръчно) |
| `*_HEALTH_URL` | localhost | адрес за проверка на здравето |

## Важно

- **Тайните не са в архива.** `zabobovdol/.env`, `/etc/medqr/medqr.env`,
  `/opt/mastilko/.env` (GEMINI_API_KEY, по желание) и четирите
  `SupremeDiscordBot/*.env` (корен, `backend/`, `bot/`, `frontend/`) живеят на сървъра (права 600).
  Скриптът пренася съществуващите `.env` при всеки деплой.
- Скриптът е **идемпотентен** и прави бекъп преди презапис на medqr.
- Първоначалната настройка на сървъра (юзъри, `ufw`, systemd unit, Nginx/Caddy, TLS) се
  прави веднъж — виж `zabobovdol/DEPLOY.md` и `medqr/deploy/DEPLOY.md`.
- Поддържа се от агента **„VPS-аджията“** (`.claude/agents/vps-adjiyata.md`).
