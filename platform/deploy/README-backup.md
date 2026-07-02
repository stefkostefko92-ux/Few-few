# Бекъп и възстановяване на platform

Криптиран бекъп на **PostgreSQL** (service `db`) и на **тома с качванията**
(`/data/uploads` в контейнера `web`), с ротация. Скриптовете: `deploy/backup.sh`
и `deploy/restore.sh`.

## Модел на сигурност (асиметрично криптиране)

Бекъпите се криптират с **публичен** ключ (`age`, препоръчително, или GPG). На
сървъра стои **само публичният** ключ — той може да криптира, но **не** да
разкриптира. Възстановяване е възможно единствено с **частния** ключ, който
държиш офлайн, извън сървъра. Кражба на сървъра ⇒ бекъпите остават нечетими.

## Генериране на ключ (веднъж, на твоята машина — НЕ на сървъра)

```bash
# age (препоръчително):
age-keygen -o platform-backup.key           # частен ключ — пази офлайн, НЕ на сървъра
grep 'public key' platform-backup.key       # → age1... (публичният получател)
```

- На **сървъра**: сложи само публичния ключ, напр. в `/etc/platform/backup.env`
  (mode 600): `AGE_RECIPIENT=age1...публичен...`
- На **сигурно място извън сървъра**: пази `platform-backup.key` (частния). Без
  него няма възстановяване — направи резервно копие (напр. в password manager).

GPG алтернатива: `GPG_RECIPIENT=<fingerprint/имейл>` и частният ключ в keyring-а
на машината, от която възстановяваш.

## Ръчен бекъп

```bash
cd /opt/few-few/current/platform          # там, където е docker-compose.yml
sudo install -d -m 700 /var/backups/platform   # веднъж — стабилната директория
AGE_RECIPIENT="age1..." bash deploy/backup.sh
# → /var/backups/platform/platform-db-YYYYMMDD-HHMMSS.sql.gz.age        (+ .sha256)
# → /var/backups/platform/platform-uploads-YYYYMMDD-HHMMSS.tar.gz.age   (+ .sha256)
```

Параметри (env): `BACKUP_DIR` (по подр. **`/var/backups/platform`**), `BACKUP_RETENTION`
(по подр. 31 копия на артефакт), `BACKUP_DB_SERVICE`, `BACKUP_UPLOADS_VOLUME`
(ако не се засече автоматично), `BACKUP_HELPER_IMAGE` (по подр. `busybox`).

> **Защо бекъпите са ИЗВЪН папката на проекта:** `autodeploy.sh` разгръща всеки
> релийз в нова папка под `/opt/few-few/releases/` и ротира старите. Ако бекъпите
> стояха в `platform/backups/`, ротацията на релийзите щеше да ги трие заедно с
> кода. Затова по подразбиране пишем в `/var/backups/platform` — извън дървото на
> релийзите. Ако смениш `BACKUP_DIR`, дръж го пак извън `/opt/few-few/releases/`.

## Автоматизиране

- **systemd** (препоръчително): `deploy/systemd/platform-backup.{service,timer}`
  — дневно в 03:15. Инсталация е в шапката на service файла.
- **cron**: виж `deploy/cron.example`.

## Възстановяване (изисква частния ключ, офлайн)

```bash
# базата:
AGE_IDENTITY=~/keys/platform-backup.key \
  bash deploy/restore.sh --db /var/backups/platform/platform-db-YYYYMMDD-HHMMSS.sql.gz.age
# качванията:
AGE_IDENTITY=~/keys/platform-backup.key \
  bash deploy/restore.sh --uploads /var/backups/platform/platform-uploads-YYYYMMDD-HHMMSS.tar.gz.age
# и двете наведнъж — подай --db и --uploads
```

`restore.sh`:
- проверява **SHA256** целостта преди дешифриране;
- прави **предпазен бекъп** на текущото състояние преди презапис;
- **пита за потвърждение** (напиши `ДА`); `-y` пропуска въпроса за автоматизация;
- базата се възстановява с `psql` (дъмпът е `--clean --if-exists`), качванията с
  `tar` вътре в контейнера `web`.

## Тествай възстановяването (бекъп без тестван restore не е бекъп)

Периодично (напр. месечно) възстанови най-новия бекъп в **отделен** compose
проект/стек и потвърди, че панелът тръгва и данните са налични. Не тествай restore
върху продукцията.
