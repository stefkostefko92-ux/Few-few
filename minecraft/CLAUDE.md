# CLAUDE.md — minecraft/

Vanilla Minecraft Java **26.3** + **Pelican Panel/Wings v1.0.0-rc.1** на VPS-а (`178.104.77.242`).
Инфраструктура, не приложение: няма собствен код освен deploy скриптовете. Пълното описание →
`README.md`.

## Инварианти

- **Версиите са закачени.** Панел: таг в `deploy/compose.yml`. Wings: `WINGS_VERSION` + двата sha256 в
  `deploy/install.sh` (от `checksums.txt` на релийза в `github.com/pelican/wings`). Никога `latest`.
  Minecraft: `MC_VERSION` (по подразбиране) + образ `yolks:java_<N>` според `javaVersion.majorVersion` в
  манифеста на Mojang (`piston-meta.mojang.com`) — 26.x иска Java 25.
- **Портове:** 4330 панел, 4331 Wings (и двата само 127.0.0.1, зад nginx), 2022 SFTP, 25565 игра.
  Нов порт → първо `ss -tlnp` и картата в `deploy/autodeploy.sh` (8080 е на SupremeDiscordBot).
- **Мрежи** `10.240.30.0/24` (панел) и `10.240.31.0/24` (Wings) — извън 172.16/12 на другите стекове.
- **Wings конфигът** се втвърдява от `install.sh` (`api.host 127.0.0.1`, `ignore_panel_config_updates`);
  не го връщай към подразбирането на панела.
- **Тайни** само на сървъра: `/opt/pelican/.env`, `/etc/pelican/config.yml` (600). `install.sh` не ги
  печата; `bootstrap.php` не печата токени.
- **EULA на Mojang** я приема човек в конзолата — скриптът никога не пише `eula=true`.
- Не е в `deploy/autodeploy.sh`: инсталира се и се обновява с `deploy/install.sh` (идемпотентен).

## Quality gate

```bash
cd minecraft/deploy
shellcheck -S style install.sh backup.sh
bash -n install.sh && bash -n backup.sh
docker run --rm -v "$PWD":/w -w /w php:8.4-cli-alpine php -l bootstrap.php
printf 'PANEL_FQDN=x\nAPP_KEY=x\nDB_PASSWORD=x\nDB_ROOT_PASSWORD=x\nREDIS_PASSWORD=x\n' > /tmp/mc.env \
  && docker compose --env-file /tmp/mc.env -f compose.yml config -q
```

`nginx -t` на vhost-овете — с образа `nginx` и временни self-signed сертификати (пътищата са
`/etc/letsencrypt/live/<fqdn>/`).
