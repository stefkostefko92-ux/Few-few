# Piuma — разгръщане в продукция

Docker Compose на VPS-а, зад nginx на хоста с Let's Encrypt. Четири услуги вървят:
`db` (PostgreSQL 16) · `redis` · `app` (панел + витрина + `/agent/v1`) · `worker`
(публикуване · подновяване на токени · чистене на сесии · Insights · автопилот).
Втори nginx вътре в Compose няма — само отдалечава адреса на клиента с още един скок.

Каноничният поток на монорепото важи и тук: качваш архива в `/root` **ръчно**, пускаш
`deploy/autodeploy.sh`, той разгръща и Piuma. Този документ е за **еднократните** стъпки,
които скрипт не може да направи вместо теб — защото искат тайни от конзолата на Meta,
парола на човек и одобрение в панела.

---

## 0. Какво трябва да имаш преди да започнеш

| Нещо                                                                 | Откъде                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| DNS `A`/`AAAA` запис за `piuma.carbonstealth.eu` → VPS-а             | регистраторът на домейна                                    |
| Meta App с продукт **Instagram** (Instagram Login)                   | developers.facebook.com → My Apps                           |
| `IG_APP_ID` + `IG_APP_SECRET`                                        | същото приложение → Instagram → API setup                   |
| Instagram **професионален** акаунт (Business/Creator), свързан ръчно | инвариант 1 — Meta забранява автоматизирано създаване       |
| `ANTHROPIC_API_KEY` _(по избор)_                                     | console.anthropic.com — без него черновите се пишат на ръка |

Разрешенията (`IG_SCOPES`) искат преглед от Meta преди да излязат от режим
„разработка". Подготовката е работа на **Тайния агент** (агентът за одобрения).

---

## 1. Тайните (еднократно, на сървъра)

Живеят **само** на машината, mode 600, никога в репото и никога в архива.

```bash
sudo install -d -m 700 /opt/few-few/shared
sudo install -m 600 /dev/null /opt/few-few/shared/piuma.env
sudo nano /opt/few-few/shared/piuma.env      # шаблонът е piuma/.env.example
```

Минималният пълен набор (празно поле = приложението отказва да тръгне, нарочно):

```ini
NODE_ENV=production
PUBLIC_BASE_URL=https://piuma.carbonstealth.eu
HTTP_PORT=4310

POSTGRES_PASSWORD=<openssl rand -base64 32 | tr -dc 'A-Za-z0-9'>
TOKEN_ENC_KEY=<openssl rand -hex 32>

IG_APP_ID=<от Meta>
IG_APP_SECRET=<от Meta>
IG_REDIRECT_URI=https://piuma.carbonstealth.eu/auth/instagram/callback
IG_GRAPH_VERSION=v24.0

TOTP_ISSUER=Piuma
ANTHROPIC_API_KEY=<по избор>

# Часовникът на ПУБЛИКАТА, не на машината (по подразбиране Europe/Sofia).
TZ=Europe/Sofia
```

