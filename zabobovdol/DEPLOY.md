# Деплой на VPS (zabobovdol.carbonstealth.eu)

Ръководство за пускане на сайта на собствен VPS с Docker.

## 1. Изисквания

- VPS с Linux (Ubuntu/Debian), 1+ GB RAM.
- Инсталирани **Docker** и **Docker Compose**.
- Домейн `zabobovdol.carbonstealth.eu`, чийто A-запис сочи към IP на VPS.

## 2. Качване на кода

```bash
git clone <вашето репо> zabobovdol && cd zabobovdol/zabobovdol
# (проектът е в подпапката zabobovdol/)
```

## 3. Конфигурация

```bash
cp .env.example .env
```

Задайте задължително:

- `AUTH_SECRET` — дълъг случаен низ: `openssl rand -base64 48`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — данни за първия администратор
- `NEXT_PUBLIC_SITE_URL=https://zabobovdol.carbonstealth.eu`
- `POSTGRES_PASSWORD` — силна парола за базата (ползва се от docker-compose)

## 4. Стартиране

```bash
docker compose up -d --build
```

При първото стартиране приложението само създава таблиците в базата
(`prisma db push`). След това заредете администратора и примерните данни:

```bash
docker compose exec app npm run db:seed
```

По избор — заредете реалните обекти в Бобов дол (институции и бизнеси, събрани
от публични източници; скрива примерните записи):

```bash
docker compose exec app npm run db:seed:business
```

Сайтът е достъпен на `http://<IP>` (порт 80). Вход в админ: `/admin/login`.

## 5. HTTPS (силно препоръчително)

Вариант с Let's Encrypt (certbot) на хоста:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d zabobovdol.carbonstealth.eu
```

Копирайте сертификатите:

```bash
mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/zabobovdol.carbonstealth.eu/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/zabobovdol.carbonstealth.eu/privkey.pem  nginx/certs/
```

После:

1. В `docker-compose.yml` разкоментирайте порт `443` и реда за `./nginx/certs`.
2. В `nginx/zabobovdol.conf` разкоментирайте `server { listen 443 ssl; … }`.
3. `docker compose up -d`

Подновяване на сертификата: настройте cron за `certbot renew` + копиране на
файловете + `docker compose restart nginx`.

## 6. Поддръжка

```bash
# Логове
docker compose logs -f app

# Рестарт
docker compose restart app

# Бързо (некриптирано) резервно копие на базата
docker compose exec db pg_dump -U zabobovdol zabobovdol > backup_$(date +%F).sql

# Възстановяване от него
cat backup.sql | docker compose exec -T db psql -U zabobovdol zabobovdol
```

### Препоръчително: автоматичен **криптиран** бекъп (restore само от теб)

Стекът включва услуга **`backup`**, която тръгва автоматично с
`docker compose up -d` и прави криптиран бекъп **всеки ден в 00:00**, пазейки
**последните 31 копия** (≈ последния месец). Криптира с твой публичен ключ —
възстановяване е възможно **само** с частния ти ключ, който държиш офлайн.
Пълни инструкции (генериране на ключ, restore): [`scripts/README-backup.md`](scripts/README-backup.md).

```bash
# еднократно: генерирай ключ на СВОЯ компютър и пази частния офлайн
age-keygen -o backup-key.txt

# на сървъра: сложи САМО публичния ключ в .env
AGE_RECIPIENT="age1...твоят_публичен_ключ..."

# стартирай стека — бекъпите тръгват автоматично
docker compose up -d
docker compose logs -f backup          # следи кога минават
ls -lh backups/                        # готовите криптирани копия

