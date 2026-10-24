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

### Модовете от `mods.lock`

Всеки архив е закован по sha256, сметнат от нас върху свалания файл; нова версия = нов ред + PR. Ядрото
(Metamod, CounterStrikeSharp, Deathmatch) не се изключва. Всеки друг мод се изключва с
`CS2DM_SKIP_MODS=<имена,със,запетая>` в `/etc/cs2/cs2.env` и ново пускане на `install-mods.sh` (махат се от
сървъра; кешът остава — празен списък ги връща). MultiAddonManager се слага сам, щом има Workshop addon-и.

| Мод (`име`) | Версия | Какво прави | Лиценз | Изключване |
|---|---|---|---|---|
| ServerListPlayersFix (`serverlistplayersfix`) | 2.1 | Metamod плъгин: попълва играчите в Steam API → виждат се в браузъра на сървъри | GPLv3 | `CS2DM_SKIP_MODS=serverlistplayersfix` |
| Quake Sounds (`quakesounds`) | 26.08.1 | звуци за серии 3/5/7/10/15/20 и first blood. **Само звук** — текстовете за серии, баунти и отмъщение са в нашия чат. `!qs` заглушава за себе си | GPLv3 (кодът), звуците — ⚠️ по-долу | `CS2DM_QUAKE_SOUNDS=0` |
| Cosmetics (`cosmetics`) | 26.05.1 | **само** лъч от убиеца до жертвата (1.5 s); надгробни камъни, цветен дим, модели — изключени | GPLv3 | `CS2DM_SKIP_MODS=cosmetics` |
| Demo Recorder (`demorecorder`) | 26.05.1 | SourceTV запис, докато има хора (виж „Демота“) | GPLv3 | `CS2DM_SKIP_MODS=demorecorder` |
| Cheater Troll (`cheatertroll`) | 26.08.1 | админ инструмент: тихи „наказания“ за маркиран читър (`cheater` в конзолата на играта); право `@cheatertroll/admin` = HEADADMIN+ | GPLv3 | `CS2DM_SKIP_MODS=cheatertroll` |
| MetaBlock (`metablock`) | 1.0.0 | крие `meta list`, `css_plugins`, `css` от играчите (собственикът с `@css/root` ги вижда) | MIT | `CS2DM_SKIP_MODS=metablock` |
| MultiAddonManager (`multiaddonmanager`) | 1.7.1 | Workshop addon-и: банерите (`CS2_WORKSHOP_ADDONS`) + звуците (3461824328, накрая) | GPLv3 | сам — без addon-и не се слага |

Освен това в `Deathmatch.json` звуците на DM плъгина за попадение, убийство, headshot и нож са включени по
подразбиране (всеки играч ги спира от `!dm`). Бинарните файлове не ги разпространяваме — сървърът ги тегли
от авторите, затова GPL не ни задължава с нищо; нашият плъгин не ги линква.

⚠️ **Звуците на Quake Sounds** (Workshop 3461824328, от `Kandru/cs2-quake-sounds-resources`): README-то им
казва „Sounds belong to their respective owners… very old files from very early games and additional AI
generated sounds“ — **лицензът е неясен**. Временно са; ще ги сменим с наш български озвучител (собствен
addon + `CS2DM_QUAKE_SOUNDS=0` или собствен soundevent файл в `config/QuakeSounds.json`).

⚠️ **MetaBlock** хуква `ClientCommand` по позиция във vtable (индекс 17, проверено от автора на CS2
1.41.8.9). Ако след голям ъпдейт на CS2 сървърът пада при влизане на играч → `CS2DM_SKIP_MODS=metablock` и
нов релийз на MetaBlock.

Пропуснати (един ред защо): **CS2FOW / CS2AC** — неподдържани · **GunGame** — друг режим, бие се с DM ·
**Roll The Dice** — случайни предимства = нечестно · **WeaponPaints / скинове / ножове / ръкавици / агенти**
— правилата на Valve за GSLT (перманентен бан) · **High Ping Kicker, AFKManager** — net8 / без net10 релийз →
наша реализация (честна игра в плъгина CarbonStealth).

### Демота (SourceTV)

- Папка: `/opt/cs2/server/game/csgo/addons/counterstrikesharp/data/demos/` (0750, само `cs2`), име
  `ГГГГ_ММ_ДД_ЧЧ_мм-de_dust2.dem`. Сваляне: `sudo ls -lh` на папката → `scp`.
- Запис, докато има поне един човек; спира при края на мача (`cs_win_panel_match` — 10 s преди смяната на
  картата на 30 мин), при празен сървър и преди ръчен `changelevel` (CS2 пада, ако записът тече при смяна).
- **Срок 14 дни** (обещан в политиката за поверителност) + таван `CS2DM_DEMO_MAX_GB` (10 GB, най-старите
  първо) — `cs2-demos-clean.timer` на всеки час: `systemctl list-timers cs2-demos-clean.timer`.
