# OpenSEO — пилот на продукционния VPS (рецепта, ръчна)

> **Статус:** подготовка. Нищо от тук не е пуснато. Това е **пилот, не продукт**: не влиза в
> `deploy/autodeploy.sh` и в restic (`tools/vps/backup-verify.sh`). Всяка команда по-долу се пуска
> **от собственика по SSH**, като root на VPS-а. Агентите не я пускат.
>
> **Източник:** `every-app/open-seo`, MIT, прегледан на commit
> `78c5d850c2729e3fcf7edf33aafb66efe17453e0` (`78c5d85`). Ползва се **само**
> `deploy/standalone/compose.yaml`. Кореновият `compose.yaml` има `AUTH_MODE=local_noauth`, тоест
> работи без вход и с `:latest`, затова **никога** не се ползва.

## 1. Какво се пуска

OpenSEO е self-hosted алтернатива на Semrush. Данните за ключови думи, backlinks и позиции идват
от **DataForSEO**, който се плаща директно и на заявка. Standalone стекът (`name: openseo-standalone`)
има следните части:

| Услуга | Образ | Роля |
|---|---|---|
| `storage` | `rustfs/rustfs:1.0.3@sha256:9ca9…688b` (закотвен от upstream) | S3 хранилище. В него е базата (D1/SQLite в celld) |
| `runtime` | `open-seo-standalone` (закотвяме го ние, т. 3) | celld runtime на приложението, `mem_limit: 2g` |
| `init` | същият | при всяко пускане: тайни при първия старт, deploy, миграции. После излиза |
| `crawl-gateway` | същият | crawl само към публични адреси на портове 80/443 (SSRF защита) |
| `web` | `nginx:1.28-alpine@sha256:a8b3…d236` (закотвен от upstream) | вътрешен nginx. **Единственият публикуван порт** |

- **Томове:** `openseo-standalone_storage` (данните), `_config` (генерираните тайни и
  `wrangler.json` с ключовете, права 600), `_runtime` (кеш) и `_web-config`.
- **Порт:** `127.0.0.1:4340` вместо upstream `3001`, защото `3001` вече е зает от
  `tools/vps/monitoring/docker-compose.monitoring.yml`. Портът `4340` не се среща никъде в репото.
- **Телеметрия:** в standalone е изключена принудително (`scripts/celld/runtime/configure.mjs:67-68`
  задава `OPENSEO_TELEMETRY_DISABLED: "true"` и `DO_NOT_TRACK: "1"` и тези ключове не могат да се
  презапишат от env).
- **Пътища на сървъра:** стекът е в `/opt/openseo/` (700): `compose.yaml` от upstream,
  `compose.override.yaml` е наш, `.env` е с права 600. Бекъпите са в `/var/backups/openseo/` (700,
  шифровани), а nginx файловете са в `/etc/nginx/`. Бекъпите съзнателно **не** са в
  `/var/backups/few-few`. Така restic не ги прибира и премахването на пилота е без следи.
- **Поддомейн (само предложение, DNS записа го прави собственикът):** `seo.carbonstealth.eu`, A/AAAA
  запис към IP-то на VPS-а. Записът се прави **след** т. 6.4, тоест след като е създаден админът.

## 2. Чеклист преди пускане (условията от прегледа на Кодаджията + наши)

Всяка точка трябва да е отметната, преди да се пусне нещо:

- [ ] **1. Само `deploy/standalone/compose.yaml`** при commit `78c5d85`, проверен по sha256 (т. 5.2).
- [ ] **2. Образ по `@sha256:`, никога `:latest`.** `:latest` се гради от всеки commit в `main` и
      няма подпис (в `.github/workflows/docker-image.yml` няма cosign стъпка). Ъпгрейдът е **само
      ръчен** (т. 8). Digest-ът пази съдържанието на образа, но не доказва откъде идва.
- [ ] **3. Достъп само за собственика от първата секунда.** Първият регистрирал се става админ
      (`src/server/standalone/sign-up.ts:13-23`), а `GET /api/sign-up-status` показва дали
      инсталацията още няма акаунт (`src/routes/api/sign-up-status.ts`). Затова:
      (а) админът се създава с `admin.mjs create-user` през терминала, **преди** да има DNS и vhost;
      (б) проверява се, че `/api/sign-up-status` връща `{"firstAccount":false}`;
      (в) vhost-ът се пуска чак тогава, с **IP allowlist + basic auth** (`satisfy all`).
