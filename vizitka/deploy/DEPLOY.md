# Vizitka — деплой (systemd + reverse proxy, като medqr)

Еднократна подготовка на сървъра; след нея всеки деплой минава автоматично през
`deploy/autodeploy.sh` от корена на репото (ръчно качен архив в `/root`).

Приложението слуша само на `127.0.0.1:3100`; TLS и публичният вход са през nginx.

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
