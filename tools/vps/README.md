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
ansible-galaxy collection install community.general ansible.posix   # ufw + authorized_key

# 1) ПЪРВИ ПЪТ — чист хост, влиза се само като root:
SSH_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" \
  ansible-playbook -i 'SERVER,' -u root tools/vps/ansible/site.yml

# 2) ОТТУК НАТАТЪК — root по SSH е забранен; влиза се като deploy и се става root със sudo:
cp tools/vps/ansible/inventory.example.ini tools/vps/ansible/inventory.ini   # смени SERVER; не го комитвай
ansible-playbook -i tools/vps/ansible/inventory.ini tools/vps/ansible/site.yml --check --diff   # суха проба
ansible-playbook -i tools/vps/ansible/inventory.ini tools/vps/ansible/site.yml
```
Какво прави `site.yml` (Ubuntu 24.04), в ред, който не заключва достъпа:
1. Спира веднага, ако няма ключ за `deploy` (нито `SSH_PUBKEY`, нито ключ на хоста).
2. `deploy` + ключ + `sudo` без парола (`/etc/sudoers.d/90-deploy`, `visudo -cf`) → **проба** от твоята
   машина: `ssh deploy@сървъра sudo -n true`. Без успешна проба нищо по SSH не се пипа.
3. fail2ban (`/etc/fail2ban/jail.local`, проверен с `fail2ban-client -t`): `[sshd]` от журнала
   (`backend = systemd`) и `[recidive]` (5 бана за ден → седмица на всички портове). Твоят статичен IP —
   `F2B_IGNOREIP="1.2.3.4"` в средата, за да не се баннеш сам.
4. ufw: `limit` за 22 (6 нови връзки за 30 s от един адрес), `allow` 80/443, deny по подразбиране.
   Docker публикува портове ПРЕДИ ufw (DNAT) — затова приложенията се връзват на `127.0.0.1`.
5. Часова зона `Etc/UTC` (`host_timezone`) и unattended-upgrades с автоматичен рестарт в **01:30 UTC** —
   преди всички нощни задачи (бекъпи 02:30–03:40 UTC, supreme репетиция нд 04:30, zabobovdol 00:00),
   без застъпване. Таймерите/cron без зона (Nexus 03:30, supreme-restore-drill, vizitka/panev cron) се
   четат в UTC — ако хостът досега е бил в `Europe/Sofia`, те тръгват 2–3 ч по-рано в абсолютно време
   (пак без застъпване с рестарта). Следене:
   `tail -n 50 /var/log/unattended-upgrades/unattended-upgrades.log`, `ls /var/run/reboot-required`,
   `apt-config dump | grep -i reboot`. Таблото (vpsdash) показва чакащ рестарт.
6. Docker от официалното apt хранилище (`download.docker.com`), ключът — проверен по отпечатък
   `9DC8 5822 9FC7 DD38 854A E2D8 8D81 803C 0EBF CD88`; друг отпечатък = спиране. Без `curl | sh`.
   Docker не е в unattended-upgrades (ъпдейтът рестартира контейнерите) — `apt upgrade docker-ce` на ръка.
   Ключовият файл трябва да съдържа **точно един** първичен ключ (`pub:`) и отпечатъкът да е неговият.
6б. Логове с таван: `/etc/docker/daemon.json` (слят с досегашния, `dockerd --validate`) с
   `log-driver json-file`, `max-size 10m`, `max-file 3`; journald — `SystemMaxUse=500M`
   (`/etc/systemd/journald.conf.d/50-few-few.conf`). Docker се рестартира **само при промяна** —
   първият път това рестартира всички контейнери (кратко прекъсване; пусни в тих час). Таванът важи за
   новосъздадени контейнери — старите го поемат при следващия деплой / `up -d --force-recreate`.
   Изключение: `vpsdash/deploy/desktop` е с `restart: 'no'` (нарочно) — след рестарта на Docker
   остава **спрян**; ако е бил пуснат, вдигни го ръчно (`docker compose up -d` в неговата папка).
7. auditd: промени в `/etc/ssh`, sudoers, `authorized_keys` (root и `ssh_allow_users`), cron, unit-и,
   passwd/group/shadow. Търсене: `ausearch -k authorized_keys -i`, `aureport -k`.
8. **Последно** — `sshd_config.d/10-hardening.conf` (първата прочетена стойност печели, 10- е преди
   50-cloud-init): само ключ (`AuthenticationMethods publickey`), `PermitRootLogin no`,
   `AllowUsers deploy`, `MaxAuthTries 3`, `LoginGraceTime 30`, `LogLevel VERBOSE`,
   `ClientAliveInterval 300`/`CountMax 2`. Файлът минава `sshd -t -f`, после целият конфиг `sshd -t`,
   рестарт само при успех и **втора проба** с нова връзка; провал → старият файл се връща и sshd се
   рестартира пак. Отворената сесия оцелява при рестарта. **Dead-man switch:** преди рестарта
   `systemd-run --on-active=300` (`ssh-deadman.timer`) насрочва връщане на стария drop-in + рестарт на
   ssh; успешната втора проба го отменя. Падне ли връзката на Ansible, хостът сам се връща до 5 мин.
   `--check --diff` работи: задачите само за четене (архитектура, ключът, `sshd -t`, пробите) вървят и
   в сухата проба (`check_mode: false`).

След т. 8 качването на ZIP става като `deploy` (`scp архив deploy@сървъра:` → `sudo mv ~/архив /root/`) —
root по SSH вече не влиза. Друг човек с SSH достъп → добави го в `ssh_allow_users`, иначе `AllowUsers` го спира.
При много ключове в агента (`MaxAuthTries 3`): `ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 …`.

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
# След инцидент — снимката отпреди първия признак, в НОВА папка (живото не се пипа):
bash tools/vps/backup-verify.sh verify  --before 2026-11-14T03:00:00Z
bash tools/vps/backup-verify.sh restore --before 2026-11-14T03:00:00Z --target /var/backups/incident
```
`restic check` доказва **цялост** (архивът е читаем и непокътнат), не че данните са чисти — снимка след
пробива вярно пази и пробива.
Cron: дневен `backup`, месечен `verify`. Off-site backend (S3/B2), append-only.

## Мониторинг (леко)
```bash
docker compose -f tools/vps/monitoring/docker-compose.monitoring.yml up -d
```
Beszel (метрики, 10MB агент) + Uptime Kuma (HTTP probe + Telegram/имейл алерти).
Не пускай Prometheus+Grafana+Loki+Vault на малък VPS — може да тежи повече от апите.

## Доставка-целост
sha256 (вече в `autodeploy.sh`) + **cosign keyless** подпис на zabobovdol образите в CI,
`cosign verify` гейт преди деплой.

**Защита от налучкване — какво реално е включено:** fail2ban (`[sshd]` + `[recidive]`, от `site.yml`)
и `ufw limit` за SSH; nginx `limit_req` в конфигурациите на продуктите. **CrowdSec НЕ е инсталиран** —
нито в `site.yml`, нито другаде в репото. Ако се добави (nftables bouncer + общи блоклисти за уеб слоя),
трябва да е отделна задача с конфигурация тук, не само текст.
