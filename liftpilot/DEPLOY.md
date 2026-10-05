# Деплой — LiftPilot (liftpilot.carbonstealth.eu)

Docker Compose (приложение + PostgreSQL 16) зад nginx на хоста с Let's Encrypt. Цялата сървърна
логика е в `deploy/deploy.sh` (идемпотентен); `deploy/autodeploy.sh` на монорепото го вика, когато
`PROJECTS` съдържа `liftpilot` (по подразбиране — да). Тайните са само на сървъра:
`/opt/few-few/shared/liftpilot/.env` (600).

## Първи деплой (веднъж)

1. **DNS:** A запис `liftpilot.carbonstealth.eu` → IP на VPS-а. Без него приложението тръгва, но само
   на `127.0.0.1:4330`; сертификатът се издава при следващото пускане.
2. **Портът:** `4330` по подразбиране. Провери с `ss -tlnp | grep 4330`; ако е зает, създай
   `/opt/few-few/shared/liftpilot/.env` от `.env.example` с друг `APP_PORT` преди деплоя
   (скриптът и сам спира с ясна грешка, ако портът е зает при първия старт). До кръг 26 портът беше
   `4320`, който сега е на rendetto: на сървър, където LiftPilot вече върви, смени `APP_PORT=4320` на
   `4330` в `.env` и пусни деплоя наново (vhost-ът се пише с порта от `.env`) — преди деплоя на rendetto.
3. **Поща (Brevo):** SMTP login и SMTP ключ от Brevo (SMTP & API → SMTP); подателят
   (`MAIL_FROM`, по подразбиране `LiftPilot <noreply@carbonstealth.eu>`) трябва да е потвърден в Brevo
   (домейнът със SPF и DKIM). Изпраща се през `smtp-relay.brevo.com:2525` със STARTTLS (VPS-ът блокира
   25/465/587). Без тези данни регистрацията и забравената парола стоят затворени (страниците го
   казват), всичко друго работи.
4. **Деплой** в root shell (`sudo -i`; `sudo bash …` губи променливите). Паролите се въвеждат скрито и
   не остават в историята на shell-а. Блокът в `{ … }` се поставя наведнъж: shell-ът го прочита целия,
   преди да зададе първия въпрос, затова следващ ред не попада в поле за парола. От `main`; клон, таг
   или комит — `REF=<…>` пред `PROJECTS`:
   ```bash
   curl -fsSL https://codeload.github.com/stefkostefko92-ux/Few-few/tar.gz/main \
     | tar -xz -C /root --strip-components=1 --wildcards '*/deploy/fetch-deploy.sh'
   {
     read -rsp 'Парола на admin@carbonstealth.eu: ' LIFTPILOT_ADMIN_PASSWORD; echo
     read -rp  'Brevo SMTP login: ' LIFTPILOT_SMTP_USER
     read -rsp 'Brevo SMTP ключ: ' LIFTPILOT_SMTP_PASS; echo
     export LIFTPILOT_ADMIN_PASSWORD LIFTPILOT_SMTP_USER LIFTPILOT_SMTP_PASS
     PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh
     unset LIFTPILOT_ADMIN_PASSWORD LIFTPILOT_SMTP_USER LIFTPILOT_SMTP_PASS
   }
   ```
   Без `LIFTPILOT_ADMIN_PASSWORD` се генерира случайна парола и се отпечатва веднъж. Администраторът
   се създава при първия старт; щом приложението е здраво, `ADMIN_PASSWORD` се изпразва в `.env`.
   Парола под правилото на приложението (12 знака с букви и цифри) работи само за първия вход: веднага
   иска нова.
5. **Вход:** `https://liftpilot.carbonstealth.eu/it/login` с `admin@carbonstealth.eu`.
6. **Фирми:** всяка фирма се регистрира сама (`/it/register`, потвърждение с линк по имейл и паролата
   ѝ); администраторът на платформата може и да създаде фирма с титуляра ѝ („Aziende“), с временна
   парола, показана веднъж.

## Всеки следващ деплой

`PROJECTS="liftpilot" bash /root/deploy/fetch-deploy.sh` — без въпросите (тайните вече са в `.env`). Скриптът: пренася `.env` → `pg_dump` в
`/opt/few-few/shared/liftpilot/backups/` (последните 5; без бекъп няма миграция) → `docker compose
build` + `up -d` → миграциите от entrypoint-а (`prisma migrate deploy`, никога `db push`) → health
`/api/health` с маркер `"app":"liftpilot"` → nginx vhost (`deploy/nginx/liftpilot.conf`) + certbot.
Смяна на ключа на Brevo: същата команда с новите `LIFTPILOT_SMTP_USER`/`LIFTPILOT_SMTP_PASS`.

## Проверка

```bash
curl -fsS http://127.0.0.1:4330/api/health          # {"status":"ok","app":"liftpilot",…,"db":"ok"}
curl -fsSI https://liftpilot.carbonstealth.eu/it | head -5
cd /opt/few-few/current/liftpilot && docker compose ps && docker compose logs --tail 50 app
```

## Връщане назад

- **Код:** `sudo RELEASE_DIR=<предишен release> PROJECTS="liftpilot" bash <release>/deploy/autodeploy.sh`.
- **База:** `gunzip -c /opt/few-few/shared/liftpilot/backups/pre-deploy-<TS>.sql.gz | docker compose exec -T db psql -U liftpilot liftpilot`
  (в празна база; миграциите са адитивни, затова обикновено стига връщане на кода).

## Публично пускане (след съгласуване и разрешения)

Докато не е одобрено, търсачките са спрени (`ALLOW_INDEXING=false`: `robots.txt` Disallow, `noindex`).
След одобрение: `ALLOW_INDEXING=true` в `.env` и деплой; за Google — Search Console (`tools/seo/gsc.mjs`).
IndexNow (Bing, Yandex, Seznam…) иска ключов файл, който сайтът публикува; LiftPilot още няма такъв —
добавя се заедно с одобрението (`node tools/seo/indexnow.mjs --gen-key`), после
`node tools/seo/indexnow.mjs https://liftpilot.carbonstealth.eu`.