- Без глас в записа (`tv_relayvoice 0`), без зрители на живо (`tv_maxclients 0`; 27020 е затворен в ufw).

## Фаза 3 — нашият плъгин CarbonStealth

Банове/мют/гаг с категории (публичен банлист), админ меню `!admin` (7 роли, immunity), статистики,
XP и нива, баунти и отмъщение, тагове, реклами в чата, банери в картата и мост към сайта. Иска
базата и Redis на приложението (`cs2dm/app`) — до тогава плъгинът стои неактивен.

```bash
# 1) в /etc/cs2/cs2.env: CS2DM_DB_CONNECTION, CS2DM_REDIS_CONNECTION, CS2DM_BRIDGE_KEY (виж cs2.env.example)
# 2) билд (локален dotnet или .NET SDK контейнер, закован по digest) → инсталиране → рестарт
sudo bash /root/cs2dm-src/cs2dm/server/mods/install-plugins.sh
# след промяна само в cs2.env:
sudo bash /root/cs2dm-src/cs2dm/server/mods/install-plugins.sh --config
```

В играта: `!rank` · `!report <име> <причина>` · екипът: `!admin`, `!kick`, `!ban <цел> <30m|2h|7d|0>
<cheating|toxicity|exploit|spam|other>`, `!mute`/`!gag`/`!silence`, `!unban <steamid64>`, `!warn`, `!slay`.
Банери (HEADADMIN+): гледай към стена → `!banner add carbonstealth` / `!banner add adblock`;
картинките (лого + снимки от Chrome Web Store) — `addon/README.md`.

**Честна игра** (без kick; HELPER+ е изключение): жив играч без клавиш и без движение на мишката
`CS2DM_AFK_SECONDS` (90) секунди → предупреждение → наблюдател (админ с отворено `!admin` меню не се брои);
среден пинг за ~30 s над `CS2DM_MAX_PING` (150) → предупреждение → още 15 s → наблюдател. `0` изключва;
промяна → `install-plugins.sh --config`.

**Права за чуждите плъгини:** ролята от базата дава права на CounterStrikeSharp в паметта (CONTRACT §1) —
HELPER+ `@css/generic`, MODERATOR+ `@css/chat` `@css/kick`, ADMIN+ `@css/ban` `@css/slay`, HEADADMIN+
`@cheatertroll/admin`; махат се при понижение и излизане. Никога `@css/vip` (pay-to-win в DM) и `@css/root`.

## Агентът на сървъра (за уеб панела)

Сайтът е в Docker и не може да рестартира играта сам. `cs2-agent` тича на хоста като `cs2agent` (без root)
и приема само подписани команди: статус, рестарт, ъпдейт, логове (редактирани). Иска Ubuntu 24.04+
(polkit с JavaScript правила), Node ≥ 20 в `/usr/bin/node`, вече пуснат `install.sh` и сайта
(`/etc/cs2/app.env` с `REDIS_PASSWORD`).

```bash
# 1) нов код (както в стъпка 1 горе), после агентът: потребител, файлове, ключове, unit, polkit, самопроверка
sudo bash /root/cs2dm-src/cs2dm/server/agent/install-agent.sh

# 2) ако е казал „app.env е променен“ — сайтът да види ключовете (CS2DM_AGENT_KEY, CS2DM_BRIDGE_KEY, APP_ENC_KEY);
#    от папката, откъдето е пуснат сайтът
cd /root/cs2dm-src/cs2dm/app && sudo docker compose --env-file /etc/cs2/app.env up -d
```

`APP_ENC_KEY` се създава веднъж и **не се сменя** — с него са шифрирани TOTP тайните на панела. Проверка
по всяко време: `sudo node /usr/local/lib/cs2dm/agent/cs2-agent.mjs --selftest`; логове:
`journalctl -u cs2-agent -f`.

## Ежедневно

| Какво | Команда |
|---|---|
| Логове на живо | `journalctl -u cs2 -f` |
| Здраве (A2S) | `node /usr/local/lib/cs2dm/health.mjs` |
| Рестарт | `sudo systemctl restart cs2` |
| Ъпдейт сега | `sudo systemctl start cs2-update.service` |
| Агентът на панела | `systemctl status cs2-agent` · `journalctl -u cs2-agent -n 50` |
| Последни проверки за ъпдейт | `journalctl -u cs2-update -n 20` |
| В листинга ли е | `curl -s "https://api.steampowered.com/ISteamApps/GetServersAtAddress/v1/?addr=<IP>"` |
| В играта | `connect dm.carbonstealth.eu:27015` (след A запис към IP-то на VPS-а) |

Промяна на настройките: редакция на `server/cfg/gamemode_deathmatch_server.cfg` в репото → PR → стъпки
1 и 5 (инсталаторът е идемпотентен; рестартира сървъра).
