# tools/vps — декларативен, наблюдаем, проверен VPS (VPS-аджията v2.0)

Скокът от imperative скрипт към **rebuildable + observable + verified** сървър.
Тайните/ключовете остават на хоста (mode 600), никога в репото.

## `deploy-check.mjs` — zero-dep линтер за деплой скриптове (тестът в CI; CLI на `autodeploy.sh` в sweep-а)
```bash
node tools/vps/deploy-check.mjs deploy/autodeploy.sh   # или папка
```
Статичен анализ на bash деплой БЕЗ да го пуска:
- **HIGH** — липса на `set -euo pipefail`; ехо/ексфилтрация на тайна (`echo $TOKEN`, `curl -d $KEY`);
  `curl … | bash` (непроверен отдалечен код); `rm -rf $VAR` без guard.
- **MEDIUM** — `npm ci` без `--omit=dev`; рестарт/деплой без health-check + rollback.

Изход: `0` = чисто/само INFO; `1` = има HIGH. Тестван (`deploy-check.test.mjs`); нашият
`autodeploy.sh` минава чист (само INFO). Допълва shellcheck — но е zero-dep и в CI sweep-а.

## `propose.mjs` — агентите ПРЕДЛАГАТ поправки, собственикът ги одобрява в панела
```bash
# CSD_AGENT_KEY идва като ТАЙНА на средата (панел → „Одобрения" → „Създай нов ключ").
node tools/vps/propose.mjs diag                 # състоянието: обзор, аларми, услуги, Docker, маскирани логове…
node tools/vps/propose.mjs actions              # затвореният каталог действия
node tools/vps/propose.mjs submit предложение.json   # подава (иска поле `review` — прегледа на Claude)
node tools/vps/propose.mjs status <id>          # чака / изпълнено / отказано
```
Веригата: агентът диагностицира → съставя предложение (ЕДНО действие от каталога +
`why`, `evidence`, `rollback`) → **Claude го преглежда** и попълва `review` → подава →
**собственикът натиска „Одобри" в панела с парола**. Ключът не може да изпълни нищо и не
стига до суровия журнал, тайните, файловете и одита. `CSD_PANEL_URL` е по подразбиране
`https://vps.carbonstealth.eu` и трябва да е https. Ключът се приема САМО от средата —
аргумент на командния ред влиза в историята на шела. Тестван (`propose.test.mjs`).

Пример за предложение:
```json
{
  "agent": "VPS-аджията",
  "title": "Рестарт на medqr — паметта расте без край",
  "why": "RSS на medqr расте линейно 6 ч; след рестарт се връща на ~120 MB.",
  "evidence": "overview: памет 91%; services: medqr active 6h; logs: няма нови грешки",
  "review": "Claude: едно обратимо действие, без данни; рестартът е по-евтин от OOM.",
  "rollback": "Рестартът е обратим сам по себе си; ако не тръгне — деплой откат.",
  "action": { "type": "service.restart", "params": { "unit": "medqr.service" } }
}
```

## IaC (Ansible)
```bash
SSH_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" \
  ansible-playbook -i 'SERVER,' -u root tools/vps/ansible/site.yml
```
`site.yml` е скелет (юзър, SSH хардънинг, ufw, Docker). Разширявай с Caddy/systemd/TLS.

## Zero-downtime (blue/green)
`deploy/autodeploy.sh` вече прави health-gate + rollback. За пълен blue/green:
вдигни новия „цвят" контейнер, изчакай Docker healthcheck `/health/live`, после
атомарно превключи Caddy upstream (admin API PATCH) / `nginx -s reload`; стария се
дренира със SIGTERM. Rollback = не превключвай. (Внимание: удвоява RAM при swap.)

## Тайни (sops + age)
```bash
age-keygen -o ~/.config/sops/age/keys.txt
sops --encrypt --age <pubkey> medqr.env > medqr.env.sops   # комитваш криптираното
sops --decrypt medqr.env.sops > /etc/medqr/medqr.env       # при деплой, mode 600
```

## Бекъп + проверено възстановяване
```bash
RESTIC_REPOSITORY=... RESTIC_PASSWORD=... bash tools/vps/backup-verify.sh backup
bash tools/vps/backup-verify.sh verify   # restic check + test-restore (бекъп ≠ restore-tested!)
```
Cron: дневен `backup`, месечен `verify`. Off-site backend (S3/B2), append-only.
Покрива само zabobovdol и medqr (панелът го вика оттук); целият сървър — `offsite-backup.sh` по-долу.

