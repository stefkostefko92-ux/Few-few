# Разгръщане — Panev Ascensori

Продукцията върви като **systemd услуга `panev`** в `/opt/panev`, слуша **само на
`127.0.0.1:4102`** и е зад **nginx** с Let's Encrypt. Каноничният домейн е
**`https://panevascensori.it` — БЕЗ www**; `www.panevascensori.it` прави 301 насам
(така са `canonical`, `hreflang`, `sitemap.xml` и JSON-LD в генерирания сайт).

Моделът е същият като на `medqr/` и `vizitka/`: кодът се качва през каноничния
`deploy/autodeploy.sh` на монорепото, тайните и базата живеят на сървъра.

| | |
| --- | --- |
| Услуга | `panev.service` (`panev/deploy/systemd/panev.service`) |
| Потребител | `panev` (системен, `nologin`) |
| Директория | `/opt/panev` · записваема е само `/opt/panev/data` |
| Порт | `127.0.0.1:4102` |
| Тайни | `/etc/panev/panev.env` — mode **600**, `panev:panev`, systemd `EnvironmentFile` |
| База | `/opt/panev/data/panev.db` (SQLite) — **преживява деплой** |
| Health | `http://127.0.0.1:4102/api/health` |
| nginx | `panev/deploy/nginx/panev.conf` → `/etc/nginx/sites-available/panev.conf` |
| Бекъп | `/var/backups/panev/` — дневно 03:15 UTC (`scripts/backup.sh`) |

---

## 1. Еднократна подготовка на сървъра

Изисква DNS **A/AAAA записи за `panevascensori.it` И `www.panevascensori.it`**,
сочещи VPS-а (сертификатът трябва да покрива и двата — иначе `https://www.…`
гърми с cert-mismatch **преди** да стигне до 301 редиректа).

```bash
# от разопакования архив в /root
sudo bash /root/few-few-*/panev/scripts/bootstrap-vps.sh
```

Скриптът е идемпотентен и прави: пакети (Node 20, nginx, certbot, sqlite3, ufw) ·
системен потребител + директории · `/etc/panev/panev.env` с **генериран
`JWT_SECRET`** (пита за админ имейл и SMTP парола) · systemd unit · `ufw`
(22/80/443) · nginx vhost + `certbot certonly --webroot` за домейна и `www.` ·
renew hook, който презарежда nginx · дневен бекъп cron + logrotate.

Повторно пускане **не** презаписва вече генерираните тайни и не пипа базата.

## 2. Деплой на кода (при всяка нова версия)

Собственикът качва GitHub архива **ръчно** в `/root`, после:

```bash
cd /root && unzip -o Few-few.zip >/dev/null
sudo PROJECTS="panev" bash /root/few-few-*/deploy/autodeploy.sh   # само panev
# или без PROJECTS — разгръща всички проекти на тази машина
```

Какво прави `deploy_panev` (в `deploy/autodeploy.sh`):

1. създава потребителя `panev`, ако липсва; генерира `/etc/panev/panev.env` при
   пръв деплой (random `JWT_SECRET`, `SMTP_PASS=CHANGE_ME`);
2. бекъп на текущия `/opt/panev` → `/opt/panev.bak-<час>`;
3. `rsync -a --delete` **без** `data/`, `node_modules/`, `.env` → базата и тайните
   не могат да бъдат изтрити от деплоя;
4. `npm ci --omit=dev` като `panev`;
5. **само при липсваща база** — `node scripts/seed.js` (админ + каталог за `/admin`;
   ако `ADMIN_PASSWORD` не е зададена, паролата се показва **веднъж** в изхода);
6. снимка на базата (`sqlite3 .backup`) преди рестарт;
7. инсталира/обновява systemd unit-а, `systemctl restart panev`;
8. health check на `/api/health` (10 опита × 3 с);
9. **при провал** — връща и кода, и базата, рестартира и маркира деплоя като
   неуспешен (`autodeploy.sh` завършва с грешка).

nginx не се пипа при деплой: статиката се сервира от същите пътища, а
приложението е зад проксито.

## 3. Задължителни променливи в продукция

В `/etc/panev/panev.env` (шаблон и обяснения: `panev/.env.example`):