- [ ] **4.** Силни `STORAGE_ACCESS_KEY` и `STORAGE_SECRET_KEY` (`openssl rand`) и
      `BETTER_AUTH_URL=https://seo.carbonstealth.eu`, зададени още **преди първия старт**.
- [ ] **5. Без покани.** Регистрацията е отворена за всеки имейл с висяща покана
      (`sign-up.ts:18-23`). Имейли не се пращат, а адресът не се потвърждава, така че който стигне
      до формата с този адрес, заема мястото. Нов човек се добавя **само** с `admin create-user`.
- [ ] **6. Лимит на харченето в самия DataForSEO акаунт.** Минимумът е малък предплатен баланс без
      автоматично презареждане. Собственикът проверява в таблото дали има твърд лимит (Несигурно).
- [ ] **7.** HSTS и CSP в нашия nginx, WebSocket upgrade (за SAM) и `limit_req` на `/api/auth/`.
      Вътрешният nginx вижда като клиентски IP само нашия прокси, затова rate limit-ът на Better
      Auth не различава клиентите.
- [ ] **8. OpenRouter е изключен по подразбиране** (`OPENROUTER_API_KEY` празен), защото праща
      данни за проектите в САЩ. Ако се иска, `OPENROUTER_BASE_URL` може да сочи към ЕС доставчик.
      **Това решава собственикът.**
- [ ] **9. Бекъпите са само шифровани** (`age` към публичен ключ). Томът `config` и `.env` съдържат
      всички тайни.
- [ ] **10.** Docker Engine ≥ 29.5.1 (заради `docker cp` CVE-тата), свободна памет и диск (т. 4).
- [ ] **11.** Crawl-ове на одита правим само към **наши** сайтове, защото тръгват от IP-то на
      продукционния сървър.

## 3. Закотвяне на образа

Проверено на 2026-11-06 срещу GHCR (`/v2/every-app/open-seo-standalone/manifests/<tag>`):

| Таг | Index digest (multi-arch) | Бележка |
|---|---|---|
| `sha-78c5d85` | `sha256:ed3d63c9be4e29bcbfe23c575633e8ca35fab9a9c8c0293464dcd70e6606070b` | **препоръчан**: точно прегледаният код |
| `0.1.25` / `v0.1.25` | `sha256:6c5d514649b550fc7bdcefaa52314e7a98c7846b7fc5f7a288c486575698bb04` | последният release таг. Digest-ът е **различен** от прегледания commit, затова не е прегледан |

```
OPENSEO_IMAGE=ghcr.io/every-app/open-seo-standalone:sha-78c5d85@sha256:ed3d63c9be4e29bcbfe23c575633e8ca35fab9a9c8c0293464dcd70e6606070b
```

Ако има тагове с digest, Docker тегли по digest-а и тагът остава само за четене от хора.

## 4. Предварителни проверки на сървъра (само четене)

```bash
docker version --format '{{.Server.Version}}'      # ≥ 29.5.1, иначе първо ъпгрейд на Engine
docker compose version                              # Compose v2
free -m                                             # MemAvailable ≥ 3000 MB (лимитите по-долу ≈ 3,4 GiB; upstream: обикновено 1–2 GiB)
df -h /var/lib/docker /var/backups                  # ≥ 5 GB свободни
getconf PAGESIZE                                    # 4096 (celld иска 4 KiB страници)
ss -ltnp | grep -E ':4340\b' || echo 'порт 4340 свободен'
nginx -v; certbot --version
command -v age htpasswd || echo 'липсват: apt-get install -y age apache2-utils'
```

**Стоп правило:** ако паметта не стига, OpenSEO **не се пуска**, защото продуктите са с приоритет.

## 5. Подготовка на файловете

### 5.1 Директория

```bash
install -d -m 700 -o root -g root /opt/openseo /var/backups/openseo /etc/openseo
```

