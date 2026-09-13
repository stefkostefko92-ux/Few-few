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
- Ботът регистрира новата slash команда `/privacy` при старт (както всяка нова
  команда) — Discord я показва до ~1 час глобално.

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