> **`TZ` не е козметика.** В този часовник се смятат поясите, от които се учи („вечер
> работи по-добре"), И в него планировчикът насрочва. Оставиш ли процеса на UTC срещу
> българска публика, изводът и насрочването се разминават с 2–3 часа, без никой да се
> оплаче. Резюмето на `insights` изписва зоната точно затова — за да се види.

> **`TOKEN_ENC_KEY` е еднопосочна врата.** С нея се криптират Instagram токените, TOTP
> тайните и агентските ключове. Смениш ли я, всичко съхранено става нечетимо и
> акаунтите се свързват наново. Запиши я в password manager **преди** първия деплой.

`autodeploy.sh` търси `.env` до `docker-compose.yml`, затова го сложи там веднъж:

```bash
sudo cp /opt/few-few/shared/piuma.env /opt/few-few/current/piuma/.env
sudo chmod 600 /opt/few-few/current/piuma/.env
```

Оттук нататък всеки следващ деплой го **пренася сам** от текущия release.
Няма `.env` → скриптът пропуска Piuma с предупреждение и **не измисля тайни**:
полу-вдигнат панел, който държи чужди токени, е по-лош изход от ясен отказ.

---

## 2. nginx + TLS (еднократно)

Конфигът е файл в репото, не се пише на ръка на сървъра:

```bash
sudo cp /opt/few-few/current/piuma/deploy/nginx/piuma.carbonstealth.eu.conf \
        /etc/nginx/sites-available/piuma
sudo ln -sfn /etc/nginx/sites-available/piuma /etc/nginx/sites-enabled/piuma
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d piuma.carbonstealth.eu
```

CSP, HSTS и Referrer-Policy ги задава **самото приложение** (helmet, с nonce на заявка).
nginx нарочно не ги дублира — два източника на един заглавен ред се разминават тихо.

---

## 3. Деплой

```bash
cd /root && unzip -o Few-few.zip >/dev/null
sudo bash /root/few-few-*/deploy/autodeploy.sh
# само Piuma:
sudo PROJECTS="piuma" bash /root/few-few-*/deploy/autodeploy.sh
```

Скриптът строи образа, вдига услугите и проверява две неща поотделно:

- `http://127.0.0.1:4310/health` → `{"status":"ok","db":"ok"}`;
- че **работникът тича**. Панелът може да е съвсем жив, докато публикуването,
  подновяването на токени и Insights са мъртви — тогава одобреният пост просто
  не излиза и мълчи.

Миграциите се прилагат от entrypoint-а на контейнера с `prisma migrate deploy`
(**никога** `db push`), преди приложението да поеме заявки.

---

## 4. Първият човек (еднократно)

Панелът няма как да се отвори без потребител, а скрипт няма право да измисля парола.

```bash
cd /opt/few-few/current/piuma
sudo docker compose exec \
  -e OWNER_EMAIL=admin@carbonstealth.eu \
  -e OWNER_NAME="Собственик" \
  -e OWNER_PASSWORD='…по фирмения шаблон…' \
  app npm run owner:create
```

Влез на `https://piuma.carbonstealth.eu/admin`, включи 2FA (TOTP) **веднага** и
запази резервните кодове извън сървъра.

---

## 5. Агентският ключ (еднократно, от панела)

Ключът се създава **само** от влязъл човек с право `keys:manage`. Няма маршрут, през
който агент да си издаде ключ — това е нарочно.

1. `/admin` → **Агентски ключове** → нов ключ.
2. Име: `socialdjiyata`.
3. Обхвати: `brands:read` · `accounts:read` · `drafts:read` · `drafts:write` ·
   `insights:read`. **Нищо повече** — маршрути за одобрение/публикуване не съществуват
   и за най-широкия ключ, но тесният обхват е втората стена.
4. Ограничи до конкретните брандове и, ако агентът тръгва от познат адрес, до IP.
5. Срок: сложи такъв. Ключ без срок живее, докато някой не се сети.

Тайната (`pk_…`) се показва **един път**. В базата стои само криптираната ѝ форма —
изгубиш ли я, издаваш нова и отменяш старата.

На машината, от която агентът работи:

```bash
sudo install -d -m 700 /etc/piuma
sudo install -m 600 /dev/null /etc/piuma/agent.env
sudo tee /etc/piuma/agent.env >/dev/null <<'EOF'
PIUMA_URL=https://piuma.carbonstealth.eu
PIUMA_KEY_ID=<id от панела>
PIUMA_KEY_SECRET=pk_<тайната, показана веднъж>
EOF
```

Проверка от машината на агента:

```bash
PIUMA_ENV_FILE=/etc/piuma/agent.env node tools/social/piuma.mjs brands
PIUMA_ENV_FILE=/etc/piuma/agent.env node tools/social/piuma.mjs insights --brand <slug>
```

---

## 6. Свързване на Instagram акаунта (еднократно, от панела)

`/admin` → **Акаунти** → „Свържи с Instagram". OAuth-ът иска акаунтът да е
професионален и да си негов администратор. Токенът се криптира в покой и се подновява
от работника; `instagram_business_manage_insights` е задължителен — без него слоят,
който учи от числата, няма какво да чете.

---

## 7. Проверка, че наистина работи

```bash
cd /opt/few-few/current/piuma
sudo docker compose ps                       # db · redis · app · worker = running
curl -fsS https://piuma.carbonstealth.eu/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://piuma.carbonstealth.eu/    # витрината: 200
sudo docker compose logs --tail 50 worker
```

Готово = четирите услуги тичат · `/health` дава `200` с `db: ok` · витрината се отваря ·
панелът иска 2FA · `piuma.mjs brands` връща бранд · работникът е в дневника без грешки.

---

## 8. Бекъп и връщане назад

Данните живеят в именувани Docker томове (`piuma_db-data`, `piuma_redis-data`) — те
**преживяват** деплоя, защото кодът се сменя, а томовете не.

```bash
# бекъп на базата (преди всяка миграция)
cd /opt/few-few/current/piuma
sudo docker compose exec -T db pg_dump -U piuma piuma | gzip > /var/backups/piuma-$(date +%F).sql.gz

# връщане към предишен release
sudo RELEASE_DIR=/opt/few-few/releases/<по-стар> PROJECTS="piuma" \
     bash /opt/few-few/current/deploy/autodeploy.sh
```

Връщането назад връща **кода**, не схемата. Миграция, която маха колона, не се отменя от
стар образ — затова бекъпът преди миграция не е формалност.
