# Minecraft сървър с админ панел (Pelican)

Vanilla **Minecraft: Java Edition 26.3** („Wilderness Bound“, 15.09.2026, иска Java 25) на нашия VPS,
управляван през **Pelican Panel** — наследникът (fork) на Pterodactyl: уеб конзола, файлов мениджър,
SFTP, бекъпи по график, потребители и права, мониторинг на CPU/RAM/диск, смяна на версията с едно
кликане.

| Какво | Адрес |
| --- | --- |
| Админ панел | `https://mc.carbonstealth.eu` |
| Играта (за играчите) | `mc.carbonstealth.eu` (порт 25565 — не се пише) |
| Нод (Wings — конзола, файлове) | `https://node-mc.carbonstealth.eu` |
| SFTP | `sftp://node-mc.carbonstealth.eu:2022` |

> **Версии:** Pelican Panel и Wings `v1.0.0-rc.1` — първият release candidate на 1.0 (стабилен 1.0 още
> няма). Закачени са по таг и sha256, не по `latest`.

## Как е устроено

```
играч ──25565/tcp──▶ docker-proxy ─▶ контейнер Minecraft 26.3 (yolks:java_25, 4 GB)  ◀─┐
                                                                                         │ Docker API
браузър ─443─▶ nginx ─▶ 127.0.0.1:4330  Pelican Panel (Docker: panel + MariaDB + Redis)  │
                  └───▶ 127.0.0.1:4331  Wings (systemd) ──────────────────────────────────┘
SFTP клиент ──2022/tcp──▶ Wings (SFTP сървърът му)
```

| Порт | Слуша | Кой |
| --- | --- | --- |
| 4330 | 127.0.0.1 | Pelican Panel (зад nginx) |
| 4331 | 127.0.0.1 | Wings API (зад nginx; втвърден — виж „Сигурност“) |
| 2022 | 0.0.0.0 | SFTP на Wings |
| 25565 | 0.0.0.0 | Minecraft |

Мрежи: панелът е в `10.240.30.0/24`, игровите контейнери в `10.240.31.0/24` — извън `172.16/12`,
където Docker вече е сложил другите ни compose стекове.

Файлове в репото (`minecraft/deploy/`):

| Файл | На сървъра |
| --- | --- |
| `install.sh` | пуска се от архива; идемпотентен |
| `compose.yml` | `/opt/pelican/compose.yml` (тайните: `/opt/pelican/.env`, 600, генерирани веднъж) |
| `bootstrap.php` | пуска се в контейнера на панела: нод, алокация, egg, сървър |
| `backup.sh` + `systemd/pelican-backup.*` | `/opt/pelican/backup.sh`, таймер 03:40 UTC |
| `systemd/wings.service` | `/etc/systemd/system/wings.service` |
| `nginx/*.conf` | `/etc/nginx/sites-available/pelican-{panel,node}` + `snippets/pelican-proxy.conf` |

## Инсталация

### 0. Веднъж, преди всичко

1. **DNS** (A запис към `178.104.77.242`, при IPv6 и AAAA): `mc.carbonstealth.eu` и
   `node-mc.carbonstealth.eu`.
2. **Hetzner Firewall** (ако се ползва): входящи `25565/tcp` и `2022/tcp` (80/443 вече са отворени).
   `ufw` скриптът го отваря сам.
3. **RAM:** сървърът взима 4 GB + ~1 GB панелът. Скриптът показва свободната памет и предупреждава
   под 5 GB.

### 1. Първи пробег

Скриптът е в архива на репото. Ако монорепото вече е деплойнато (`/opt/few-few/current`):

```bash
sudo bash /opt/few-few/current/minecraft/deploy/install.sh
```

Иначе — само папката от `main`:

```bash
mkdir -p /root/mc && curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
  | tar -xz -C /root/mc --strip-components=1 --wildcards '*/minecraft/deploy/*'
sudo bash /root/mc/minecraft/deploy/install.sh
```

Какво прави: проверява портовете (`ss -tlnp`) и виртуализацията (Wings иска KVM) → генерира тайните →
вдига панела и чака `/up` → TLS сертификати (certbot) и nginx (`nginx -t` преди reload, при грешка
връща стария конфиг) → Wings бинарка (sha256 проверка) → ufw → бекъп таймер → `https://mc.carbonstealth.eu/up` → 200.

### 2. Уеб инсталаторът (единствената ръчна стъпка)