### 5.2 Upstream compose при прегледания commit, проверен по sha256

На кутията няма `git pull`. Сваля се един файл по пълния commit и се проверява:

```bash
cd /opt/openseo
curl -fsSL -o compose.yaml \
  https://raw.githubusercontent.com/every-app/open-seo/78c5d850c2729e3fcf7edf33aafb66efe17453e0/deploy/standalone/compose.yaml
echo 'a0f02d293cb923796908b09ea3ab70ea639fb896dfe3199a4eceb30b56c9cbda  compose.yaml' | sha256sum -c -
chmod 600 compose.yaml
```

Ако хешът не съвпадне, **спри**. Файлът не е прегледаният.

### 5.3 Нашият `compose.override.yaml`

Compose го зарежда автоматично до `compose.yaml`. Не променя upstream файла, а добавя ограничения:

```yaml
# /opt/openseo/compose.override.yaml — ограничения на Carbon Stealth върху upstream @78c5d85.
# Upstream вече: портът е само на 127.0.0.1; runtime има mem_limit 2g и json-file логове;
# rustfs и nginx са закотвени по digest.
x-logging: &logging
  driver: json-file
  options: { max-size: "10m", max-file: "3" }
x-hardening: &hardening
  security_opt: ["no-new-privileges:true"]
  logging: *logging

services:
  storage:
    <<: *hardening
    mem_limit: 512m        # Несигурно колко ползва RustFS — следи `docker stats`, вдигни при OOMKilled
    cpus: 0.5
    pids_limit: 256
  runtime:
    <<: *hardening
    image: ${OPENSEO_IMAGE:?Закотви OPENSEO_IMAGE по digest в .env}
    mem_limit: 2g          # = upstream; CELLD_MAX_RSS_MB=1536 вътре
    cpus: 1.5
    pids_limit: 512
  init:
    <<: *hardening
    image: ${OPENSEO_IMAGE:?Закотви OPENSEO_IMAGE по digest в .env}
    mem_limit: 512m
    pids_limit: 256
  crawl-gateway:
    <<: *hardening
    image: ${OPENSEO_IMAGE:?Закотви OPENSEO_IMAGE по digest в .env}
    mem_limit: 256m
    cpus: 0.5
    pids_limit: 256
  web:
    <<: *hardening
    mem_limit: 128m
    cpus: 0.5
    pids_limit: 128
```

`cap_drop`/`read_only` нарочно липсват. Не са пробвани с init, който пише в `/config`, и с nginx,
който сменя потребителя си. Ако се добавят, само след тест.

### 5.4 `.env`: тайните (само на сървъра, права 600, никога в репото и в чата)

`DATAFORSEO_API_KEY` е `base64("login:password")` на **API** достъпа от таблото на DataForSEO, не
паролата за вход (`docs/DATAFORSEO_API_KEY.md`, `src/shared/selfhost-checks.ts:34-44`). Паролата се
въвежда скрито, затова не остава в shell историята:

```bash
cd /opt/openseo
if [ -e .env ]; then echo '.env вече има — НЕ го презаписвам (STORAGE ключовете са вързани с данните).'; else
  read -r  -p 'DataForSEO API login: ' DFS_LOGIN
  read -rs -p 'DataForSEO API парола: ' DFS_PASS; echo
  umask 077
  {
    printf 'OPENSEO_IMAGE=%s\n' 'ghcr.io/every-app/open-seo-standalone:sha-78c5d85@sha256:ed3d63c9be4e29bcbfe23c575633e8ca35fab9a9c8c0293464dcd70e6606070b'
    printf 'AUTH_MODE=password\n'
    printf 'BETTER_AUTH_URL=https://seo.carbonstealth.eu\n'
    printf 'PORT=4340\n'
    printf 'STORAGE_ACCESS_KEY=openseo-%s\n' "$(openssl rand -hex 12)"
    printf 'STORAGE_SECRET_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'DATAFORSEO_API_KEY=%s\n' "$(printf '%s:%s' "$DFS_LOGIN" "$DFS_PASS" | base64 -w0)"
    printf 'OPENROUTER_API_KEY=\n'          # т. 2/8 — празно по подразбиране
    printf 'CRAWLER_ACCESS_SECRET=%s\n' "$(openssl rand -hex 32)"
  } > .env
  chmod 600 .env
  unset DFS_LOGIN DFS_PASS
fi
stat -c '%a %U %n' .env      # трябва: 600 root .env
```

