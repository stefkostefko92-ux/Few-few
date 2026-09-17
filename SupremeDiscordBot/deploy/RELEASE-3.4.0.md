# Release 3.4.0 — деплой runbook

Канонично: ZIP на `main` → `/root` → `autodeploy.sh`. Този документ покрива
**какво носи 3.4.0** и какво да направиш **преди** и **след** деплоя. Пълният
списък е в `CHANGELOG.md` → `[3.4.0]`; съответствието с Discord —
`docs/DISCORD_COMPLIANCE.md`.

**Същност:** втори фактор (TOTP) **задължителен за staff** преди админ
конзолата + step-up за разрушителни действия; пет нови админ таба (System,
Security, Billing, Fleet, Compliance/DSR); `/privacy` команда в Discord за
изтриване на данни от всеки потребител; AI отговорите fail-closed по Discord
Developer Policy §21. Миграция **v49** (адитивна).

## 0. ВНИМАНИЕ — първият вход в админ конзолата след деплоя

След деплоя **ти самият** няма да можеш да отвориш `/dashboard/admin`, докато
не запишеш TOTP: таблото те праща на **Сигурност на акаунта** (`/dashboard/
security?enroll=1`) → сканираш QR с Google Authenticator/Authy/1Password/Aegis
→ въвеждаш 6-цифрен код → **запазваш 10-те резервни кода** (показват се само
веднъж). Това е нарочно: без втори фактор staff акаунтът е ключ за всеки
сървър. Ако изгубиш телефона и кодовете — единственият път е ръчно в базата:
```sql
UPDATE users SET "mfaSecret"=NULL, "mfaEnabledAt"=NULL, "mfaBackupCodes"=NULL, "mfaLastUsedStep"=NULL WHERE id='<твоят Discord id>';
```

## 1. Env промени (на сървъра, преди autodeploy)

```bash
# backend/.env
# AI отговори: Discord Developer Policy §21 забранява съдържание от Discord да
# храни обучение на модели. Безплатният Gemini tier ГО ПРАВИ. Остави false
# (AI отговорите спират), докато не минеш на платен tier без обучение.
AI_REPLY_TRAINING_ATTESTED=false
# MFA_ENFORCE_STAFF=true   # подразбиране; не го пипай в продукция
# По избор: ADMIN_IP_ALLOWLIST="<твоят статичен IP>"  (само ако имаш статичен IP — иначе се заключваш)
# SECURITY_ALERTS_DM=true  # подразбиране: DM до теб при блокировки/MFA промени/отказан IP/пълно изтриване
# VERIFICATION_ATTEMPT_RETENTION_DAYS=90
```

Ръчен бекъп както винаги:
```bash
docker compose -f /opt/few-few/current/SupremeDiscordBot/docker-compose.yml \
  exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip \
  > /var/backups/supreme-manual-$(date +%F-%H%M).sql.gz
ls -la /var/backups/supreme-manual-*.gz   # ненулев размер!
```

## 2. Деплой (каноничният поток)

```bash
cd /root
rm -rf Few-few-main Few-few.zip
curl -fsSL -o Few-few.zip https://github.com/stefkostefko92-ux/Few-few/archive/refs/heads/main.zip
unzip -q -o Few-few.zip
SRC="$(ls -d /root/[Ff]ew-few-main | head -1)"
sudo ARCHIVE=/root/Few-few.zip PROJECTS="SupremeDiscordBot" bash "$SRC/deploy/autodeploy.sh"
```

### Миграции в този релийз

- **v49 `user_mfa`** — адитивна: `users.mfaSecret`, `mfaEnabledAt`,
  `mfaBackupCodes`, `mfaLastUsedStep` (всички nullable). Rollback на кода без
  връщане на базата е безопасен.
