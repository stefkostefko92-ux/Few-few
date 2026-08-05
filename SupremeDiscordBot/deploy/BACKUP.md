# Бекъпи на базата — Supreme Bot

Изпълнява договорното обещание в [`legal/DPA.md`](../legal/DPA.md) §5.1:
**„Daily PostgreSQL backups, 30-day retention, encrypted at rest.“**

| | |
|---|---|
| Какво | целият PostgreSQL (`pg_dump -Fc`, custom формат) |
| Кога | дневно **03:00 UTC** (`supreme-backup.timer`, `Persistent=true`) |
| Къде | `/var/backups/supreme/supreme-YYYYmmdd-HHMM.dump.gpg` (mode 600) |
| Криптиране | `gpg --symmetric` AES-256, парола от `/root/.supreme-backup-pass` |
| Задържане | 30 дни (`find -mtime +30 -delete`) — **само след успешен нов бекъп** |
| Лог | `journalctl -u supreme-backup.service` |

Файлове: `backup-postgres.sh`, `restore-postgres.sh`, `supreme-backup.service`,
`supreme-backup.timer`.

---

## 1. Еднократна настройка (собственикът)

```bash
# 1) Парола за криптиране — ЗАПАЗИ Я И ИЗВЪН СЪРВЪРА (мениджър на пароли)!
#    Без нея нито един бекъп не може да бъде отворен. Няма възстановяване.
umask 077
openssl rand -base64 48 > /root/.supreme-backup-pass
chmod 600 /root/.supreme-backup-pass

# 2) Инструменти (обикновено вече са налични)
apt-get update -y && apt-get install -y gnupg

# 3) Директорията ТРЯБВА да съществува преди старта на unit-а
#    (ProtectSystem=strict + ReadWritePaths — липсва ли, systemd не тръгва).
mkdir -p /var/backups/supreme && chmod 700 /var/backups/supreme

# 4) Инсталация на скрипта + таймера
#    Прави се АВТОМАТИЧНО от deploy/autodeploy.sh при всеки деплой.
#    Ръчно (ако трябва):
install -m 700 deploy/backup-postgres.sh  /usr/local/sbin/supreme-backup-postgres
install -m 700 deploy/restore-postgres.sh /usr/local/sbin/supreme-restore-postgres
install -m 644 deploy/supreme-backup.service /etc/systemd/system/supreme-backup.service
install -m 644 deploy/supreme-backup.timer   /etc/systemd/system/supreme-backup.timer
systemctl daemon-reload
systemctl enable --now supreme-backup.timer
```

Проверка:

```bash
systemctl list-timers supreme-backup.timer   # кога е следващото пускане
systemctl start supreme-backup.service       # пусни веднага (синхронно)
journalctl -u supreme-backup.service -n 40 --no-pager
ls -lh /var/backups/supreme/
```

## 2. Какво прави скриптът (и защо е fail-closed)

1. Проверява паролата и че базата отговаря (`pg_isready`).
2. `docker compose exec -T postgres pg_dump -Fc` → **направо** в `gpg --symmetric`
   (некриптиран дъмп никога не докосва диска).
3. Проверява резултата: размер > 1 KB, разкриптира го обратно с паролата и
   изисква магическото `PGDMP` в началото — така всеки ден се доказва, че
   **паролата отваря бекъпа**.
4. Чак тогава ротира старите (>30 дни). При **всеки** провал по-горе: изход с
   грешка, **нищо старо не се трие** (по-добре стар бекъп, отколкото никакъв).

## 3. Тест на restore — задължителен

Бекъп без тестван restore не е бекъп; DPA обещава работещо възстановяване.
Тестът върви в **отделна база** и не пипа живата:

```bash
sudo /usr/local/sbin/supreme-restore-postgres \
     /var/backups/supreme/supreme-20260805-0300.dump.gpg \
     --yes-i-know --into supreme_restore_test
```

Скриптът: сверява `.sha256`, разкриптира, създава тестовата база, прави
`pg_restore` и накрая брои таблиците. Успех = ненулев брой таблици. Почисти:

```bash
docker exec -i supremebot_postgres dropdb -U bot supreme_restore_test
```

**Каданс:** при първо пускане и после веднъж на тримесечие; записвай датата и
резултата (доказателство при одит/DPA проверка).

Само оглед на съдържанието, без промени:

```bash
sudo /usr/local/sbin/supreme-restore-postgres <файл> --list
```

## 4. Истинско възстановяване (авария)

> ⚠ **Разрушително.** `pg_restore --clean` изтрива и пресъздава обектите в живата
> база; всичко след избрания бекъп се губи. Прави се само осъзнато.

```bash
sudo /usr/local/sbin/supreme-restore-postgres \
     /var/backups/supreme/supreme-20260805-0300.dump.gpg --yes-i-know
```

Скриптът: снимка на текущата база (`pre-restore-*.dump`) → спира `backend` и
`bot` → `pg_restore --clean --if-exists` → пуска ги обратно (дори при грешка,
през `trap`) → брои таблиците. Без успешна снимка на живата база **не**
продължава (освен с изричен `--no-pre-dump`).

След това: `docker compose ps` и `curl -fsS http://127.0.0.1:8080/`.

## 5. Off-site копие (препоръчително)

Бекъп на същия диск не оцелява при загуба на VPS-а. Двата варианта:

```bash
# A) scp към втория VPS (нужен е SSH ключ без парола за backup потребител)
systemctl edit supreme-backup.service     # добави:
# [Service]
# Environment=OFFSITE_CMD=/usr/local/sbin/supreme-offsite

cat > /usr/local/sbin/supreme-offsite <<'EOF'
#!/bin/sh
exec scp -q -i /root/.ssh/backup_ed25519 "$1" backup@vps2.example.eu:/var/backups/supreme/
EOF
chmod 700 /usr/local/sbin/supreme-offsite

# B) rclone към S3-съвместимо ЕС хранилище (Hetzner Storage Box / Object Storage)
#    OFFSITE_CMD скрипт с:  rclone copy "$1" remote:supreme-backups/
```

`OFFSITE_CMD` се извиква с пътя на готовия файл и е **best-effort** — провал в
изпращането не проваля локалния бекъп (виждаш го като ⚠ в journal-а).
Файловете вече са криптирани, така че отсрещната страна не вижда данни.

## 6. Бекъп преди деплой

`deploy/autodeploy.sh` (в корена на репото) прави **некриптиран** дъмп в
`/var/backups/supreme/pre-deploy-<timestamp>.dump` **преди** миграциите на всеки
деплой; при провал на дъмпа деплоят спира (fail-closed) — не мигрираме без
застраховка. Пазят се последните 5. Това са краткоживеещи снимки в допълнение на
дневния криптиран бекъп, не заместител.

## 7. Ако нещо не работи

| Симптом | Причина / решение |
|---|---|
| `Липсва файл с парола` | стъпка 1 по-горе не е направена |
| `Базата не отговаря` | стекът е спрян → `docker compose ps`, `docker compose up -d` |
| `Не намирам работеща база` | `COMPOSE_DIR` сочи грешно (виж `systemctl cat supreme-backup.service`) |
| `Дъмпът е само NB` | провален `pg_dump` — виж journal-а; старите бекъпи са запазени |
| `Съдържанието не е pg_dump` | паролата е сменена, а старите бекъпи са с предишната → пази и старата парола |
| Таймерът не се пуска | `systemctl status supreme-backup.timer`, `systemctl list-timers` |