> Файлът се пише наведнъж, с `>`. Дописване с `>>` към `.env` в този пилот не се прави.
> `STORAGE_*` **не се сменят** след първия старт, защото с тях RustFS пази данните, а
> възстановяването иска същите ключове. Затова шифрованият бекъп носи и `.env` (т. 7).

## 6. Пускане (стекът е само на 127.0.0.1, още без DNS и vhost)

### 6.1 Проверка на конфигурацията, без да се печатат тайни

```bash
cd /opt/openseo
docker compose config --quiet && echo 'конфиг OK'
# само безопасните редове (пълният `config` печата тайните — не го пускай без grep):
docker compose config | grep -E '^\s+(image|mem_limit|host_ip|published):'
```

Очаква се: три реда `image: …open-seo-standalone:sha-78c5d85@sha256:ed3d…`, rustfs и nginx по
digest, `host_ip: 127.0.0.1` и `published: "4340"`. Не трябва да има нито един `:latest`.

### 6.2 Сваляне и старт

```bash
docker compose pull
docker image inspect --format '{{json .RepoDigests}}' ghcr.io/every-app/open-seo-standalone:sha-78c5d85
#   → трябва да съдържа …@sha256:ed3d63c9be4e29bcbfe23c575633e8ca35fab9a9c8c0293464dcd70e6606070b
docker compose up -d
for i in $(seq 1 60); do
  docker compose logs --no-log-prefix init 2>/dev/null | grep -q 'OpenSEO initialized and ready.' && { echo 'init: ready'; break; }
  sleep 5
done
docker compose ps
```

Ако `init` излезе с грешка, `web` не тръгва. Тогава: `docker compose logs --tail 100 init runtime storage`.

### 6.3 Health check (HTTP 200 и маркер в тялото)

`/api/health` връща `{"status":"ok"|"issues", "version", "authMode", "checks":{…}}`. Има само статуси
и подсказки, без стойности на тайни (`src/routes/api/health.ts`, `src/server/lib/setup-status.ts`).
`issues` означава грешка в конфигурацията, например сбъркан DataForSEO ключ. Затова 200 само по
себе си не стига:

```bash
ok=0; for i in $(seq 1 36); do
  b=$(curl -fsS --max-time 5 http://127.0.0.1:4340/api/health) && case "$b" in *'"status":"ok"'*) ok=1; break;; esac
  sleep 5
done
[ "$ok" = 1 ] && echo 'HEALTH OK' || { echo 'HEALTH FAIL'; printf '%s\n' "$b" | head -c 800; echo; }
```

### 6.4 Админът, създаден от терминала (затваря прозореца „първият посетител става админ“)

```bash
cd /opt/openseo
read -r  -p 'Имейл на собственика: ' OWNER_EMAIL
read -rs -p 'Парола (12+ знака, от password manager): ' pw; echo
printf '%s\n' "$pw" | docker compose exec -T runtime node /opt/standalone/admin.mjs create-user "$OWNER_EMAIL" 'Carbon Stealth'
unset pw OWNER_EMAIL
curl -fsS http://127.0.0.1:4340/api/sign-up-status; echo     # ТРЯБВА: {"firstAccount":false}
```

- `admin.mjs` чете паролата от stdin и я праща с операторската тайна от `/config/secrets.json` към
  `/api/standalone/admin`. Вътрешният nginx не пуска този път отвън.
- Сигурно е, че след първия акаунт регистрацията се затваря (`sign-up.ts:13-15`). **Вероятно**
  акаунтът, създаден от CLI, е администраторът. Това се проверява в т. 6.7, като в Team settings
  трябва да се вижда управление на екипа. Ако не е администратор, инсталацията още е празна:
  премахни я по т. 10 и започни отначало.
- SSH тунел (`ssh -L 4340:127.0.0.1:4340`) като алтернатива **не** се препоръчва, защото
  `BETTER_AUTH_URL` вече е `https://…`. Вероятно Better Auth ще откаже вход от origin
  `http://localhost`.