## Преместване на нов сървър — `migrate-backup.sh`
Пълен шифриран архив на VPS, без да се предполага какво върви на него: открива наши systemd
услуги, Docker контейнери/томове, Postgres/MySQL/Redis (в контейнер или на хоста), SQLite,
nginx/Caddy, сертификати, крон. Хваща и продукти извън монорепото.
```bash
PLAN=1 bash tools/vps/migrate-backup.sh    # само инвентар + размери + какво би спрял FINAL
bash tools/vps/migrate-backup.sh           # горещ архив (репетиция, без прекъсване)
FINAL=1 bash tools/vps/migrate-backup.sh   # замразяване: спира писачите → дъмпове → спира базите → архив
```
Изход в `/var/migrate`: `<хост>-<режим>-<час>.tar.{zst,gz}.gpg` (AES256, ключ `/root/migrate.pass`,
създава се при липса), `.sha256` и `.inventory.txt` (БЕЗ тайни — по него се планира новият
сървър). Всеки Postgres дъмп се проверява с `pg_restore -l`, SQLite се копира през backup API
(`quick_check`), а архивът се дешифрира и прочита целият, преди да се обяви за готов. FINAL
оставя сървъра спрян и пише `restart-<час>.sh` за връщане. Пускай го в `tmux`. Тестван
(`migrate-backup.test.mjs`).

С `DUMP_TO=<папка>` прави само дъмповете + списъка с пътища и изключения (без архив и gpg) —
това е основата на нощния бекъп по-долу. Една логика за „какво е важно на сървъра“, не две.

## Бекъп извън машината — `offsite-backup.sh` (restic)
Целият сървър, всяка нощ, в хранилище при ДРУГ доставчик (Hetzner Storage Box през SFTP, порт 23).
Покрива всичко, което `migrate-backup.sh` открива — не само zabobovdol и medqr като
`backup-verify.sh`.
```bash
offsite-backup.sh init        # еднократно: създава хранилището
offsite-backup.sh backup      # дъмпове (DUMP_TO) → restic backup → forget --prune
offsite-backup.sh verify      # restic check (5% от данните) + пробно възстановяване на дъмповете
offsite-backup.sh snapshots
```
Конфиг `/etc/offsite-backup.env` (root, 600) — редове `КЛЮЧ=стойност`, четат се по затворен
списък, НЕ се изпълняват като shell (`&` в адреса на Uptime Kuma иначе тихо изтрива полето):
```
RESTIC_REPOSITORY=sftp:storagebox:restic/<хост>
RESTIC_PASSWORD_FILE=/root/.restic-offsite.pass
HEALTHCHECK_URL=https://…          # по избор: пинг след backup, …/fail при провал
HEALTHCHECK_VERIFY_URL=https://…   # по избор: отделен адрес за verify
KEEP_DAILY=7
KEEP_WEEKLY=4
KEEP_MONTHLY=6
```
Скриптът и `migrate-backup.sh` трябва да са в ЕДНА папка; единиците (`systemd/`) ги викат от
`/usr/local/sbin`:
```bash
apt-get install -y restic postgresql-client python3
install -m 700 /opt/few-few/current/tools/vps/{offsite,migrate}-backup.sh /usr/local/sbin/
install -m 644 /opt/few-few/current/tools/vps/systemd/offsite-{backup,verify}.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now offsite-backup.timer offsite-verify.timer
```
Нощем в 04:10 UTC (след местните бекъпи на продуктите), пробата — неделя 07:40 UTC; двете държат
едно заключване. Ключът на restic се пази и ИЗВЪН сървъра — без него снимките не се отварят.
`verify` хваща СТРУКТУРНО повредена SQLite и нечетим Postgres дъмп; бит, сменен в данните на
SQLite, не (тя няма контролни суми) — гниенето в самото хранилище хваща `restic check`.
Тестван (`offsite-backup.test.mjs`: init → backup → verify, повредена снимка, пинговете).

## Мониторинг (леко)
```bash
docker compose -f tools/vps/monitoring/docker-compose.monitoring.yml up -d
```
Beszel (метрики, 10MB агент) + Uptime Kuma (HTTP probe + Telegram/имейл алерти).
Не пускай Prometheus+Grafana+Loki+Vault на малък VPS — може да тежи повече от апите.

## Доставка-целост
sha256 (вече в `autodeploy.sh`) + **cosign keyless** подпис на zabobovdol образите в CI,
`cosign verify` гейт преди деплой. CrowdSec (nftables ipsets) + fail2ban.
