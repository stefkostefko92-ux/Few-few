# Деплой на VPS (zabobovdol.carbonstealth.eu)

Ръководство за пускане на сайта на собствен VPS с Docker.

## 1. Изисквания

- VPS с Linux (Ubuntu/Debian), 1+ GB RAM.
- Инсталирани **Docker** и **Docker Compose**.
- Домейн `zabobovdol.carbonstealth.eu`, чийто A-запис сочи към IP на VPS.

## 2. Качване на кода

```bash
git clone <вашето репо> zabobovdol && cd zabobovdol/zabobovdol
# (проектът е в подпапката zabobovdol/)
```

## 3. Конфигурация

```bash
cp .env.example .env
```

Задайте задължително:

- `AUTH_SECRET` — дълъг случаен низ: `openssl rand -base64 48`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — данни за първия администратор
- `NEXT_PUBLIC_SITE_URL=https://zabobovdol.carbonstealth.eu`
- `POSTGRES_PASSWORD` — силна парола за базата (ползва се от docker-compose)

## 4. Стартиране

```bash
docker compose up -d --build
```

При първото стартиране приложението само създава таблиците в базата
(`prisma db push`). След това заредете администратора и примерните данни:

```bash
docker compose exec app npm run db:seed
```

По избор — заредете реалните обекти в Бобов дол (институции и бизнеси, събрани
от публични източници; скрива примерните записи):

```bash
docker compose exec app npm run db:seed:business
```

Сайтът е достъпен на `http://<IP>` (порт 80). Вход в админ: `/admin/login`.

## 5. HTTPS (силно препоръчително)

Вариант с Let's Encrypt (certbot) на хоста:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d zabobovdol.carbonstealth.eu
```

Копирайте сертификатите:

```bash
mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/zabobovdol.carbonstealth.eu/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/zabobovdol.carbonstealth.eu/privkey.pem  nginx/certs/
```

После:

1. В `docker-compose.yml` разкоментирайте порт `443` и реда за `./nginx/certs`.
2. В `nginx/zabobovdol.conf` разкоментирайте `server { listen 443 ssl; … }`.
3. `docker compose up -d`

Подновяване на сертификата: настройте cron за `certbot renew` + копиране на
файловете + `docker compose restart nginx`.

## 6. Поддръжка

```bash
# Логове
docker compose logs -f app

# Рестарт
docker compose restart app

# Резервно копие на базата
docker compose exec db pg_dump -U zabobovdol zabobovdol > backup_$(date +%F).sql

# Възстановяване
cat backup.sql | docker compose exec -T db psql -U zabobovdol zabobovdol
```

## 7. Обновяване на кода

```bash
git pull
docker compose up -d --build
```

Схемата се синхронизира автоматично при старт. Промени, които заличават данни,
изискват ръчна намеса (вижте Prisma migrations за продукционна история).

## 8. Включване на AI чатбота (по избор)

В `.env` сменете `CHAT_PROVIDER=anthropic` и добавете `ANTHROPIC_API_KEY`, после
`docker compose up -d`. Без ключ помощникът работи на база съдържанието.

## 9. Внасяне на новини от общината (по избор)

Сайтът може да внася новини от общината като **чернови** за ръчно одобрение.

- Ръчно: в админ панела → „Новини от общината“ → бутон „Внеси новини“.
- Автоматично (cron): задайте `INGEST_TOKEN` в `.env` и насрочете на VPS-а:

```bash
# всеки ден в 7:00 — внася чернови (публикуването остава ръчно)
0 7 * * * curl -s "https://zabobovdol.carbonstealth.eu/api/ingest-news?token=ТАЙНА" >/dev/null
```

Адресът на източника се задава с `MUNICIPALITY_NEWS_URL` (RSS канал или HTML
списък). Внасят се заглавие, кратко резюме и линк към оригинала — не пълният
текст. Ако източникът е HTML (без RSS), четецът работи на принципа „най-добро
усилие“ и при промяна на сайта на общината може да се наложи дребна донастройка.
