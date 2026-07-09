# Vizitka — деплой (systemd + reverse proxy, като medqr)

Еднократна подготовка на сървъра; след нея всеки деплой минава автоматично през
`deploy/autodeploy.sh` от корена на репото (ръчно качен архив в `/root`).

Приложението слуша само на `127.0.0.1:3100`; TLS и публичният вход са през nginx.

## 0. Бърз път — еднократен bootstrap (препоръчано)

Скриптът `deploy/server-setup.sh` прави наведнъж стъпки 1–4 по-долу: системен
потребител + директории, `vizitka.env` с **генерирани тайни** (`PRINT_API_SECRET`,
`INDEXNOW_KEY`), systemd unit, nginx vhost, TLS през certbot и криптиран бекъп cron.
Идемпотентен е — повторно пускане не презаписва вече генерираните тайни.

```bash
# от корена на разопакования архив, като root:
sudo bash vizitka/deploy/server-setup.sh
# пита за домейн/админ/SMTP (с default-и); за бекъпа задай публичен age ключ:
#   sudo AGE_RECIPIENT=age1... bash vizitka/deploy/server-setup.sh
```

После качи кода: `sudo PROJECTS="vizitka" bash deploy/autodeploy.sh` (стъпка 5).
Ръчните стъпки 1–6 остават като референция / за фина настройка.

> Скриптът пренаписва целия `vizitka.env` при всяко пускане, но **запазва** вече
> генерираните тайни (`PRINT_API_SECRET`, `INDEXNOW_KEY`), SMTP блока и портфейл
> редовете. Ако си добавил **ръчно друг** ключ в env-а, добави го отново след re-run
> (или го дръж в отделен systemd drop-in), за да не се загуби.

## 1. Системен потребител и директории

```bash
useradd --system --home /opt/vizitka --shell /usr/sbin/nologin vizitka
mkdir -p /opt/vizitka/data /etc/vizitka
chown -R vizitka:vizitka /opt/vizitka
```

`data/` пази SQLite базата (`vizitka.db` + WAL) и качените снимки
(`data/uploads/` — профилни, корици, банери). Приложението създава `uploads/`
само́ при старт; `data/` НЕ се трие при деплой (rsync exclude).

## 2. Конфигурация (тайните живеят само на сървъра, mode 600)

```bash
cat > /etc/vizitka/vizitka.env <<'EOF'
NODE_ENV=production
PORT=3100
PUBLIC_BASE_URL=https://vizitka-bg.com
ADMIN_EMAILS=stefan.kostadinov16@gmail.com
MASTILKO_URL=https://mastilko-bg.com

# Задължителна в продукция — подписва печатния handoff токен към Мастилко.
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PRINT_API_SECRET=<32-байтов hex>

# По желание — авто-подаване към Bing/IndexNow; сервира се на /<key>.txt.
# node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
INDEXNOW_KEY=<32-знаков hex>

# SMTP за „забравена парола". Без SMTP_HOST писмата само се логват (dev) —
# в продукция задай реален подател, за да работи нулирането на паролата.
MAIL_FROM=Vizitka <no-reply@vizitka-bg.com>
SMTP_HOST=smtp.example.eu
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp потребител>
SMTP_PASS=<smtp парола>
EOF
chmod 600 /etc/vizitka/vizitka.env
chown vizitka:vizitka /etc/vizitka/vizitka.env
```

> `PRINT_API_SECRET` е **задължителна** в продукция (без нея печатният handoff
> се проваля). `INDEXNOW_KEY` включва авто-подаването към Bing; сервира се на
> `/<key>.txt`. Google така или иначе чете `sitemap.xml`.

## 3. systemd + nginx + TLS

```bash
cp deploy/systemd/vizitka.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable vizitka

cp deploy/nginx/vizitka.conf /etc/nginx/sites-available/vizitka.conf
ln -s ../sites-available/vizitka.conf /etc/nginx/sites-enabled/
certbot certonly --nginx -d vizitka-bg.com
nginx -t && systemctl reload nginx
```

`client_max_body_size` в nginx е `4m` (банерите са до 3 MB + multipart резерв).
HSTS/CSP ги задава самото приложение — не ги дублирай в nginx. Certbot подновява
сертификата автоматично (systemd timer `certbot.timer`).

Първо пускане: `systemctl start vizitka && curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/`
трябва да върне `200`.

## 4. Бекъп (SQLite базата + качените снимки)

`data/` е единствената state директория. Скриптът прави консистентно `.backup`
на базата + `tar` на `uploads/`, криптира с **age** (публичен ключ на сървъра,
частният — при собственика) и пази 30 дни.

```bash
# Генерирай age двойка НА СИГУРНА МАШИНА (не на сървъра) и качи само публичния ключ:
#   age-keygen -o vizitka-backup.key   # public: age1...  →  дай го на AGE_RECIPIENT
# Крон, дневно в 3:25:
cat > /etc/cron.d/vizitka-backup <<'EOF'
25 3 * * * vizitka AGE_RECIPIENT=age1xxxxxxxx /opt/vizitka/deploy/backup.sh >> /var/log/vizitka-backup.log 2>&1
EOF
install -o vizitka -g vizitka -m 640 /dev/null /var/log/vizitka-backup.log
cp deploy/logrotate/vizitka-backup /etc/logrotate.d/vizitka-backup
```