# възстановяване (нужен е частният ти ключ — виж README-backup.md)
AGE_IDENTITY=/path/to/backup-key.txt ./scripts/restore-db.sh backups/zabobovdol-XXXX.sql.gz.age
```

Настройки (в `.env`, по избор): `BACKUP_TIME` (час, по подразб. `00:00`),
`BACKUP_TZ` (по подразб. `Europe/Sofia`), `BACKUP_RETENTION_DAYS` (по подразб. `31`).

## 7. Обновяване на кода

```bash
git pull
docker compose up -d --build
```

Схемата се синхронизира автоматично при старт. Промени, които заличават данни,
изискват ръчна намеса (вижте Prisma migrations за продукционна история).

## 8. Включване на AI чатбота (по избор)

Помощникът има три режима (`CHAT_PROVIDER` в `.env`):

- **`rules`** (по подразбиране) — без AI и без ключове. Отговаря от съдържанието
  на сайта (точни картички с телефон/адрес/часове). Безплатно и надеждно.
- **`gemini`** — **БЕЗПЛАТЕН** Google Gemini Flash. Вземете ключ от
  https://aistudio.google.com/apikey, сложете `CHAT_PROVIDER=gemini` и
  `GEMINI_API_KEY=...`, после `docker compose up -d`.
- **`anthropic`** — платен Claude (най-високо качество). `CHAT_PROVIDER=anthropic`
  + `ANTHROPIC_API_KEY=...`.

С включен AI (gemini или anthropic) помощникът:
- отговаря **поточно** (текстът се появява дума по дума);
- **помни разговора** в рамките на сесията (може да задавате уточняващи въпроси);
- ползва **разширено търсене** с разговорни синоними (напр. „доктор“ намира
  „лекар“, „няма ток“ — „електрозахранване“);
- отговаря **само** от съдържанието на сайта и не измисля телефони/срокове.

Моделът се избира с `GEMINI_MODEL` (по подразбиране `gemini-2.0-flash`) или
`ANTHROPIC_MODEL` (по подразбиране `claude-opus-4-8`; по-евтино `claude-haiku-4-5`).
Препоръка: за безплатно и качествено — `gemini`.

## 9. Внасяне на новини от общината (по избор)

Сайтът може да внася новини от общината като **чернови** за ръчно одобрение.

- Ръчно: в админ панела → „Новини от общината“ → бутон „Внеси новини“.
- Автоматично (cron): задайте `INGEST_TOKEN` в `.env` и настройте задачите по
  график от точка 9.2 (с лог — **никога** `>/dev/null`).

Адресът на източника се задава с `MUNICIPALITY_NEWS_URL` (RSS канал или HTML
списък). Внасят се заглавие, кратко резюме и линк към оригинала — не пълният
текст и не снимките. Внесеното остава **непубликувано**, докато човек не го
одобри; отговорът на вноса казва колко чакат (`pending`).

### 9.1. Кое се брои за новина (строг четец)

Старият четец взимаше всяка връзка от сайта на общината и внесе 15 страници от
**менюто** („Характеристики на общината“, „Правомощия на Кмета“…) като новини.
Сега от HTML списък се приемат **само**:

- връзки, чийто адрес отговаря на `MUNICIPALITY_NEWS_LINK_PATTERN` (регулярен
  израз; по подразбиране `/actual/news/[^/?#!][^?#]*` — отделна новина под
  `…/actual/news/`, без самия списък и без страниране `…/!ut/p/…`);
- и **с дата** до тях (`21.10.2026` или `21 октомври 2026`).

Нито една връзка не отговаря → **нищо не се внася** (fail closed): отговорът е
`{"found":0, "error":"Не са намерени новини по зададения шаблон…"}`, а в
админ панела излиза червено съобщение. Тогава проверете от сървъра какви са
истинските адреси на новините и при нужда сменете шаблона в `.env`:

```bash
curl -s https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news \
  | grep -o 'href="[^"]*"' | grep -i 'actual/news/' | sort -u | head -20
# напр. MUNICIPALITY_NEWS_LINK_PATTERN="/actual/news/[^/?#!][^?#]*"
```

След смяна на `.env`: `docker compose up -d app`. Невалиден израз спира вноса със
съобщение (не внася „каквото падне“). RSS/Atom канал не минава през шаблона, но
записите без дата пак отпадат.

### 9.2. Задачи по график — с лог и ротация

Изходът на всяка задача отива в `/var/log/zabobovdol/cron.log` (ред с дата,
задачата и JSON отговора — само броеве и съобщения, без лични данни). Проблем →
ред `ВНИМАНИЕ` в лога, запис в syslog (`journalctl -t zabobovdol-cron`) и имейл,
ако има как. Токенът се чете от `.env` на сървъра при всяко пускане и минава
през файлов дескриптор — не е в командния ред, в `ps` и в лога.