| Променлива | Защо е задължителна |
| --- | --- |
| `NODE_ENV=production` | prod режим: кеш заглавия, HSTS, строгата проверка на JWT |
| `PORT=4102` | портът в nginx конфига и в health check-а |
| `BASE_URL=https://panevascensori.it` | каноничен адрес, **без www** |
| `JWT_SECRET` (≥32 знака) | без него приложението **спира** при старт (`lib/auth.js`) |
| `SMTP_PASS` | без нея формата записва в базата, но **не праща имейл** |

`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `MAIL_FROM` / `MAIL_TO_ADMIN` имат
разумни стойности по подразбиране за Aruba; `secure` се извежда от порта
(465 → SMTPS). `SMTP_SECURE` **не се чете** от кода.

Смяна на SMTP паролата после:

```bash
sudo bash /opt/panev/scripts/setup-email.sh     # пише реда и рестартира услугата
```

## 4. nginx и TLS

`panev/deploy/nginx/panev.conf` съдържа:

- `:80` → ACME challenge + 301 към `https://panevascensori.it`;
- `:443` за `www.` → **301** към каноничния non-www;
- `:443` каноничен сайт: reverse proxy към `127.0.0.1:4102` с `Host`,
  `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`
  (приложението е с `trust proxy 1` — IP-то в rate limit-а и в одита е реалното);
- кеш: `/fonts/` **1 година immutable** (имената са с хеш), `/css/` и `/js/`
  7 дни + `must-revalidate` (`site.css`/`site.js` са **без** хеш — `immutable` би
  оставил върнал се посетител със стар код до година), `/img/` 30 дни, `/docs/`
  7 дни; **HTML не се кешира** (`no-cache, must-revalidate` — идва от самото
  приложение и nginx не го пипа);
- `/img/` минава през приложението нарочно — то прави прозрачна WebP преговорка
  (`Accept: image/webp` → `.webp` двойника, с `Vary: Accept`);
- `/admin` — `no-store` + `X-Robots-Tag: noindex, nofollow`.

Ръчно инсталиране (ако не ползваш bootstrap скрипта):

```bash
sudo cp panev/deploy/nginx/panev.conf /etc/nginx/sites-available/panev.conf
sudo ln -sf ../sites-available/panev.conf /etc/nginx/sites-enabled/panev.conf
sudo certbot certonly --webroot -w /var/www/html \
     -d panevascensori.it -d www.panevascensori.it
sudo nginx -t && sudo systemctl reload nginx
```

> Заглавията за сигурност (CSP, HSTS, `nosniff`, Referrer-Policy) ги задава
> приложението. **Не добавяй `add_header` на server ниво** — в nginx един
> `add_header` в `location` изтрива всички наследени, което тихо би махнало
> заглавията за този път.

Подновяването е автоматично (`certbot.timer`, 2× дневно) + deploy hook, който
презарежда nginx. Провери: `sudo certbot certificates`.

## 5. Проверки след деплой

```bash
systemctl status panev
journalctl -u panev -n 50 --no-pager
curl -s http://127.0.0.1:4102/api/health          # {"status":"ok",...}
curl -sI https://panevascensori.it/ | head -1     # 200
curl -sI https://www.panevascensori.it/ | head -3 # 301 → https://panevascensori.it/
curl -sI https://panevascensori.it/en/            # 200
curl -sI https://panevascensori.it/data/panev.db  # 404 (базата не се сервира)
```

След промяна по страници/`sitemap.xml` — подай към търсачките:

```bash
node tools/seo/indexnow.mjs https://panevascensori.it
```

(Google **не** поддържа IndexNow — там разчитаме на свеж `sitemap.xml` +
еднократна верификация в Search Console.)

## 6. Бекъп и възстановяване

Дневен бекъп: `scripts/backup.sh` през cron (03:15 UTC) → `/var/backups/panev/`,
`VACUUM INTO` + `PRAGMA integrity_check` + gzip; 30 дневни + 12 седмични копия.

**Бекъп без тестван restore не е бекъп.** Тествай поне веднъж:

```bash
sudo -u panev /opt/panev/scripts/backup.sh                  # ръчна снимка
zcat /var/backups/panev/panev-<дата>.db.gz > /tmp/test.db
sqlite3 /tmp/test.db "PRAGMA integrity_check; SELECT count(*) FROM messages;"
rm -f /tmp/test.db
```

Реално възстановяване (спира сайта за секунди — прави го съзнателно):

```bash
sudo systemctl stop panev
sudo -u panev cp /opt/panev/data/panev.db /opt/panev/data/panev.db.before-restore
zcat /var/backups/panev/panev-<дата>.db.gz | sudo -u panev tee /opt/panev/data/panev.db >/dev/null
sudo rm -f /opt/panev/data/panev.db-wal /opt/panev/data/panev.db-shm
sudo systemctl start panev && curl -s http://127.0.0.1:4102/api/health
```