**Стоп правило:** ако `firstAccount` не е `false`, DNS записът и vhost-ът **не** се правят.

### 6.5 DNS запис (собственикът), после сертификат

Собственикът създава `seo.carbonstealth.eu` → IP на VPS-а. След като `dig +short seo.carbonstealth.eu`
покаже правилното IP, се изпълнява моделът на korpora (`korpora/DEPLOY.md:49`):

```bash
certbot certonly --nginx -d seo.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
certbot renew --dry-run --cert-name seo.carbonstealth.eu
```

Подновяването е от certbot таймера (`systemctl list-timers | grep certbot`). При профили с кратък
живот (45 дни) проверявай таймера, а не фиксирани 60 дни.

### 6.6 Достъп само за собственика: allowlist + basic auth + vhost

```bash
# IP-тата на собственика (лични данни — само на сървъра, НЕ в репото). 203.0.113.10 е пример.
cat > /etc/openseo/allow.conf <<'EOF'
allow 203.0.113.10;
# allow 2001:db8::/64;
deny all;
EOF
chmod 600 /etc/openseo/allow.conf

htpasswd -B -C 12 -c /etc/nginx/openseo.htpasswd owner     # паролата — интерактивно
chown root:www-data /etc/nginx/openseo.htpasswd && chmod 640 /etc/nginx/openseo.htpasswd
```

Ако собственикът няма статично IP, остават два варианта. Първият е само basic auth + fail2ban
(по-слабо). Вторият е без публичен vhost изобщо и с работа само през WireGuard/Tailscale. Изборът е
на собственика.

`/etc/nginx/sites-available/openseo` (TLS параметрите са като при korpora):

```nginx
# OpenSEO пилот — ръчен vhost, НЕ от autodeploy. Достъп: IP allowlist И basic auth.
limit_req_zone $binary_remote_addr zone=openseo_auth:1m rate=30r/m;
map $http_upgrade $openseo_connection { default upgrade; '' close; }

server {
    listen 80;
    listen [::]:80;
    server_name seo.carbonstealth.eu;
    server_tokens off;
    access_log off;
    location / { return 308 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name seo.carbonstealth.eu;

    ssl_certificate     /etc/letsencrypt/live/seo.carbonstealth.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seo.carbonstealth.eu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:OpenSEOSSL:10m;
    ssl_session_tickets off;

    server_tokens off;
    # Вътрешен инструмент: дневник за сигурност (кой опитва достъп). Ротира се от /etc/logrotate.d/nginx.
    access_log /var/log/nginx/openseo.access.log;
    error_log  /var/log/nginx/openseo.error.log warn;

    # И двете условия: IP от списъка И basic auth.
    satisfy all;
    include /etc/openseo/allow.conf;
    auth_basic "OpenSEO";
    auth_basic_user_file /etc/nginx/openseo.htpasswd;

    # Приложението слага само `frame-ancestors 'self'` на HTML (src/server.ts:55-70).
    # Двете CSP заглавки се прилагат заедно (сечение). Пълната политика е само Report-Only, докато не
    # се види в конзолата, че нищо не се чупи. Чак тогава става задължителна.
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Content-Security-Policy "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" always;
    add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss://seo.carbonstealth.eu; frame-ancestors 'self'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Robots-Tag "noindex, nofollow" always;

    client_max_body_size 20m;     # = вътрешния nginx на upstream

    location /api/auth/ {
        limit_req zone=openseo_auth burst=20 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:4340;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Authorization "";          # basic паролата не стига до приложението
    }

    location / {
        proxy_pass http://127.0.0.1:4340;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;      # WebSocket за SAM
        proxy_set_header Connection $openseo_connection;
        proxy_set_header Authorization "";
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/openseo /etc/nginx/sites-enabled/openseo
nginx -t && systemctl reload nginx
```

По избор, fail2ban за грешни basic auth пароли. Jail-ът е отделен, за да не пипа съществуващия
`nginx-http-auth`:

