# tools/vps — декларативен, наблюдаем, проверен VPS (VPS-аджията v2.0)

Скокът от imperative скрипт към **rebuildable + observable + verified** сървър.
Тайните/ключовете остават на хоста (mode 600), никога в репото.

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