`https://mc.carbonstealth.eu/installer` — базата, кешът, сесиите и опашката са вече попълнени от
средата; само потвърждаваш и създаваш **админ акаунта** (по нашия шаблон за админ акаунти). Веднага
след това: профил → **2FA**.

### 3. Втори пробег

```bash
sudo bash /opt/few-few/current/minecraft/deploy/install.sh   # същата команда
```

Сега скриптът сам: създава нода `carbonstealth-vps` (HTTPS зад proxy, 4608 MB, 20 GB) и алокация
`0.0.0.0:25565` с име `mc.carbonstealth.eu` → импортира egg „Vanilla Minecraft“ от `pelican-eggs` →
взима конфига на Wings от панела, втвърдява го и пуска Wings → създава сървъра **„Minecraft“**:
`VANILLA_VERSION=26.3`, образ `ghcr.io/pelican-eggs/yolks:java_25`, 4096 MB RAM, 16 GB диск, до 5
бекъпа. Wings сваля `server.jar` 26.3 от Mojang.

### 4. Първо пускане

Панел → **Minecraft** → **Start**. Конзолата пита за **EULA на Mojang** → **Accept** (решение на човек,
затова скриптът не го прави). След `Done (…)! For help, type "help"` сървърът е жив.

Проверка отвън: в Minecraft 26.3 → Multiplayer → Add Server → `mc.carbonstealth.eu`.

Настройките са параметри на скрипта (env): `MC_VERSION`, `MC_MEMORY`, `MC_DISK`, `MC_CPU` (0 = без
лимит, 200 = 2 ядра), `MC_BACKUPS`, `PANEL_FQDN`, `NODE_FQDN`, портовете. Важат при създаване; после
се сменят от панела.

## Ежедневно администриране (в панела)

| Задача | Къде |
| --- | --- |
| Конзола, команди (`op <ник>`, `whitelist add <ник>`, `say …`) | Server → Console |
| `server.properties`, светове, плъгини/датапакове | Server → Files (или SFTP) |
| SFTP | хост `node-mc.carbonstealth.eu`, порт `2022`, потребител `<потребител>.<id на сървъра>` (показан в Settings → SFTP Details), паролата от панела |
| Бекъп на света | Server → Backups → Create |
| Автоматичен бекъп | Server → Schedules → нов график (напр. всеки ден 04:30) → задача „Create Backup“ |
| Рестарт по график | Schedules → задача „Send Power Action: restart“ |
| Още админи/модератори | Admin → Users (админи) или Server → Users (подпотребители с права само за този сървър) |
| Ресурси | Admin → Servers → Minecraft → Build (RAM/CPU/диск) |

## Offline режим + whitelist (играчи без купена игра)

На нашия сървър е включен, защото играчите нямат Java акаунти. В `server.properties` (Server → Files или
`/var/lib/pelican/volumes/<uuid>/server.properties`, при спрян сървър):

```
online-mode=false
white-list=true
enforce-whitelist=true
enforce-secure-profile=false
```

- **Не ползвай `whitelist add <име>`** в offline режим: командата пита Mojang и записва UUID-то на
  истинския акаунт с това име, а клиентът влиза с offline UUID → „You are not white-listed“. Записът в
  `whitelist.json` е с offline UUID = UUID v3 на `OfflinePlayer:<име>` (главните букви имат значение):
  ```bash
  python3 -c "import hashlib,uuid,sys;h=bytearray(hashlib.md5(b'OfflinePlayer:'+sys.argv[1].encode()).digest());h[6]=h[6]&15|48;h[8]=h[8]&63|128;print(uuid.UUID(bytes=bytes(h)))" Moni
  ```
  После в конзолата: `whitelist reload`.
- **Рискът:** сървърът не проверява кой стои зад името — който знае име от whitelist-а, влиза като него.
  Затова **без `op`** за играчи (командите — от конзолата на панела) и адресът не се публикува.

## Малък VPS

На 4 GB машина с другите продукти сървърът е с `MC_MEMORY=1536` (втория пробег на `install.sh` с тази
променлива) + 2 GB swap на хоста. Нов A запис: ако локалният resolver държи стар NXDOMAIN,
`install.sh` проверява през 1.1.1.1; Let's Encrypt може да откаже, докато отрицателният кеш не изтече
(TTL от SOA — у register.it 900 s).

## Ъпдейт

