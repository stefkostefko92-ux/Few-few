# Разгръщане — FiveM BG

Каноничният поток на репото: GitHub ZIP се качва **ръчно** в `/root`, после
`deploy/autodeploy.sh` върши останалото. Тук е само специфичното за продукта.

## Еднократно, преди първия деплой

1. **DNS** — A/AAAA запис за `fivembulgaria.carbonstealth.eu` към VPS-а.
2. **Nginx** — блокът е готов файл в репото, не откъс в документация:
   ```bash
   sudo cp /opt/few-few/current/FiveM/deploy/nginx.conf /etc/nginx/sites-available/fivembulgaria
   sudo ln -s /etc/nginx/sites-available/fivembulgaria /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d fivembulgaria.carbonstealth.eu
   ```
3. **Ротация на дневниците** — политиката обявява 14 дни, а по подразбиране
   Ubuntu пази nginx дневниците 14 СЕДМИЦИ. Без този файл текстът лъже:
   ```bash
   sudo cp /opt/few-few/current/FiveM/deploy/logrotate.conf /etc/logrotate.d/fivembulgaria
   sudo logrotate -d /etc/logrotate.d/fivembulgaria   # проба
   ```
4. **Docker + Compose** на машината.

## Първо пускане

`autodeploy.sh` върши всичко сам и **сам генерира `.env`**, ако го няма: random
`POSTGRES_PASSWORD`, random админ парола (показва я ВЕДНЪЖ в изхода — запиши я
веднага; в `.env` остава само scrypt хешът) и правилният `PUBLIC_BASE_URL`.

```bash
cd /root && unzip -o Few-few.zip >/dev/null
sudo PROJECTS="fivem" bash /root/few-few-*/deploy/autodeploy.sh
```

Веднага след това **попълни `RESEND_API_KEY`** и пусни пак — без него
уведомленията по чл. 16 и чл. 17 DSA не тръгват.

Ръчният път (ако предпочиташ сам да напишеш тайните):

```bash
cd /opt/few-few/current/FiveM
cp .env.example .env
chmod 600 .env                      # тайните не се четат от друг
npm run admin:hash -- "дълга парола"   # резултатът отива в ADMIN_PASSWORD_HASH
bash scripts/deploy.sh
```

Попълни в `.env`:

| Ключ | Задължителен | Защо |
|---|---|---|
| `POSTGRES_PASSWORD`, `DATABASE_URL` | да | базата |
| `PUBLIC_BASE_URL` | да | canonical, hreflang, OG. **Трябва да е `https://…`** — иначе сесийната бисквитка на панела пада до слабата форма |
| `ADMIN_PASSWORD_HASH` | да | панелът. `npm run admin:hash -- "дълга парола"`; паролата не се пази никъде |
| `RESEND_API_KEY` | **да, на живо** | без него уведомленията по чл. 16 и чл. 17 DSA не тръгват. Липсата се логва, но обещанието остава неизпълнено |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | по избор | откриване на стриймъри (dev.twitch.tv, безплатно) |
| `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` | по избор | същото. Публичният списък на Kick е зад Cloudflare (403) — ключ няма как да се избегне |
| `YOUTUBE_API_KEY` | по избор | същото. Квота: 100 ед. на заявка при 10 000/ден |

Липсваща двойка просто пропуска платформата — cron-ът не пада. TikTok няма
публично откриване на живи излъчвания: каналите там се въвеждат от панела,
раздел „Стриймъри“.

`scripts/deploy.sh` прави останалото в този ред: **бекъп преди миграцията**
(празен бекъп = спиране), `up -d --build`, изчакване на базата,
`prisma migrate deploy`, и първоначално напълване от Cfx.re **само при празна
таблица**. Повторно напълване на ръка: `bash scripts/deploy.sh --discover`.

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
| `discover-streamers twitch kick` | 10 мин | „на живо“ остарява за минути; квотите са щедри |
| `discover-streamers youtube` | 2 ч | 100 ед. на заявка при 10 000/ден — 12 пробега дневно са ~2 400 ед. |
| `prune` | 24 ч | изтрива по обявените в `/privacy` срокове |

**Свалянето на стриймър НЕ е изтриване.** В панела се ползва „свален по
възражение“ (чл. 21 ОРЗД): изтрит запис се появява пак при следващия пробег до
10 минути, а обещаният срок в политиката е 72 часа.

## Nginx

Готовият блок е **`FiveM/deploy/nginx.conf`** — копира се както е (командите са
горе, в „Еднократно“). Не преписвай откъс тук: два конфига за едно нещо се
разминават, а точно тези редове са защита.

Двата реда, които не са настройка: `X-Real-IP` е единственият хедър, от който
приложението чете подателя за тавана на опитите за вход — без него всички опити
изглеждат от един принципал и таванът заключва собственика вместо нападателя.
`CF-Connecting-IP`/`X-Forwarded-For`/`True-Client-IP` се изпразват, защото
доказано с PoC: докато приложението четеше и тях, подхвърлен хедър махаше
тавана, а хедър с IP-то на собственика го заключваше. Ако пред nginx стои
Cloudflare, сложи `TRUST_PROXY_IP_HEADER=cf-connecting-ip` в `.env` **и** остави
Cloudflare да е единственият източник на този хедър.

**Дневникът за достъп е обявен в политиката като 14 дни.** Ако прокси-то пази
по-дълго, текстът лъже — сверявай ги при всяка промяна на конфигурацията.

## След разгръщане

`autodeploy.sh` пуска IndexNow сам при зелена здравна проба (ключът е
`public/indexnow-key.txt`). Ръчно, при нужда:

```bash
node tools/seo/indexnow.mjs https://fivembulgaria.carbonstealth.eu
```

Sitemap-ът и страниците се менят при всяко откриване на нови сървъри и
стриймъри. Google не поддържа IndexNow — за него sitemap-ът е свеж сам.

## Откат

**Откатът НЕ е автоматичен при Docker Compose модела** — за разлика от medqr.
Червена здравна проба само маркира деплоя като провален и спира скрипта; връщаш
се ръчно:

```bash
ls -1dt /opt/few-few/releases/*/            # предишният release е вторият
cd /opt/few-few/releases/<предишният>/FiveM
docker compose up -d --build
sudo ln -sfn /opt/few-few/releases/<предишният> /opt/few-few/current
```

Миграциите са адитивни — откат на кода не иска откат на базата. Ако все пак
трябва: дъмповете са в `/opt/few-few/shared/fivem/backups/` (`pre-deploy-*.sql.gz`),
пази ги `scripts/deploy.sh` ПРЕДИ всяка миграция.
