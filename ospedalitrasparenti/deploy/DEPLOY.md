# Ospedali Trasparenti — деплой (systemd + Nginx + TLS)

Каноничен деплой като другите продукти в монорепото: през
[`deploy/autodeploy.sh`](../../deploy/README.md) в корена (функция
`deploy_ospedali`, **systemd модел като medqr/vizitka**). За разлика от тях —
**НЯМА `npm ci`, НЯМА билд стъпка**: сервизът е лек Node процес с **нула
зависимости**, който обслужва предбилднатия статичен сайт от `site/` (вече в git).
Деплоят е само `rsync` на файловете + `systemctl restart ospedali`.

- Приложение: `server/server.js` (`node:http`/`node:crypto`), слуша `127.0.0.1:8788`.
- Домейн: `https://ospedalitrasparenti.it` (зад Nginx + Let's Encrypt).
- Health: `GET /healthz` → `{"ok":true}`.
- Потребител: `ospedali` (собствен системен потребител, без shell; създава го `deploy_ospedali`).
  Не `www-data` — пробив в nginx не стига до тайните и състоянието на сервиза.

## Какво прави `deploy_ospedali` (автоматично, идемпотентно)

1. `rsync ospedali/ → /opt/ospedali`, като **изключва** `server/.env`,
   `server/.state/` и суровите ETL данни (`data/raw/`, `data/contratti/`) — тайните
   и рънтайм състоянието оцеляват между версиите (rsync `--delete` не ги пипа).
2. Създава потребителя `ospedali` (със собствена група), ако липсва, и подрежда правата
   (`ospedali_perms` в `deploy/autodeploy.sh`): кодът е `root:root` — сервизът само го чете;
   `server/.state/` е `ospedali:ospedali` 700 (единственото място, където сервизът пише —
   брояч, видимост, админ хеш, audit log); `server/.env` е `root:ospedali` 640. Създава
   `server/.state/` преди старт, защото `ProtectSystem=strict` прави всичко извън
   `ReadWritePaths` само за четене. Стари инсталации (всичко на `www-data`/`ospedali`) се
   поправят автоматично при следващия деплой.
3. Самоинсталира systemd unit-а (`deploy/systemd/ospedali.service`) → `daemon-reload`
   → `enable` → `restart`.
4. Health check на `http://127.0.0.1:8788/healthz`; при провал — **авто-rollback**
   към предишния код и рестарт (както medqr/mastilko).

Пускане само на този проект:

```bash
sudo PROJECTS="ospedali" bash /root/few-few-*/deploy/autodeploy.sh
```

## Еднократна ръчна настройка (веднъж, преди първото пускане)

### 1) DNS

Насочи **A запис** (и по избор `AAAA`) на `ospedalitrasparenti.it` **и**
`www.ospedalitrasparenti.it` към IP-то на VPS-а. TLS не се издава, докато DNS не сочи насам.

### 2) Тайни в `/opt/ospedali/server/.env` (`root:ospedali`, mode 640)

```bash
id ospedali >/dev/null 2>&1 || sudo useradd --system --user-group --home-dir /opt/ospedali --shell /usr/sbin/nologin ospedali
sudo install -d -o root -g root /opt/ospedali/server
sudo tee /opt/ospedali/server/.env >/dev/null <<EOF
OSPEDALI_ADMIN_PASSWORD=$(openssl rand -base64 18)
OSPEDALI_SESSION_SECRET=$(openssl rand -hex 32)
EOF
sudo chown root:ospedali /opt/ospedali/server/.env
sudo chmod 640 /opt/ospedali/server/.env
sudo grep OSPEDALI_ADMIN_PASSWORD /opt/ospedali/server/.env   # запиши паролата в password manager
```

В **продукция** `OSPEDALI_ADMIN_PASSWORD` е **задължителна** — без нея сервизът
отказва старт (не работим с непозната случайна парола). Случайното генериране е само
за локална разработка (`OSPEDALI_INSECURE_COOKIES=1`). `OSPEDALI_PORT`/`OSPEDALI_HOST`
са по избор (по подр. `127.0.0.1:8788`).

Тайните се четат от systemd (`EnvironmentFile`, като root); приложението ги чете и само
(best-effort) през групата `ospedali` — само за четене, не може да ги презапише.
`deploy_ospedali` налага `root:ospedali 640` при всеки деплой, така че ръчно `root:root 600`
или `ospedali:ospedali 600` се изравнява автоматично.

### Отстраняване на проблеми (наблюдавани при първи деплой)

- **`status=31/SYS` / SIGSYS crash-loop** — seccomp убива Node (io_uring syscalls извън
  `@system-service` на по-стар systemd). Поправено в unit-а с `SystemCallErrorNumber=EPERM`
  (libuv пада на epoll). Ако все пак се появи на друг хост: `sudo systemctl edit ospedali`
  → добави `[Service]\nSystemCallErrorNumber=EPERM`.
- **`EACCES … open '.env'`** — `.env` е нечетим за потребителя на сервиза (`ospedali`). Поправено (приложението
  толерира нечетим `.env`, тайните идват от systemd). Стар билд: `sudo chown root:ospedali
  /opt/ospedali/server/.env && sudo chmod 640 /opt/ospedali/server/.env` (или нов деплой).
- **`nginx -t` пада с липсващ TLS сертификат** — vhost-ът има `443 ssl` блок, а сертификатът
  още не е издаден. Издай го първо с временен HTTP-only vhost (§3), после върни пълния.

### 3) Nginx vhost + TLS

```bash
sudo cp /opt/ospedali/deploy/nginx/ospedalitrasparenti.it.conf \
        /etc/nginx/sites-available/ospedalitrasparenti.it.conf
sudo ln -sf /etc/nginx/sites-available/ospedalitrasparenti.it.conf \
            /etc/nginx/sites-enabled/ospedalitrasparenti.it.conf
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ospedalitrasparenti.it -d www.ospedalitrasparenti.it \
     -m info@carbonstealth.eu --agree-tos --redirect --keep-until-expiring
```

**Важно (rate-limit на админа):** vhost-ът задава `X-Forwarded-For $remote_addr`
**презапис, не append** — сервизът чете първата стойност за дневния анонимен хеш и
за throttle на `/admin`. `$proxy_add_x_forwarded_for` би позволил подправяне.

> Забележка: `certbot --nginx` пренаписва `listen 443 ssl` блоковете. Ако издаваш
> сертификата **преди** vhost-ът да сочи към реални сертификатни пътища, пусни
> първо HTTP-only variant или ползвай `certbot certonly`, после копирай конфига.

## Проверка

```bash
systemctl status ospedali
journalctl -u ospedali -f
curl -s localhost:8788/healthz          # {"ok":true}
curl -sI https://ospedalitrasparenti.it # 200 + валиден TLS
```

## Търсачки (откриваемост)

**Автоматично (вградено).** След всеки успешен деплой `deploy_ospedali` подава
**IndexNow** (`node src/indexnow.js`) — активно уведомява **Bing, Yandex, Seznam** за
всички URL-и от `sitemap.xml`. Ключът е `config.indexNowKey`; `build-site` генерира
`site/<key>.txt` за верификация. Best-effort: при първия деплой (преди DNS/TLS) може да
падне — минава при следващия. Ръчно: `npm run indexnow`.

**Пасивно (винаги активно).** `robots.txt` (allow-all + `Sitemap:`) + `sitemap.xml`
(5288 URL) + canonical/OG/JSON-LD → всеки crawler открива сайта сам.

**Google — еднократна ръчна стъпка (Google не поддържа IndexNow).** След пускането:
[Google Search Console](https://search.google.com/search-console) → добави имота
`ospedalitrasparenti.it` → верифицирай (DNS TXT запис, най-чисто) → подай
`https://ospedalitrasparenti.it/sitemap.xml`. Същото по избор в
[Bing Webmaster Tools](https://www.bing.com/webmasters) (IndexNow вече покрива Bing).

## Приватност (GDPR)

Броячът е **анонимен и агрегатен** (без IP, без проследяващи бисквитки — HMAC на
IP+UA с дневна ротираща сол само в паметта; на диска само числа). Бисквитката
`ost_admin` е строго техническа (вход в `/admin`, HttpOnly+Secure+SameSite=Strict).
Виж и [`../server/DEPLOY.md`](../server/DEPLOY.md).