**Minecraft (напр. 26.4):** първо бекъп (Backups → Create) → Startup → **Server Version** = `26.4` →
Settings → **Reinstall**. Световете остават; обратно към стара версия **не** се връща свят, отворен в
по-нова — за това е бекъпът. Провери в egg-а дали новата версия иска друга Java (Startup → Docker Image).

**Панел / Wings:** смени тага в `compose.yml` (`ghcr.io/pelican/panel:<таг>`) и `WINGS_VERSION` +
двата sha256 в `install.sh` (от `checksums.txt` на релийза), PR → после `install.sh` на сървъра. Скриптът
прави бекъп на панела **преди** pull-а (миграциите тичат от entrypoint-а на новия образ).

## Бекъпи и възстановяване

- **Панелът** (`pelican-backup.timer`, всеки ден 03:40 UTC, 14 дни) → `/var/backups/pelican/<час>/`:
  `panel.sql.gz` (MariaDB), `pelican-data.tar.gz` (APP_KEY на панела — без него шифрованите полета в
  базата са загубени), `stack.env`. Ръчно: `sudo bash /opt/pelican/backup.sh`.
- **Световете** — бекъпите на Pelican в `/var/lib/pelican/backups` (графикът по-горе).
- И двете са на **същия диск** — копирай ги и извън VPS-а (Hetzner Storage Box / друг сървър).

Възстановяване на панела:

```bash
B=/var/backups/pelican/<час>
C="docker compose --project-name pelican --env-file /opt/pelican/.env -f /opt/pelican/compose.yml"
install -m 600 $B/stack.env /opt/pelican/.env        # само ако .env е изгубен
$C stop panel
gunzip -c $B/panel.sql.gz | $C exec -T database sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" panel'
docker run --rm -v pelican_pelican-data:/data -v $B:/b:ro alpine:3.20 tar -xzf /b/pelican-data.tar.gz -C /data
$C up -d && curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4330/up
```

Откат на Wings: `WINGS_VERSION=<стар таг>` + неговите sha256 в `install.sh`, пак `install.sh`.

## Сигурност

- Панелът и Wings API слушат **само на 127.0.0.1**; отвън — само през nginx с TLS. Wings конфигът е с
  `ignore_panel_config_updates: true`, иначе панелът при всяка редакция на нода би върнал
  `api.host: 0.0.0.0`. Цената: промени по нода в панела (портове, лимит за качване) не стигат до
  Wings сами — нанасят се и в `/etc/pelican/config.yml`, после `systemctl restart wings`.
- Публични остават само 25565 (играта) и 2022 (SFTP, с пароли от панела). Портовете на игровите
  контейнери ги публикува Docker — **ufw не ги филтрира** (Docker пише свои iptables правила); ако
  трябва да се затвори играта, правилото е в Hetzner Firewall.
- Входът: Filament брои опитите (5/мин. на IP), nginx добавя втора спирачка; задължително 2FA за
  админите.
- Тайните (`/opt/pelican/.env`, `/etc/pelican/config.yml`) са 600 и никога не влизат в репото.
- Логове на nginx: без access log (както останалите ни продукти).

## Отстраняване на проблеми

| Симптом | Провери |
| --- | --- |
| `install.sh`: „порт … е зает“ | `ss -tlnp 'sport = :<порт>'` — друг продукт; смени `PANEL_PORT`/`WINGS_PORT` |
| „DNS … сочи …“ | A записите от т. 0; `getent ahostsv4 mc.carbonstealth.eu` |
| Панелът не тръгва | `docker compose --project-name pelican -f /opt/pelican/compose.yml logs panel` |
| Нодът е червен в панела | `journalctl -u wings -n 80`; `curl -s https://node-mc.carbonstealth.eu/healthz` → трябва `ok` (502 = Wings е спрян) |
| vpsdash: „Продукт не отговаря: node-mc… → статус 401“ | проверката сочи `/` (там Wings винаги отговаря 401); в vpsdash → healthChecks адресът да е `https://node-mc.carbonstealth.eu/healthz` |
| Конзолата не се свързва | същото — WebSocket минава през `node-mc` (nginx `Upgrade`) |
| Сървърът спира с OOM | Build → RAM нагоре (JVM взима 95 % от лимита) |
| Играчите не влизат | клиентът трябва да е 26.3; порт 25565/tcp отворен в Hetzner Firewall |
