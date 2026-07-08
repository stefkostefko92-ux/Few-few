# Vizitka — деплой (systemd + reverse proxy, като medqr)

Еднократна подготовка на сървъра; след нея всеки деплой минава автоматично през
`deploy/autodeploy.sh` от корена на репото (ръчно качен архив в `/root`).

## 1. Системен потребител и директории

```bash
useradd --system --home /opt/vizitka --shell /usr/sbin/nologin vizitka
mkdir -p /opt/vizitka/data /etc/vizitka
chown -R vizitka:vizitka /opt/vizitka
```

## 2. Конфигурация (тайните живеят само на сървъра)

```bash
cat > /etc/vizitka/vizitka.env <<'EOF'
NODE_ENV=production
PORT=3100
PUBLIC_BASE_URL=https://vizitka-bg.com
ADMIN_EMAILS=stefan.kostadinov16@gmail.com
MASTILKO_URL=https://mastilko-bg.com
PRINT_API_SECRET=<32-байтов hex; node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
INDEXNOW_KEY=<32-знаков hex; node -e "console.log(require('crypto').randomBytes(16).toString('hex'))">
EOF
chmod 600 /etc/vizitka/vizitka.env
chown vizitka:vizitka /etc/vizitka/vizitka.env
```

> `PRINT_API_SECRET` е задължителна в продукция (подписва печатния handoff към mastilko).
> `INDEXNOW_KEY` включва авто-подаването към Bing; сервира се на `/<key>.txt`. След пускане
> подай sitemap-а веднъж в Google Search Console и Bing Webmaster Tools.

## 3. systemd + nginx + TLS

```bash
cp deploy/systemd/vizitka.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable vizitka

cp deploy/nginx/vizitka.conf /etc/nginx/sites-available/vizitka.conf
ln -s ../sites-available/vizitka.conf /etc/nginx/sites-enabled/
certbot certonly --nginx -d vizitka-bg.com
nginx -t && systemctl reload nginx
```

## 4. Всеки следващ деплой

От корена на разопакования архив (виж `deploy/README.md`):

```bash
sudo PROJECTS="vizitka" bash deploy/autodeploy.sh   # само vizitka
# или без PROJECTS — деплойва всички конфигурирани проекти
```

Скриптът прави: rsync на кода (без `data/`, `node_modules/`, `.env`) →
`npm ci --omit=dev` → снимка на SQLite базата → `systemctl restart vizitka` →
health check на `http://127.0.0.1:3100/` с автоматичен rollback при провал.

## Бекъп

`data/` (SQLite базата + качените снимки) е единствената state директория:

```bash
sudo -u vizitka sqlite3 /opt/vizitka/data/vizitka.db ".backup '/opt/vizitka/data/backup-$(date +%F).db'"
tar -czf /root/vizitka-data-$(date +%F).tar.gz -C /opt/vizitka data
```