- Ботът регистрира новата slash команда `/privacy` при старт (`events/ready.js`
  сравнява SHA-256 на дефинициите с `/tmp/supreme-bot-commands.hash` и прави PUT
  само при промяна; в контейнер файлът пада при пресъздаване → един PUT на старт,
  безвредно) — Discord я показва до ~1 час глобално. Ръчно: `npm run deploy-commands`.
- Транскриптите на тикетите вече се пишат шифрирани; старите се четат както са и
  се шифрират при следващ запис (затваряне/регенерация). Нищо за миграция.

## 3. След деплоя (проверки, 10 мин)

```bash
cd /opt/few-few/current/SupremeDiscordBot && docker compose ps      # петте healthy
docker compose logs --tail=80 backend | grep -iE "v49|AI_REPLY_TRAINING|error"
# очаквано при AI_REPLY_TRAINING_ATTESTED=false и зададен GEMINI_API_KEY:
# „❌ … AI отговорите са ИЗКЛЮЧЕНИ (Discord Developer Policy §21 …)" — това е ПРАВИЛНО
curl -s -o /dev/null -w "%{http_code}\n" https://supremebot.carbonstealth.eu/api/admin/system   # 401 нелогнат
```

В таблото (`Ctrl+Shift+R`):
1. Влез → иконата с ключ в лентата (Сигурност на акаунта) или `/dashboard/admin`
   → пренасочва към записване → QR → код → **запази резервните кодове**.
2. `/dashboard/admin` → въведи код → табове **System** (всичко зелено; AI
   replies = BLOCKED, докато не удостовериш), **Security** (ти си с MFA;
   0 blocks), **Billing** (Discord магазинът configured), **Fleet**,
   **Compliance** (търси свой Discord ID → бройки).
3. Опитай разрушително действие след >10 мин → модал за свеж код → повтори.

В Discord (тестов сървър): `/privacy info` → бройки; `/privacy delete` →
бутон → потвърди с тестов акаунт (не с твоя owner акаунт — staff се отказва).

## 4. Developer Portal — ръчни задачи по съответствието

- App → General Information: **Privacy Policy URL** `https://supremebot.carbonstealth.eu/privacy`,
  **Terms of Service URL** `https://supremebot.carbonstealth.eu/terms` (Developer Terms §5(a)).
- Team с 2FA на всички членове; приложението верифицирано (виж `docs/DISCORD_MONETIZATION.md`).
- Gemini: платен tier без обучение → чак тогава `AI_REPLY_TRAINING_ATTESTED=true` и рестарт.
- VPS: потвърди шифриран том за Postgres (Developer Terms §5(c)(i)).

## 5. Rollback план

`current` сочи новия релийз едва след успешен health + smoke. При проблем:
върни симлинка към предишния релийз + `docker compose up -d`. v49 е адитивна.
Внимание: 3.3.0 няма MFA — при откат админ конзолата отново е само с Discord
OAuth; върни се на 3.4.0 възможно най-бързо.

## 6. Деплоят падна с „[1/4] Missing: backend/.env, bot/.env, frontend/.env, .env"

**Какво се е случило (реален инцидент, 17.09.2026).** `autodeploy.sh` пренасяше
четирите `.env` файла само от `/opt/few-few/current/SupremeDiscordBot/`. Но
`current` е общ за всички продукти и се мести при всеки успешен деплой на който
и да е от тях (напр. `PROJECTS="adblock"`) → сочи release, в който Supreme
никога не е разгръщан → carry-over не намира нищо → `deploy.sh` пада на стъпка
[1/4]. **Нищо не е повредено:** `current` не е преместен, старата версия работи,
миграции НЕ са пускани (провалът е преди `docker compose up`), pre-deploy дъмпът
е направен. Подканата „`cp .env.example .env`" е за нов сървър — на продукция
**не я следвай**: тайните съществуват, само не са в новия release.

От тази поправка нататък скриптът търси файловете `current` →
`/opt/few-few/shared/SupremeDiscordBot/` → най-новият release, който ги има, и
огледава каноничното копие в `shared/` при всеки пробег (700/600).

### 6.1 Диагностика (само чете; не печата тайни)

