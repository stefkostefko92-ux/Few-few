# Release 3.2.0 — деплой runbook

Канонично: ZIP на `main` → `/root` → `autodeploy.sh`. Този документ покрива
**какво носи 3.2.0 спрямо продукцията от 12.08.2026** (релийз
`20260812-191314`, `main@6825d0f`) и какво да провериш след деплоя.

Влизат четири сливания: **#166** (agency приходите във финансовия регистър,
миграция v47), **#215** (одит по сигурност), **#220** (одит на одита + кръг 2).
Пълният списък е в `CHANGELOG.md` → `[3.2.0]`.

## 0. Преди деплоя (2 мин, на сървъра)

```bash
# 0.1 Ръчен бекъп — задължителен по deploy дисциплината, независимо че
#     autodeploy прави свой fail-closed pg_dump преди миграцията.
docker compose -f /opt/few-few/current/SupremeDiscordBot/docker-compose.yml \
  exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip \
  > /var/backups/supreme-manual-$(date +%F-%H%M).sql.gz
ls -la /var/backups/supreme-manual-*.gz   # ненулев размер!

# 0.2 Дневният шифрован бекъп трябва да е активен (от 3.1.0)
systemctl is-active supreme-backup.timer
```

## 1. Env промени

**Нищо ново задължително.** Две поправки в имената, които засягат само ако
ползваш съответната функция:

```bash
# backend/.env — САМО ако продаваш през Discord монетизацията.
# `DISCORD_SKU_AGENCY` НЕ съществува и никога не се е четяло (одит етап 13);
# кодът чете тези две:
# DISCORD_SKU_AGENCY5=...
# DISCORD_SKU_AGENCY10=...

# REDIS_URL — вече „силно препоръчан", не по избор: броячите срещу налучкване
# и рейт лимитите живеят в Redis (преживяват рестарт, делят се между
# процеси). В продукцията е зададен от 12.08 („Redis connected" в лога).
```

`DASHBOARD_URL` / `SUPPORT_URL` / `STATUS_URL` се четат от **бота**
(`bot/.env`), не от backend — ако са били в грешния файл, премести ги.

## 2. Деплой (каноничният поток)

```bash
cd /root
rm -rf Few-few-main Few-few.zip
curl -fsSL -o Few-few.zip https://github.com/stefkostefko92-ux/Few-few/archive/refs/heads/main.zip
unzip -q -o Few-few.zip
```

```bash
# Папката от GitHub ZIP е с ГЛАВНО F — открива се сама, за да не се пише на ръка.
SRC="$(ls -d /root/[Ff]ew-few-main | head -1)"
sudo ARCHIVE=/root/Few-few.zip PROJECTS="SupremeDiscordBot" bash "$SRC/deploy/autodeploy.sh"
```

Какво прави сам: пренася `.env` файловете, прави pre-deploy dump
(fail-closed), билдва, `backend/docker-entrypoint.sh` пуска
`prisma migrate deploy` + `migrate diff`, health на `127.0.0.1:8080`, smoke
(9 проверки), IndexNow към търсачките, `current →` чак след успех, откат при
провал.

### Миграции в този релийз

Само **v47** е нова спрямо продукцията (v33–v46 са живи от 12.08):

- **v47 `payment_log_agency`** — адитивна: `payment_logs.serverId` става
  nullable (всички налични редове имат стойност), добавя се nullable
  `agencyId` + индекс + FK към `agencies`. Нищо не се губи; старият код работи
  срещу новата схема.

### Първи деплой с втвърдени контейнери

3.2.0 е първият релийз с `no-new-privileges` + `cap_drop: ALL` на `backend`,
`bot` и `frontend` (не на postgres/redis — техните entrypoint-и свалят права
сами). Проверено по инспекция, не с изпълнение (няма Docker демон в средата за
разработка). Ако някой от трите не стигне `healthy`, autodeploy прави откат
сам, а **това е първото място за гледане**: `docker compose logs <услуга>`.

## 3. След деплоя (проверки, 5 мин)

```bash
cd /opt/few-few/current/SupremeDiscordBot && docker compose ps
# и петте: healthy (frontend стига healthy ~45 s след старта: start_period 15 s + interval 30 s)

curl -s https://supremebot.carbonstealth.eu/api/health
# {"status":"ok","database":"up"}  — БЕЗ uptime (маха се в 3.2.0, публичен маршрут)

curl -sI https://supremebot.carbonstealth.eu/api/status | grep -iE "referrer-policy|strict-transport|x-content-type|permissions-policy|x-frame"
# шестте заглавия за сигурност и върху /api (етап 12)

docker compose logs --tail=50 backend | grep -iE "redis|migrat|error"
# „Redis connected" · v47 приложена · нула error
```

В таблото (`Ctrl+Shift+R` — старият JS остава в кеша):

- **Настройки → Server Activity Logging** — падащ списък за канала на всяка
  категория (не текстово поле).
- **Webhooks → Редактирай** — полето за secret е празно с подсказка „зададен —
  оставете празно, за да го запазите" и отметка „Премахни"; тайната **не се
  показва** повече. Промяна на името не я трие.
- **Настройки → Sticky roles** — изключено по подразбиране; пусни го първо на
  тестов сървър (напуснал модератор иначе си връща ролите сам).
- **Началната страница, най-долу** — ред с ръководствата на 8 локала.

Ако ползваш webhook-и с подпис: проверяващият код от твоята страна трябва да
чете хедъра **`X-SupremeBot-Signature`** (подсказката в таблото казваше
`X-Supreme-Bot-Signature` — грешно; кодът винаги е пращал първото).

## 4. Rollback план

`current` сочи новия релийз едва след успешен health + smoke. При проблем след
това: върни симлинка към предишния релийз + `docker compose up -d`. **v47 е
адитивна** (nullable колона, отпуснат NOT NULL) — старият код работи срещу
новата схема, значи rollback на кода **без** възстановяване на базата е
безопасен. Пълен DB restore само при реална повреда: `deploy/BACKUP.md`.

Заварените webhook тайни в открит текст продължават да работят и след откат
(`decryptSafe` ги пуска непроменени; пре-шифроват се при следваща промяна) —
няма еднопосочна миграция на данни в този релийз.

## 5. Известно и съзнателно неправено

- **CI на акаунта беше мъртъв** от 02.09 (`runner_id: 0`, нула стъпки, 1–3 s,
  и на `main`, и на чужди клонове; репото е публично, Actions беше
  `operational`). Релийзът е проверен **локално** с пълния гейт на трите
  пакета, mobile-proof в реален Chromium и 20+ мутации. Причината се вижда в
  жълтата лента на който и да е паднал джоб в UI.
- Dependabot мажорите (React 19, Zod 4, Prisma 7, Express 5, Tailwind 4,
  vitest 4, ioredis 6) — решение на собственика, не са в този релийз.
- Изтриването по чл. 17 остава анонимизация (документирано); ретенцията на
  Discord ID в cooldown/vote/entry таблиците е решение за правния преглед.