```ini
# /etc/fail2ban/jail.d/openseo.local
[openseo-http-auth]
enabled  = true
filter   = nginx-http-auth
port     = http,https
logpath  = /var/log/nginx/openseo.error.log
maxretry = 5
bantime  = 1h
```

```bash
fail2ban-client reload && fail2ban-client status openseo-http-auth
```

### 6.7 Проверки след пускането

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://seo.carbonstealth.eu/                 # от сървъра (IP не е в списъка) → 403
curl -sS -o /dev/null -w '%{http_code}\n' http://seo.carbonstealth.eu/                  # → 308
curl -sSI https://seo.carbonstealth.eu/ | grep -iE 'strict-transport|content-security|x-robots'
ss -ltnp | grep 4340                    # само 127.0.0.1:4340
docker stats --no-stream $(docker compose -f /opt/openseo/compose.yaml ps -q)
openssl s_client -connect seo.carbonstealth.eu:443 -servername seo.carbonstealth.eu </dev/null 2>/dev/null | openssl x509 -noout -enddate
```

От машината на собственика (IP-то е в списъка): без парола трябва да дава **401**, а с парола да се
отвори формата за вход. Вход с акаунта от т. 6.4. После Team settings трябва да показва
управлението на екипа. **Покани не се създават** (т. 2/5). Накрая едно тестово търсене на ключова
дума, за да се провери DataForSEO ключът, и поглед в конзолата на браузъра за CSP Report-Only
нарушения.

## 7. Бекъп (шифрован, локален) и тест на възстановяването

Томовете `storage` и `config` и `.env` се шифроват с `age` към **публичен** ключ на собственика.
Частният ключ никога не е на сървъра. По модела на upstream `scripts/celld/backup.mjs` приложението
се спира за кратко, за да е снимката консистентна. Томът `runtime` е кеш и upstream също не го
бекъпва.

```bash
# получатели: само ПУБЛИЧНИ ключове (age1… или ssh-ed25519 …) на собственика
nano /etc/openseo/backup-recipients.txt && chmod 600 /etc/openseo/backup-recipients.txt
```

`/usr/local/sbin/openseo-backup.sh` (root:root, 700):

```bash
#!/usr/bin/env bash
# Шифрован бекъп на OpenSEO пилота: томове storage (/data) + config (/config) + .env.
set -euo pipefail
umask 077
DIR=/opt/openseo
DEST=${OPENSEO_BACKUPS:-/var/backups/openseo}
KEEP=${OPENSEO_KEEP:-7}
RCPT=${OPENSEO_BACKUP_RECIPIENTS:-/etc/openseo/backup-recipients.txt}
die(){ echo "openseo-backup: $*" >&2; exit 1; }
command -v age >/dev/null || die "липсва age — бекъп НЕ е направен"
[ -s "$RCPT" ] || die "няма получатели в $RCPT — бекъп НЕ е направен"
cd "$DIR"
rid=$(docker compose ps -aq runtime); sid=$(docker compose ps -aq storage)
[ -n "$rid" ] && [ -n "$sid" ] || die "стекът не е създаден"
img=$(docker inspect --format '{{.Image}}' "$rid")
out="$DEST/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$DEST"; mkdir -m 700 "$out"
running=$(docker compose ps --services --status running | grep -Ex 'storage|runtime|crawl-gateway|web' | tr '\n' ' ' || true)
# shellcheck disable=SC2086  # списъкът с услуги се разделя нарочно
restart(){ [ -z "$running" ] || docker compose start $running; }
trap restart EXIT
docker compose stop web crawl-gateway runtime storage
snap(){ # $1 контейнер · $2 път в него · $3 име
  docker run --rm --network none -u 0 --volumes-from "$1:ro" --entrypoint tar "$img" -czf - -C "$2" . \
    | age -R "$RCPT" -o "$out/$3.tar.gz.age"
}
snap "$sid" /data storage
snap "$rid" /config config
age -R "$RCPT" -o "$out/env.age" .env
trap - EXIT; restart
( cd "$out" && sha256sum -- *.age > SHA256SUMS && printf '%s\n' "$img" > image )
b=''; for i in $(seq 1 36); do
  b=$(curl -fsS --max-time 5 http://127.0.0.1:4340/api/health || true)
  case "$b" in *'"status":"ok"'*) break;; esac; sleep 5
