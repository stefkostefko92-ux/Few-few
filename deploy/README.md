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
- **SupremeDiscordBot** (Supreme Bot): пренася четирите `.env` файла (`SupremeDiscordBot/.env`,
  `backend/.env`, `bot/.env`, `frontend/.env`), после `SupremeDiscordBot/deploy.sh` (Docker Compose
  билд + вдигане; миграциите се пускат от backend entrypoint-а; регистрира slash командите).
  Health на публичния frontend порт `127.0.0.1:8080`; останалите services са вътрешни.
- **cspos-store** (Carbon Stealth POS — лицензионен магазин): rsync в `/opt/cspos-store/app`
  (без `data/`, `.env`), `npm ci --omit=dev`, снимка на `store.db`, `systemctl restart cspos-store`;
  при провал — автоматичен rollback към предишния код и базата. Health на `127.0.0.1:8790/api/plans`.
  Тайните (`/opt/cspos-store/.env`) и данните (`/opt/cspos-store/data/`) стоят на сървъра.
- Health check на всеки сервис; маркира `current` release; пази последните 5 за връщане назад.

## Конфигурация

Промени блока „КОНФИГУРАЦИЯ“ най-горе в `autodeploy.sh` (или подай env променливи):

| Променлива | По подразбиране | Смисъл |
| --- | --- | --- |
| `PROJECTS` | `zabobovdol medqr nexus SupremeDiscordBot cspos-store` | кои проекти да се разгръщат тук |
| `ARCHIVE` | (най-новият в `/root`) | конкретен архив |
| `FORCE_SEED` | `0` | принудителен сийд на zabobovdol |
| `MEDQR_DIR` | `/opt/medqr` | път на medqr |
| `*_HEALTH_URL` | localhost | адрес за проверка на здравето |

## Важно

- **Тайните не са в архива.** `zabobovdol/.env`, `/etc/medqr/medqr.env`, четирите
  `SupremeDiscordBot/*.env` (корен, `backend/`, `bot/`, `frontend/`) и `/opt/cspos-store/.env`
  живеят на сървъра (права 600). Скриптът пренася/пази съществуващите `.env` при всеки деплой.
- Скриптът е **идемпотентен** и прави бекъп преди презапис на medqr.
- Първоначалната настройка на сървъра (юзъри, `ufw`, systemd unit, Nginx/Caddy, TLS) се
  прави веднъж — виж `zabobovdol/DEPLOY.md`, `medqr/deploy/DEPLOY.md` и
  `CSPos/store/deploy/DEPLOY.md`.
- Поддържа се от агента **„VPS-аджията“** (`.claude/agents/vps-adjiyata.md`).
