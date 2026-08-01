# Разгръщане — FiveM BG

Каноничният поток на репото: GitHub ZIP се качва **ръчно** в `/root`, после
`deploy/autodeploy.sh` върши останалото. Тук е само специфичното за продукта.

## Първо пускане

```bash
cd /opt/few-few/current/FiveM
cp .env.example .env
chmod 600 .env                      # тайните не се четат от друг
```

Попълни в `.env`:

| Ключ | Задължителен | Защо |
|---|---|---|
| `POSTGRES_PASSWORD`, `DATABASE_URL` | да | базата |
| `PUBLIC_BASE_URL` | да | canonical, hreflang, OG. **Трябва да е `https://…`** — иначе сесийната бисквитка на панела пада до слабата форма |
| `ADMIN_PASSWORD_HASH` | да | панелът. `npm run admin:hash -- "дълга парола"`; паролата не се пази никъде |
| `RESEND_API_KEY` | **да, на живо** | без него уведомленията по чл. 16 и чл. 17 DSA не тръгват. Липсата се логва, но обещанието остава неизпълнено |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | по избор | откриване на стриймъри |
| `YOUTUBE_API_KEY` | по избор | същото |

После:

```bash
docker compose up -d --build
docker compose exec web npx prisma migrate deploy
docker compose exec web npx tsx scripts/discover-servers.ts   # първо напълване
```

Здравната проба трябва да върне `{"status":"ok"}`:

```bash
wget -qO- http://127.0.0.1:3010/api/health
```

## Периодични задачи

Вървят в контейнера `cron`, не на хоста — така носят същите зависимости и
същия `.env`:

| Задача | Интервал | Защо толкова |
|---|---|---|
| `refresh-servers` | 3 мин | жив статус; пингва само одобрените |
| `discover-servers` | 45 мин | снапшотът на Cfx.re е около 19 MB — по-често е неприлично |
| `prune` | 24 ч | изтрива по обявените в `/privacy` срокове |

## Nginx

```nginx
location / {
  proxy_pass http://127.0.0.1:3010;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Real-IP` не е козметика: без него всички опити за вход изглеждат от един
принципал и таванът заключва собственика вместо нападателя.

**Дневникът за достъп е обявен в политиката като 14 дни.** Ако прокси-то пази
по-дълго, текстът лъже — сверявай ги при всяка промяна на конфигурацията.

## След разгръщане

```bash
node tools/seo/indexnow.mjs https://<домейн>
```

Sitemap-ът и страниците се менят при всяко откриване на нови сървъри.

## Откат

`autodeploy.sh` пази предишния релийз и се връща сам при червена здравна проба.
Ръчно: `docker compose down`, после `docker compose up -d` в предишната папка.
Миграциите са адитивни — откат на кода не иска откат на базата.
