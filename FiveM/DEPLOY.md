# Разгръщане — FiveM BG

Каноничният поток на репото: GitHub ZIP се качва **ръчно** в `/root`, после
`deploy/autodeploy.sh` върши останалото. Тук е само специфичното за продукта.

## Еднократно, преди първия деплой

1. **DNS — ПЪРВО това, преди certbot.** A (и AAAA само ако сървърът наистина
   отговаря по IPv6) за `fivembulgaria.carbonstealth.eu` към VPS-а. Без запис
   certbot пада с `NXDOMAIN ... During secondary validation`, а Let's Encrypt
   брои неуспешните опити (5/час на домейн) — не пускай certbot „за проба“.
   Сверявай преди него, не след:
   ```bash
   dig +short A fivembulgaria.carbonstealth.eu    # трябва да върне IP-то на VPS-а
   curl -sI http://fivembulgaria.carbonstealth.eu/api/health | head -1   # 200 ОТВЪН
   ```
2. **Nginx** — блокът е готов файл в репото, не откъс в документация. Папката за
   дневниците се създава ПРЕДИ `nginx -t`: сочи ли `access_log` към несъществуваща
   директория, nginx не тръгва изобщо.
   ```bash
   sudo install -d -o www-data -g adm -m 0755 /var/log/nginx/fivembulgaria
   sudo cp /opt/few-few/current/FiveM/deploy/nginx.conf /etc/nginx/sites-available/fivembulgaria
   # `-sfn`, не `-s`: второто пускане на реда гърми с „File exists“ и спира
   # веригата с `&&` след него. Стъпката трябва да е повторяема.
   sudo ln -sfn /etc/nginx/sites-available/fivembulgaria /etc/nginx/sites-enabled/fivembulgaria
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d fivembulgaria.carbonstealth.eu
   ```
   `nginx -t` показва `protocol options redefined` и `ssl_stapling ignored` за
   ЧУЖДИТЕ сайт-блокове на машината — те не идват от този файл и не пречат;
   гледай последния ред (`test is successful`).

   **`cp`-то е еднократно, буквално.** След `certbot --nginx` живият файл вече НЕ
   е копие на репото — certbot е дописал в него `listen 443 ssl`, пътищата до
   сертификата и пренасочването от 80. Презапишеш ли го от репото, TLS изчезва и
   се връща при следващото `certbot renew` чак след дни. Промяна в `nginx.conf`
   след издаден сертификат се нанася с `sed`/редактор върху живия файл (server
   блокът е дублиран от certbot — гледай да пипнеш и двете места), после
   `nginx -t && systemctl reload nginx`.
