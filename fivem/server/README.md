# Балкан — FiveM сървър (Qbox + ox)

Консолидиран български RP сървър с **жив свят, който помни какво правиш**. Изграден на
модерния стек **Qbox (`qbx_core`) + ox_lib/ox_inventory/ox_target/oxmysql**, OneSync
Infinity, server-authoritative от ден 1. Концепцията и пазарното проучване са в
[`../ПРОУЧВАНЕ-И-КОНЦЕПЦИЯ.md`](../ПРОУЧВАНЕ-И-КОНЦЕПЦИЯ.md).

## Какво е в това репо и какво не е

- ✅ **Нашите ресурси** (`resources/[bg]/`) — това, което прави сървъра „нашия“.
- ✅ Конфигурация, DB схема, setup скрипт.
- ❌ **Третостранните ресурси** (qbx_core, ox_lib, ox_inventory…) — отделни проекти със
  собствени лицензи и голям размер. **Не се комитват**; `setup.sh` ги тегли, а
  `.gitignore` ги изключва.
- ❌ **Тайни** (DB парола, лицензен ключ) — само на сървъра в `server.secret.cfg`
  (mode 600). В репото има само `server.secret.cfg.example`.

## Нашите ресурси — `resources/[bg]/`

| Ресурс | Роля |
|---|---|
| `bg_core` | Споделен договор: `BGConfig` (фракции/зони/loop параметри) + server helper-и. **Зарежда се пръв.** |
| `bg_spawn` | Onboarding — стартов пакет (server-authoritative, веднъж) + tutorial. |
| `bg_territory` | **LOOP A** — динамична територия: фракции борят зони в реално време. |
| `bg_economy` | **LOOP B** — жива икономика (цени от offer/demand) + офлайн бизнеси. |
| `bg_reputation` | **LOOP C** — репутация/наследство: NPC цени/достъп реагират на теб. |

Трите loop-а се преплитат: бизнес в зона, контролирана от твоята фракция, носи бонус
(`bg_territory` → `bg_economy`); репутацията ти дава отстъпки при търговия
(`bg_reputation` → `bg_economy`).

## Инсталация (кратко)

```bash
# 1) FXServer artifact — Recommended канал (~build 25770+), не Latest
#    https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/  (или linux)

# 2) Зависимости (ox + qbx) в resources/
cd fivem/server
./setup.sh

# 3) База данни
#    създай БД + потребител; импортирай базовата схема на qbx_core, после нашата:
mysql balkan < sql/02_custom.sql

# 4) Тайни
cp server.secret.cfg.example server.secret.cfg   # НА СЪРВЪРА, chmod 600
#    попълни sv_licenseKey, mysql_connection_string, ...
#    и разкоментирай `exec server.secret.cfg` в server.cfg

# 5) Старт
<FXServer>/run.sh +exec server.cfg
```

### Зависимости — бележка за production

`setup.sh` клонира `ox_lib` и `ox_inventory` от raw git. За production вземи
**официалните release билдове** (съдържат компилираното web UI) от GitHub Releases на
overextended — иначе UI-то (inventory/меню) може да липсва.

## Сигурност (правило №1)

Всичко е **server-authoritative**: клиентът иска, сървърът решава. Всяко net събитие
валидира `source`, типове и диапазони; парите/предметите се четат от сървърното
състояние, не от payload-а; SQL е само параметризиран; чувствителните събития имат
rate limit (`bg_core:RateLimit`). Анти-чийтът е **втори** слой — не заместител.

## Настройка на света

Фракции, зони, цени и параметрите на трите loop-а са в **едно място**:
[`resources/[bg]/bg_core/shared/config.lua`](resources/[bg]/bg_core/shared/config.lua)
(`BGConfig`). Промяна там се отразява навсякъде.