## 7. Връщане назад (rollback)

`autodeploy.sh` връща автоматично при провален health check. Ръчно:

```bash
ls -1dt /opt/few-few/releases/*/           # предишните версии
sudo PROJECTS="panev" ARCHIVE=<стар архив> bash /opt/few-few/current/deploy/autodeploy.sh
# или директно от предишния release:
sudo rsync -a --delete --exclude data/ --exclude node_modules/ --exclude .env \
     /opt/few-few/releases/<по-стар>/panev/ /opt/panev/
sudo chown -R panev:panev /opt/panev && sudo chmod 755 /opt/panev
sudo -u panev bash -c 'cd /opt/panev && npm ci --omit=dev'
sudo systemctl restart panev
```

Снимките на базата отпреди рестарт са `/opt/panev/data/panev.db.pre-<час>`
(пазят се последните 5).

## 8. Диагностика

| Симптом | Къде да гледаш |
| --- | --- |
| Услугата не тръгва | `journalctl -u panev -n 80` — най-често липсващ/къс `JWT_SECRET` (процесът излиза с код 1) |
| `status=31/SYS`, `Result: core-dump`, умира за ~200 ms | seccomp е убил Node. Кой syscall: `dmesg -T \| grep -i 'comm="node"'` → `syscall=NNN`. Известен случай: **330 = `pkey_alloc`** (V8 ползва memory protection keys за JIT) — вече е върнат явно в `SystemCallFilter`. Ако номерът е друг, добави го на същия ред, вместо да махаш целия филтър |
| 502 от nginx | услугата е спряна или порт ≠ 4102: `systemctl status panev`, `ss -ltnp \| grep 4102` |
| Формата не праща имейл | `SMTP_PASS` липсва/грешна → `journalctl -u panev \| grep mailer`; запитването пак е в `/admin/messaggi.html` |
| „Не мога да пиша“ в лога | systemd sandbox: записваем е само `/opt/panev/data` (`ReadWritePaths`) |
| 403 на `/css/`, `/js/`, `/fonts/`, `/docs/` | nginx ги чете директно от диска — трябва `chmod 755 /opt/panev` и четими файлове (autodeploy го прави; `data/` остава 700) |
| Стар CSS/JS у клиента | кеш заглавията са 7 дни — виж §4; не слагай `immutable` на нехеширани файлове |
| Изтичащ сертификат | `sudo certbot certificates`, `systemctl status certbot.timer` |

## Какво **не** е автоматизирано (ръчни стъпки на собственика)

1. **DNS**: `A`/`AAAA` за `panevascensori.it` и `www.panevascensori.it` → IP-то на VPS-а.
2. Първо влизане в `https://panevascensori.it/admin/login.html` и **смяна на паролата**
   от първия сийд (показва се веднъж в изхода на autodeploy).
3. Попълване на **`SMTP_PASS`** (ако не е дадена при bootstrap) —
   `sudo bash /opt/panev/scripts/setup-email.sh`.
4. Еднократна верификация в **Google Search Console** + подаване на `sitemap.xml`
   (Google не поддържа IndexNow).
5. Тест на **restore** от бекъп (§6).

### IndexNow

Ключът живее в репото като `panev/d6e1a2e328c3fd92c84f47c85c1fb084.txt` (схемата
`<key>.txt` в корена на сайта, както при mastilko) и се качва с обикновения rsync
на autodeploy. Подаване след промяна по страници/sitemap/hreflang/JSON-LD:

```bash
node tools/seo/indexnow.mjs https://panevascensori.it \
  --key-file panev/d6e1a2e328c3fd92c84f47c85c1fb084.txt \
  --key-location https://panevascensori.it/d6e1a2e328c3fd92c84f47c85c1fb084.txt
```

Търсачките теглят `keyLocation`, за да докажат собствеността — **файлът трябва да е
жив, преди да подадеш**, иначе цялата партида се отхвърля.

---

Легаси: `panev/scripts/deploy.sh` и `panev/deploy.sh` бяха PM2 деплой към стар VPS
(`/var/www/panevascensori`, PHP-FPM за `contact.php`, Stripe количка). Всичко това
е премахнато от продукта — скриптовете вече само сочат насам и излизат с грешка.