3. **Ротация на дневниците** — политиката обявява 14 дни. Обявен срок без
   изпълнител е нарушение на чл. 5, ал. 1, б. „д“ ОРЗД. **Изпълнителят е
   `deploy/autodeploy.sh`**, не тази стъпка: при всеки деплой той създава
   подпапката, инсталира `deploy/logrotate.conf` като
   `/etc/logrotate.d/fivembulgaria` и предупреждава при `duplicate log entry`
   (правният одит го извади: докато беше ръчна стъпка, при пропуск срокът ставаше
   не „твърде дълъг“, а БЕЗКРАЕН — глобът на пакетния конфиг не влиза в подпапка).
   Ръчно е нужно само ако пускаш nginx ПРЕДИ първия `autodeploy`:
   ```bash
   sudo cp /opt/few-few/current/FiveM/deploy/logrotate.conf /etc/logrotate.d/fivembulgaria
   # Пробата НЕ е върху нашия файл сам! `logrotate -d /etc/logrotate.d/fivembulgaria`
   # чете само него и по определение не може да види сблъсък с пакетния конфиг.
   # Сблъсъкът се вижда единствено от общия вход:
   sudo logrotate -d /etc/logrotate.conf 2>&1 | grep -i duplicate   # трябва ПРАЗНО
   ```
   Излезе ли ред `duplicate log entry`, някой дневник е обявен два пъти (виж
   защо е фатално в коментара на `deploy/logrotate.conf`) — оправя се, като
   нашите дневници живеят в **подпапка** `/var/log/nginx/fivembulgaria/`, извън
   глоба `/var/log/nginx/*.log` на пакетния конфиг. Сверявай срока и с реалността,
   не само с конфига:
   ```bash
   sudo cat /etc/logrotate.d/nginx | grep -E 'daily|weekly|rotate|maxage'
   ```

   **Ако сървърът ВЕЧЕ върви с дневници право в `/var/log/nginx/`** (инсталиран
   преди подпапката): `autodeploy` инсталира новия logrotate конфиг, но живият
   nginx продължава да пише в старите файлове, новият конфиг ги не вижда
   (`missingok` → върти нула файлове безшумно), а старите остават под глоба на
   пакета и живеят по-дълго от обявените 14 дни. Проверката за `duplicate` е
   празна именно защото конфигът вече не описва реалните файлове — зелено по
   грешна причина. Миграцията е ръчна, еднократна, и се прави със `sed`, не с
   `cp` от репото (certbot е дописал 443 блока в живия конфиг):
   ```bash
   sudo install -d -o www-data -g adm -m 0755 /var/log/nginx/fivembulgaria
   # преместваме и вече завъртените (.1, .2.gz …), за да не останат под пакетния глоб
   sudo bash -c 'shopt -s nullglob; for f in /var/log/nginx/fivembulgaria.*; do
     mv "$f" /var/log/nginx/fivembulgaria/"${f##*/fivembulgaria.}"; done'
   sudo cp -a /etc/nginx/sites-available/fivembulgaria /root/fivembulgaria.nginx.bak
   # и ДВАТА server блока (certbot ги е дублирал) — затова `g`
   sudo sed -i 's#/var/log/nginx/fivembulgaria\.\(access\|error\)\.log#/var/log/nginx/fivembulgaria/\1.log#g' \
     /etc/nginx/sites-available/fivembulgaria
   sudo nginx -t && sudo systemctl reload nginx
   sudo ls -la /var/log/nginx/fivembulgaria/          # nginx пише тук след reload
   ls /var/log/nginx/fivembulgaria.* 2>/dev/null       # трябва да е ПРАЗНО
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

**Панелът НЕ пуска вход, докато TLS не е издаден — и това не е дефект.**
`autodeploy` пише `PUBLIC_BASE_URL=https://…`, значи сесийната бисквитка е
`__Host-fivem-admin` със `Secure`; браузър по обикновен `http://` я отхвърля, и
формата за вход изглежда счупена (връща те на `/admin/login` без грешка). Редът
е: DNS → certbot → вход. **Не** го „поправяй“, като смениш `PUBLIC_BASE_URL` на
`http://` — това сваля бисквитката до слабата форма завинаги, а после лесно се
забравя.

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
| `KICK_LANGUAGE`, `KICK_CATEGORY_ID` | по избор | заковават недокументирани стойности. Не намира ли Kick никого: `docker compose exec -T cron npx tsx scripts/kick-doctor.ts` |
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

## Проверки срещу жив инстанс (преди пускане)

Двете не са в `npm test` и не са в CI — искат жив сайт и база:

```bash
node scripts/smoke.mjs                                   # адреси, JSON-LD, панел, правни котви, ключови думи
PROBE_ADMIN_PASSWORD="…" node scripts/authz-probe.mjs    # авторизация, с положителна контрола
```

`smoke.mjs` хваща точно това, което `npm test` и `next build` НЕ хващат:
компилиращ се код, който гърми при реален рендер. `authz-probe.mjs` доказва,
че мутация без сесия не минава — и го доказва С положителна контрола, тоест
първо показва, че харнесът изобщо стига до действието.

`authz-probe.mjs` иска три неща и без тях излиза с **2 = НЕИЗМЕРЕНО** (не с
„чисто“ — това е нарочно):

| Какво | Защо |
|---|---|
| `playwright` или `playwright-core` | заявката се ЗАПИСВА от истински браузър; ръчно сглобена заявка Next я отхвърля преди действието |
| `DATABASE_URL` до живата база | положителната контрола сверява базата преди и след натискането |
| поне един стриймър в панела | няма ли какво да се натисне, няма и мутация за повтаряне |

Базата слуша само вътре в Docker мрежата (в `docker-compose.yml` няма
публикуван порт за `db` — това е нарочно). За пробата ползвай адреса на
контейнера: `docker inspect fivem-db-1 -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`
и подмени `@db:` в `DATABASE_URL`.

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