```bash
readlink -f /opt/few-few/current
ls -1dt /opt/few-few/releases/*/
find /opt/few-few/releases /opt/few-few/shared -maxdepth 5 -name .env -path '*SupremeDiscordBot*' 2>/dev/null | sort
# откъде е пуснат работещият стек за последно (там са били файловете при последния успешен деплой):
docker inspect supremebot_backend --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

### 6.2 Файловете СА в някой release → сложи ги на стабилния път

```bash
S=/opt/few-few/shared/SupremeDiscordBot
SRC_ENV=/opt/few-few/releases/<TS>/Few-few-main/SupremeDiscordBot   # папката от 6.1, която има и четирите
install -d -m 700 "$S" "$S/backend" "$S/bot" "$S/frontend"
for f in .env backend/.env bot/.env frontend/.env; do cp -a "$SRC_ENV/$f" "$S/$f" && chmod 600 "$S/$f"; done
ls -la "$S" "$S/backend" "$S/bot" "$S/frontend"
```

### 6.3 Файловете ги НЯМА никъде → възстанови ги от работещите контейнери

Контейнерите носят целия си env (`env_file` + `environment:`), значи тайните
не са изгубени, докато стекът върви. **Не спирай контейнерите преди това.**

```bash
S=/opt/few-few/shared/SupremeDiscordBot
umask 077; install -d -m 700 "$S" "$S/backend" "$S/bot" "$S/frontend"
cenv() { docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -vE '^(PATH|NODE_VERSION|YARN_VERSION)='; }
cenv supremebot_backend > "$S/backend/.env"
cenv supremebot_bot     > "$S/bot/.env"
{ cenv supremebot_postgres | grep -E '^POSTGRES_(DB|USER|PASSWORD)='; cenv supremebot_redis | grep -E '^REDIS_PASSWORD='; } > "$S/.env"
wc -l "$S/.env" "$S/backend/.env" "$S/bot/.env"     # и трите ненулеви
```

`frontend/.env` няма тайни (build-time `VITE_*`) и не е в контейнер — вземи
шаблона и попълни реалните стойности (публични: ID на приложението =
`DISCORD_CLIENT_ID` от `backend/.env`, име на фирмата, имейл и покана за
поддръжка — същите, които се виждат на `/terms` на живия сайт):

```bash
cp /opt/few-few/releases/<TS>/Few-few-main/SupremeDiscordBot/frontend/.env.example "$S/frontend/.env"
chmod 600 "$S/frontend/.env"; nano "$S/frontend/.env"
```

Стойност с интервал или `#` вътре трябва да е в кавички в `.env` — провери
с `grep -nE '=[^"].*[ #]' "$S/backend/.env" "$S/bot/.env"` (очаквано: нищо).

### 6.4 Новите променливи на 3.4.0 (само ако липсват)

```bash
grep -q '^AI_REPLY_TRAINING_ATTESTED=' "$S/backend/.env" || printf '\nAI_REPLY_TRAINING_ATTESTED=false\n' >> "$S/backend/.env"
```

### 6.5 Деплой

С **поправения** `autodeploy.sh` (свеж ZIP на `main` след сливането) —
каноничният поток от §2 без промяна: скриптът сам намира `shared/`.

Със **стария** скрипт, който вече е на сървъра (без да чакаш сливане): сложи
файловете в разопакования release и разгърни него, без нов архив:

```bash
NEW=/opt/few-few/releases/20260917-194142/Few-few-main/SupremeDiscordBot
for f in .env backend/.env bot/.env frontend/.env; do cp -a "$S/$f" "$NEW/$f" && chmod 600 "$NEW/$f"; done
sudo RELEASE_DIR=/opt/few-few/releases/20260917-194142 PROJECTS="SupremeDiscordBot" \
  bash /opt/few-few/releases/20260917-194142/Few-few-main/deploy/autodeploy.sh
```

После — §3 (проверки) без промяна.
