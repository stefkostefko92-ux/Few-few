# CarbonStealth.eu | Dust2 DM

CS2 Deathmatch сървър само на de_dust2 от Carbon Stealth VCC. Фаза 1: ванилов сървър под systemd.

## Инсталация на VPS-а (фаза 1)

Всичко се пуска като root (или със `sudo`). Първото пускане сваля ~60 GB — затова в `tmux`.

```bash
# 0) сесия, която оцелява при прекъснат SSH
tmux new -s cs2

# 1) изходният код за точен клон/таг → /root/cs2dm-src
REF=main
rm -rf /root/cs2dm-src && mkdir -p /root/cs2dm-src
curl -fsSL "https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/$REF" \
  | tar -xz -C /root/cs2dm-src --strip-components=1 --wildcards '*/cs2dm/*'

# 2) само проверки — нищо не променя (CPU, RAM, диск ≥70 GB, портове, ufw, GSLT)
sudo bash /root/cs2dm-src/cs2dm/server/install.sh --check

# 3) инсталация (създава и /etc/cs2/cs2.env, ако липсва)
sudo bash /root/cs2dm-src/cs2dm/server/install.sh

# 4) GSLT: steamcommunity.com/dev/managegameservers → App ID 730 → токенът в CS2_GSLT=
sudo nano /etc/cs2/cs2.env

# 5) пак инсталатора — този път пуска сървъра и чака A2S отговор
sudo bash /root/cs2dm-src/cs2dm/server/install.sh
```

## Фаза 2 — модове (Metamod + CounterStrikeSharp + Deathmatch)

```bash
# 1) нов код (както в стъпка 1 горе), после обновената фаза 1 (слага общата библиотека)
sudo bash /root/cs2dm-src/cs2dm/server/install.sh

# 2) SteamID64 на собственика → админ в играта (17 цифри, 7656119…)
echo 'CS2_OWNER_STEAMID64=7656119XXXXXXXXXX' | sudo tee -a /etc/cs2/cs2.env >/dev/null

# 3) модовете — сваля, проверява sha256, инсталира, рестартира и доказва зареждането
sudo bash /root/cs2dm-src/cs2dm/server/mods/install-mods.sh
```

В играта: `!gun` (оръжия), `!dm` (менюто на Deathmatch). Режимите се сменят сами: All Weapons →
Only Headshot → Only Deagle → Only Pistols → Only SMG. Състояние: `install-mods.sh --status`;
изключване (ванилов DM): `install-mods.sh --disable`.

## Ежедневно

| Какво | Команда |
|---|---|
| Логове на живо | `journalctl -u cs2 -f` |
| Здраве (A2S) | `node /usr/local/lib/cs2dm/health.mjs` |
| Рестарт | `sudo systemctl restart cs2` |
| Ъпдейт сега | `sudo systemctl start cs2-update.service` |
| Последни проверки за ъпдейт | `journalctl -u cs2-update -n 20` |
| В листинга ли е | `curl -s "https://api.steampowered.com/ISteamApps/GetServersAtAddress/v1/?addr=<IP>"` |
| В играта | `connect dm.carbonstealth.eu:27015` (след A запис към IP-то на VPS-а) |

Промяна на настройките: редакция на `server/cfg/gamemode_deathmatch_server.cfg` в репото → PR → стъпки
1 и 5 (инсталаторът е идемпотентен; рестартира сървъра).