Възстановяване (с частния ключ): `age -d -i vizitka-backup.key vizitka-*.tar.gz.age | tar -xz`.
Бекъп без тестван restore не е бекъп — провери поне веднъж.

## 5. Всеки следващ деплой

От корена на разопакования архив (виж `deploy/README.md`):

```bash
sudo PROJECTS="vizitka" bash deploy/autodeploy.sh   # само vizitka
# или без PROJECTS — деплойва всички конфигурирани проекти
```

Скриптът прави: rsync на кода (без `data/`, `node_modules/`, `.env`) →
`npm ci --omit=dev` → снимка на SQLite базата → `systemctl restart vizitka` →
health check на `http://127.0.0.1:3100/` с автоматичен rollback при провал.

## 6. Следпускови стъпки (SEO индексиране)

След като домейнът е жив на HTTPS:

1. **Google Search Console** (https://search.google.com/search-console) — добави
   ресурса `https://vizitka-bg.com`, потвърди собствеността (DNS TXT или HTML
   таг/файл), после **Sitemaps → подай** `https://vizitka-bg.com/sitemap.xml`.
2. **Bing Webmaster Tools** (https://www.bing.com/webmasters) — добави сайта
   (може импорт от Search Console), подай същия `sitemap.xml`. `INDEXNOW_KEY`
   уведомява Bing автоматично при промяна на визитка.
3. Провери `https://vizitka-bg.com/robots.txt` и `/sitemap.xml`, че се сервират
   и сочат правилния публичен домейн.

## 7. Портфейли (Apple Wallet + Google Wallet)

Всеки потребител може да добави визитката в телефонния портфейл; картата носи QR
към живия профил, а при редакция се обновява автоматично (Apple през APNs, Google
през API PATCH). И двете се активират само когато тайните са налични — иначе
бутоните са скрити. Тайните са **файлове с права 600**, извън репото.

**Apple Wallet** (изисква Apple Developer акаунт ~$99/год):

1. В Apple Developer → Identifiers създай **Pass Type ID** (напр.
   `pass.eu.carbonstealth.vizitka`), издай Pass signing сертификат и го експортирай.
2. Извади PEM-ите и свали **WWDR** междинния сертификат:
   ```bash
   mkdir -p /etc/vizitka/apple && chmod 700 /etc/vizitka/apple
   # от изтегления pass.p12 (флагът -legacy е нужен на Ubuntu 24.04 / OpenSSL 3.x за
   # .p12, експортиран от macOS Keychain — иначе „unsupported"):
   openssl pkcs12 -legacy -in pass.p12 -clcerts -nokeys -out /etc/vizitka/apple/signerCert.pem
   openssl pkcs12 -legacy -in pass.p12 -nocerts -out /etc/vizitka/apple/signerKey.pem   # задай парола → APPLE_PASS_KEY_PASSPHRASE
   # WWDR (Apple Worldwide Developer Relations) — трябва да съответства на издателя на
   # твоя Pass сертификат (при несъответствие пасът е невалиден мълчаливо):
   curl -s https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer | openssl x509 -inform DER -out /etc/vizitka/apple/wwdr.pem
   chown -R vizitka:vizitka /etc/vizitka/apple && chmod 600 /etc/vizitka/apple/*
   ```
3. Задай `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID`, `APPLE_PASS_CERT`, `APPLE_PASS_KEY`,
   `APPLE_PASS_KEY_PASSPHRASE`, `APPLE_WWDR_CERT` в `vizitka.env`.
4. Auto-update (по желание): в Developer → Keys създай APNs **Auth Key** (.p8), сложи
   го в `/etc/vizitka/apple/AuthKey.p8` и задай `APPLE_APNS_KEY` + `APPLE_APNS_KEY_ID`.

> Подписването ползва системния `openssl` (наличен на Ubuntu). Без APNs картата пак
> работи и стои актуална чрез QR-а към живия профил — просто полетата в самия пас не
> се пушат при промяна.

**Google Wallet** (безплатно):

1. Google Cloud → нов проект → включи **Google Wallet API**. Регистрирай се като
   издател в [Google Wallet Console](https://pay.google.com/business/console) и вземи
   **Issuer ID**.
2. Създай **service account** с роля Wallet Object Issuer, свали JSON ключа:
   ```bash
   mkdir -p /etc/vizitka/google && chmod 700 /etc/vizitka/google
   mv service-account.json /etc/vizitka/google/service-account.json
   chown -R vizitka:vizitka /etc/vizitka/google && chmod 600 /etc/vizitka/google/*.json
   ```
3. Задай `GOOGLE_WALLET_ISSUER_ID` и `GOOGLE_WALLET_SA_KEY` в `vizitka.env`.
   Класът `<issuerId>.vizitka_generic` се създава автоматично при първото запазване.

След `systemctl restart vizitka` бутоните „Добави в Apple Wallet" / „Запази в Google
Wallet" се появяват на публичните визитки.
