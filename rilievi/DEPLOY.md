# Деплой — Rilievi Impianti

Docker Compose (PostgreSQL 16 + приложението на `127.0.0.1:4330`) зад nginx на хоста с Let's Encrypt.
Тайните са само на сървъра: `/opt/few-few/shared/rilievi/.env` (600). Всичко по-долу — като root.

Нужни на VPS-а: Docker с compose plugin, nginx, certbot (същите като за korpora/piuma).

## 0. Първо сваляне на кода

```bash
sudo REF=main PROJECTS="rilievi" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

Без `.env` скриптът казва „тази машина още не е настроена“ и пропуска rilievi (код 3 — не е провал), но
кодът вече е в `/opt/few-few/current/rilievi/`. До сливане в `main` вместо `REF=main` — името на клона.

## 1. Тайните (веднъж)

```bash
sudo bash /opt/few-few/current/rilievi/deploy/setup-env.sh
```

Генерира `POSTGRES_PASSWORD` и `JWT_SECRET` (`openssl rand -hex 32`), пише `PUBLIC_BASE_URL` и пита
само за Brevo SMTP. Без SMTP порталът работи: поканите и връзките за нова парола се показват на екрана
за копиране. Съществуващ `.env` не се пипа — промяна: `sudoedit /opt/few-few/shared/rilievi/.env`.

## 2. DNS и TLS сертификат (веднъж)

`A` запис `rilievi.carbonstealth.eu` → IP-то на VPS-а (ако няма wildcard за `*.carbonstealth.eu`).
Когато DNS сочи насам:

```bash
sudo certbot certonly --nginx -d rilievi.carbonstealth.eu --deploy-hook 'systemctl reload nginx'
```

Само сертификат: vhost-ът (`deploy/nginx/rilievi.carbonstealth.eu.conf`) го слага деплоят, щом
сертификатът го има.

## 3. Деплой

```bash
sudo REF=main PROJECTS="rilievi" bash /opt/few-few/current/deploy/fetch-deploy.sh
```

`deploy/deploy.sh` (вика го autodeploy; същият е и за ръчен деплой от папката на release-а):

1. `.env` от `/opt/few-few/shared/rilievi/` в release-а; проверка на паролата и ключа;
2. `docker compose build app` — провал тук не пипа работещите контейнери (код 1);
3. бекъп на базата ПРЕДИ миграцията (`backups/pre-deploy-*.sql.gz`, последните 5) — без бекъп няма
   миграция;
4. `docker compose up` — entrypoint-ът пуска `prisma migrate deploy` (никога `db push`);
5. чака `/health` да върне `{"status":"ok","app":"rilievi"}`; иначе код 4 и autodeploy връща
   последния работещ release;
6. записва release-а в `/opt/few-few/shared/rilievi/last-good`, слага дневния бекъп и vhost-а в nginx
   (`nginx -t`, после reload; при грешка връща стария).

## 4. Първият MASTER (веднъж)

```bash
sudo bash /opt/few-few/current/rilievi/deploy/create-master.sh
```

Пита имейл (по подразбиране `admin@carbonstealth.eu`), име и парола (скрито, два пъти; поне 12 знака).
Паролата стига до контейнера през stdin — не остава в историята и не се вижда в `ps`. Всички останали
влизат САМО с покана: **Utenti → Invita utente**.

## 5. Проверка

```bash
curl -fsS https://rilievi.carbonstealth.eu/health      # {"status":"ok","app":"rilievi"}
curl -sI https://rilievi.carbonstealth.eu/accesso | grep -i -E 'content-security-policy|strict-transport'
```

## 6. Бекъпи

- Преди всяка миграция: `/opt/few-few/shared/rilievi/backups/pre-deploy-*.sql.gz` (последните 5).
- Дневно 03:10 UTC: `rilievi-backup.timer` → `backups/daily/rilievi-*.sql.gz` (последните 14).
  Ръчно: `sudo bash "$(sudo cat /opt/few-few/shared/rilievi/last-good)/deploy/backup.sh"`.
- Бекъп на същия диск не пази от загуба на диска: копирай `backups/daily/` извън сървъра (VPS
  Dashboard, Storage Box или `rsync` към друг сървър).

Възстановяване (дъмпът е с `--clean --if-exists` — заменя съществуващите таблици):

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
sudo docker compose stop app
zcat /opt/few-few/shared/rilievi/backups/daily/rilievi-<дата>.sql.gz |
  sudo docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U rilievi -d rilievi
sudo docker compose start app
```

## 7. Провалена миграция

В `docker compose logs app` има `P3018`, а при всеки следващ старт `P3009`; autodeploy тогава не
връща кода (старият би спрял на същото), а казва къде е дъмпът. От папката на последния работещ release:

```bash
cd "$(sudo cat /opt/few-few/shared/rilievi/last-good)"
sudo docker compose exec -T db psql -U rilievi -d rilievi -c \
  'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'
# а) данните са цели (PostgreSQL връща паднала миграция цялата) — обичайното:
sudo docker compose run --rm --no-deps --entrypoint ./node_modules/.bin/prisma app \
  migrate resolve --rolled-back <име_на_миграцията>
sudo RILIEVI_SKIP_BACKUP=1 bash "$PWD/deploy/deploy.sh"
# б) данните трябва да се върнат: възстановяване от pre-deploy дъмпа (т. 6), после същото.
```

## Порт и домейн

Порт `4330` (свободен във флота; `HTTP_PORT` в `.env` го сменя — deploy.sh вписва новия във vhost-а).
Друг домейн = нов vhost `deploy/nginx/<домейн>.conf` в репото + `RILIEVI_DOMAIN=<домейн>` при
`setup-env.sh` и при деплой (+ сертификат за него).