```bash
# 1) Помощният скрипт
sudo tee /usr/local/bin/zabobovdol-cron >/dev/null <<'EOF'
#!/usr/bin/env bash
# Задачите по график на „За Бобов дол“ — резултатът винаги отива в лог.
#   zabobovdol-cron ingest-news | ingest-transparency | freshness
set -u
SITE="${ZBD_SITE:-https://zabobovdol.carbonstealth.eu}"
ENV_FILE="${ZBD_ENV:-/opt/few-few/shared/zabobovdol/.env}"
LOG=/var/log/zabobovdol/cron.log
job="${1:-}"
case "$job" in
  ingest-news|ingest-transparency) url="$SITE/api/$job" ;;
  freshness) url="$SITE/api/health/freshness?notify=1" ;;
  *) echo "Непозната задача: $job" >&2; exit 2 ;;
esac
token=$(sed -n 's/^INGEST_TOKEN="\{0,1\}\([^"#[:space:]]*\)"\{0,1\}.*$/\1/p' "$ENV_FILE" | tail -n 1)
if [ -z "$token" ]; then
  echo "$(date -Is) $job ВНИМАНИЕ: няма INGEST_TOKEN в $ENV_FILE" >> "$LOG"
  echo "$job: няма INGEST_TOKEN"; exit 1
fi
out=$(curl -sS -m 120 -H @<(printf 'Authorization: Bearer %s\n' "$token") \
  -w '\nHTTP %{http_code}' "$url" 2>&1); rc=$?
line=$(printf '%s' "$out" | tr '\n' ' ')
echo "$(date -Is) $job $line" >> "$LOG"
bad=""
[ "$rc" -ne 0 ] && bad="curl $rc"
case "$out" in *"HTTP 200") ;; *) bad="${bad:-не е HTTP 200}" ;; esac
if [ "$job" = freshness ]; then
  case "$out" in *'"ok":true'*) ;; *) bad="${bad:-остарели данни}" ;; esac
else
  case "$out" in *'"error"'*) bad="${bad:-грешка във вноса}" ;; esac
fi
if [ -n "$bad" ]; then
  echo "$(date -Is) $job ВНИМАНИЕ: $bad" >> "$LOG"
  logger -t zabobovdol-cron "$job: $bad (виж $LOG)"
  echo "$job: $bad — $line"   # cron го праща по имейл, ако има MAILTO и пощенски агент
  exit 1
fi
EOF
sudo chmod 755 /usr/local/bin/zabobovdol-cron
sudo install -d -m 750 /var/log/zabobovdol

# 2) Графикът (часовете са по часовата зона на сървъра)
sudo tee /etc/cron.d/zabobovdol >/dev/null <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Имейл при проблем: сложете адрес, ако сървърът може да праща поща.
MAILTO=""
# 7:00 — внася чернови на новините (публикуването остава ръчно)
0 7 * * * root /usr/local/bin/zabobovdol-cron ingest-news
# 7:30 — проверка за свежест (точка 9.3); при проблем: лог + syslog + имейл
30 7 * * * root /usr/local/bin/zabobovdol-cron freshness
EOF
sudo chmod 644 /etc/cron.d/zabobovdol

# 3) Ротация на лога — седмично, пазят се 12 седмици, компресирани
sudo tee /etc/logrotate.d/zabobovdol-cron >/dev/null <<'EOF'
/var/log/zabobovdol/cron.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
}
EOF
sudo logrotate -d /etc/logrotate.d/zabobovdol-cron   # сух ход — само проверка

# 4) Проба веднага
sudo /usr/local/bin/zabobovdol-cron ingest-news; sudo /usr/local/bin/zabobovdol-cron freshness
tail -n 5 /var/log/zabobovdol/cron.log
```

Ако вече имате стария ред `… /api/ingest-news >/dev/null` в `sudo crontab -e` —
**изтрийте го** (иначе вносът тича два пъти и пак не оставя следа).
Данните за прозрачност се пускат по същия начин:
`zabobovdol-cron ingest-transparency`.

### 9.3. Проверка за свежест — `GET /api/health/freshness`

Защитена със същия `INGEST_TOKEN` (заглавие `Authorization: Bearer …`). Връща
**200** и JSON `{ ok, checkedAt, problems[], stats }` — при проблем `ok:false`
(не грешка 5xx, за да го чете мониторингът); **503** само ако базата не отговаря.
С `?notify=1` при проблем праща имейл до `FRESHNESS_ALERT_EMAIL` (или
`ADMIN_EMAIL`), ако SMTP е настроен — само обобщение.

| Проблем (`code`) | Кога | Тежест |
|---|---|---|
| `news_not_imported` | 0 внесени новини от общината за 7 дни | внимание |
| `news_not_published` | 0 публикувани новини за 7 дни | внимание |
| `news_waiting_approval` | внесена новина чака одобрение над 3 дни | внимание |
| `pharmacy_today_missing` | няма въведена дежурна аптека за днес | **спешно** |
| `scams_stale` | предупрежденията за измами не са пипани 90 дни | внимание |
| `outages_stale` | прекъсванията на ток/вода не са пипани 30 дни | внимание |
| `services_unverified` | номер в „Услуги“ без проверка или по-стара от 6 месеца | внимание |

Праговете са в `src/lib/freshness-core.ts` (`FRESHNESS_THRESHOLDS`).

### 9.4. RSS

Публикуваните новини (последните 30) са на `/novini/rss.xml` (RSS 2.0); на
`/novini` има видима връзка „Абонирай се (RSS)“. Връзките в канала носят
`?s=rss` — статистиката брои идванията от RSS без да знае кой е.
