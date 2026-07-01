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
- **platform** (панел за свързани сайтове): пренася `platform/.env`, после
  `docker compose up -d --build`. Схемата (`prisma db push`) и сийдът (само при първо
  пускане) са в `docker-entrypoint.sh` на контейнера. `web` слуша само на
  `127.0.0.1:${HTTP_PORT}` (по подр. 3000) зад външно reverse proxy; `db` е във вътрешна
  мрежа. Health на `/api/health`.
- **medqr:** rsync в `/opt/medqr` (без `data/`, `.env`), `npm ci --omit=dev`,
  `systemctl restart medqr`; при провал — автоматичен rollback към предишния код.
- **supreme** (Supreme Bot): пренася четирите `.env` файла (`supreme/.env`,
  `backend/.env`, `bot/.env`, `frontend/.env`), после `supreme/deploy.sh` (Docker Compose
  билд + вдигане; миграциите се пускат от backend entrypoint-а; регистрира slash командите).
  Health на публичния frontend порт `127.0.0.1:8080`; останалите services са вътрешни.
- Health check на всеки сервис; маркира `current` release; пази последните 5 за връщане назад.

## Конфигурация

Промени блока „КОНФИГУРАЦИЯ“ най-горе в `autodeploy.sh` (или подай env променливи):

| Променлива | По подразбиране | Смисъл |
| --- | --- | --- |
| `PROJECTS` | `zabobovdol platform medqr nexus supreme` | кои проекти да се разгръщат тук |
| `ARCHIVE` | (най-новият в `/root`) | конкретен архив |
| `FORCE_SEED` | `0` | принудителен сийд на zabobovdol |
| `MEDQR_DIR` | `/opt/medqr` | път на medqr |
| `*_HEALTH_URL` | localhost | адрес за проверка на здравето |

## Важно

- **Тайните не са в архива.** `zabobovdol/.env`, `platform/.env`, `/etc/medqr/medqr.env`
  и четирите `supreme/*.env` (корен, `backend/`, `bot/`, `frontend/`) живеят на сървъра
  (права 600). Скриптът пренася съществуващите `.env` при всеки деплой.
- Скриптът е **идемпотентен** и прави бекъп преди презапис на medqr.
- Първоначалната настройка на сървъра (юзъри, `ufw`, systemd unit, Nginx/Caddy, TLS) се
  прави веднъж — виж `zabobovdol/DEPLOY.md` и `medqr/deploy/DEPLOY.md`.
- Поддържа се от агента **„VPS-аджията“** (`.claude/agents/vps-adjiyata.md`).
