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

## Мониторинг (леко)
```bash
docker compose -f tools/vps/monitoring/docker-compose.monitoring.yml up -d
```
Beszel (метрики, 10MB агент) + Uptime Kuma (HTTP probe + Telegram/имейл алерти).
Не пускай Prometheus+Grafana+Loki+Vault на малък VPS — може да тежи повече от апите.

## Доставка-целост
sha256 (вече в `autodeploy.sh`) + **cosign keyless** подпис на zabobovdol образите в CI,
`cosign verify` гейт преди деплой. CrowdSec (nftables ipsets) + fail2ban.