done
case "$b" in *'"status":"ok"'*) ;; *) die "бекъпът е в $out, но OpenSEO не е здрав след рестарта";; esac
ls -1d "$DEST"/20*Z 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -rf --
echo "openseo-backup: готово $out"
```

systemd. Времето е 02:45 UTC: korpora е в 02:30, а другите бекъпи в 03:00
(`korpora/deploy/systemd/korpora-backup.timer`).

```ini
# /etc/systemd/system/openseo-backup.service
[Unit]
Description=OpenSEO пилот — шифрован бекъп
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/openseo-backup.sh
```

```ini
# /etc/systemd/system/openseo-backup.timer
[Unit]
Description=OpenSEO пилот — дневен бекъп (02:45 UTC)
[Timer]
OnCalendar=*-*-* 02:45:00 UTC
Persistent=true
RandomizedDelaySec=5min
[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload && systemctl enable --now openseo-backup.timer
systemctl start openseo-backup.service && journalctl -u openseo-backup.service -n 20 --no-pager
ls -la /var/backups/openseo/*/            # *.age, SHA256SUMS, image — права 600/700
```

**Тест на възстановяването (задължителен, бекъп без тест не е бекъп).** Прави се в отделен
проект `openseo-restoretest` на порт `4341`. Частният ключ остава на машината на собственика:
шифрованият файл идва по ssh, дешифрира се там и се връща обратно. Тестът временно удвоява
паметта, затова първо `free -m`.

```bash
# НА СЪРВЪРА: празни томове на тестовия проект
cd /opt/openseo
TS=<папката от /var/backups/openseo>; IMG=$(cat /var/backups/openseo/$TS/image)
( cd /var/backups/openseo/$TS && sha256sum -c SHA256SUMS )
PORT=4341 docker compose -p openseo-restoretest create --no-build storage runtime
```

```bash
# НА МАШИНАТА НА СОБСТВЕНИКА (ключът е тук): дешифриране в потока → tar в тестовия том
TS=<същата папка>; IMG=$(ssh root@VPS "cat /var/backups/openseo/$TS/image")
for v in storage:/data config:/config; do n=${v%%:*}; p=${v#*:}
  ssh root@VPS "cat /var/backups/openseo/$TS/$n.tar.gz.age" | age -d -i ~/.age/openseo.key \
  | ssh root@VPS "docker run --rm -i --network none -u 0 -v openseo-restoretest_$n:$p --entrypoint tar $IMG -xzf - -C $p"
done
```

```bash
# НА СЪРВЪРА: старт, проверка, премахване САМО на тестовия проект
PORT=4341 docker compose -p openseo-restoretest up -d
curl -fsS http://127.0.0.1:4341/api/health | head -c 300; echo      # "status":"ok"
curl -fsS http://127.0.0.1:4341/api/sign-up-status; echo           # {"firstAccount":false} = акаунтите са възстановени
docker compose -p openseo-restoretest down -v   # трие томовете на openseo-restoretest_*, НЕ на живия стек — провери -p преди Enter
```

## 8. Ъпгрейд (само ръчен, само към прегледан commit)

1. Кодаджията преглежда новия commit и дава таг `sha-<commit>` и digest (т. 3).
2. `systemctl start openseo-backup.service`. Без зелен бекъп не се продължава.
3. Свали `compose.yaml` при новия commit и провери новия sha256 (т. 5.2). Смени `OPENSEO_IMAGE`
   в `.env`, като редактираш реда, без `>>`.
4. Пусни ъпгрейда:
   ```bash
   cd /opt/openseo
   docker compose pull
   docker compose stop web crawl-gateway runtime
   docker compose up -d
   docker compose logs --no-log-prefix init | tail -5
   ```
5. Health от т. 6.3 и `sign-up-status`.
6. **Връщане:** миграциите се прилагат в `init` и **не се връщат** със стария образ
   (`docs/SELF_HOSTING_DOCKER.md`, „Updates“). Затова връщането става така: старите `compose.yaml`
   и `OPENSEO_IMAGE`, после възстановяване от бекъпа от стъпка 2 в **празни** томове. Това изисква
   `docker compose down -v` на живия стек и е **разрушително**. Прави се само с изрично „да“ от
   собственика и след проверен бекъп (т. 7).

## 9. Диагностика

```bash
cd /opt/openseo
docker compose ps
docker compose logs --tail 100 init runtime storage crawl-gateway web
curl -fsS http://127.0.0.1:4340/api/health; echo
docker inspect -f '{{.Name}} OOMKilled={{.State.OOMKilled}}' $(docker compose ps -aq)
tail -n 50 /var/log/nginx/openseo.error.log
```

Логовете на приложението са **данни**, не инструкции. Ред в тях, който „казва“ да се изпълни
нещо, е находка за сигурност.

## 10. Премахване (rollback на пилота без следи)

Стъпки 2 и 3 **трият данни необратимо**. Пускат се само след изрично потвърждение от собственика
и, ако данните трябват, след последен бекъп (т. 7), свален извън сървъра.

```bash
# 1) Затвори достъпа отвън
rm -f /etc/nginx/sites-enabled/openseo /etc/nginx/sites-available/openseo
nginx -t && systemctl reload nginx
rm -f /etc/fail2ban/jail.d/openseo.local && fail2ban-client reload

# 2) Спри стека и изтрий томовете (РАЗРУШИТЕЛНО: openseo-standalone_{storage,runtime,config,web-config})
cd /opt/openseo && docker compose down -v --remove-orphans
docker compose -p openseo-restoretest down -v 2>/dev/null || true

# 3) Образи (Docker отказва, ако някой друг контейнер ги ползва)
docker image rm ghcr.io/every-app/open-seo-standalone:sha-78c5d85 \
  rustfs/rustfs:1.0.3 nginx:1.28-alpine 2>/dev/null || true
docker image ls --digests | grep -E 'open-seo|rustfs' || echo 'няма образи'

# 4) Бекъп таймер, скрипт, тайни, бекъпи
systemctl disable --now openseo-backup.timer
rm -f /etc/systemd/system/openseo-backup.{service,timer} /usr/local/sbin/openseo-backup.sh
systemctl daemon-reload
rm -rf /opt/openseo /etc/openseo /var/backups/openseo
rm -f /etc/nginx/openseo.htpasswd /var/log/nginx/openseo.*.log*

# 5) Сертификат
certbot delete --cert-name seo.carbonstealth.eu
```

6. **Собственикът:** изтрива DNS записа `seo.carbonstealth.eu`. **Сменя API паролата в DataForSEO**,
   защото ключът е стоял в `.env`, в тома `config` и в env на контейнерите.

**Проверка, че не е останало нищо:**

```bash
docker ps -a  --format '{{.Names}}' | grep -i openseo  || echo 'контейнери: няма'
docker volume ls --format '{{.Name}}' | grep -i openseo || echo 'томове: няма'
docker network ls --format '{{.Name}}' | grep -i openseo || echo 'мрежи: няма'
ls /etc/nginx/sites-*/ | grep -i openseo || echo 'vhost: няма'
certbot certificates 2>/dev/null | grep -i 'seo.carbonstealth' || echo 'сертификат: няма'
systemctl list-timers --all | grep -i openseo || echo 'таймер: няма'
ss -ltnp | grep -E ':(4340|4341)\b' || echo 'портове: свободни'
ls -d /opt/openseo /etc/openseo /var/backups/openseo 2>/dev/null || echo 'папки: няма'
```

Restic не е засегнат, защото бекъпите на пилота никога не са били в `/var/backups/few-few`.

## 11. Ако пилотът стане продукт (не сега)

Тогава трябват: функция `deploy_openseo` в `deploy/autodeploy.sh` с health маркер
`"status":"ok"` и `LAST_GOOD` за връщане назад; бекъпите в restic и проверка в
`tools/vps/backup-verify.sh verify`; keyword монитор в Uptime Kuma на
`http://127.0.0.1:4340/api/health`. Алармите ги дефинира Наблюдателят. Отделно има нужда от
решение за OpenRouter/ЕС и от правен преглед на Правния Разбирач (DataForSEO като обработващ
данни, международни трансфери).
