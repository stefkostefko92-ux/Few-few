# Разгръщане — ERP Ascensori Enterprise

Инсталация при клиент: Ubuntu VPS в ЕС, Docker Compose, Nginx + Let's Encrypt.
От чиста машина до работеща система — под час.

---

## 0. Преди да започнеш — две решения, които после болят

**Едно- или многофирмена инсталация.** Филтърът по фирма е затворен по
подразбиране: `tenantId = null` е валидна стойност и се третира като отделен
обхват.

- **Една фирма (обичайното):** остави всичко с `tenantId = null`. Не създавай
  запис в `Tenant`. MASTER вижда всичко, защото и той е в същия обхват.
- **Много фирми:** създай `Tenant` за всеки клиент и давай на потребителите му
  съответния `tenantId`. MASTER остава без фирма — той вижда потребителите и
  одита на всички (ниво на доставчика), но **не** вижда бизнес-данните им.

Смесването на двата модела е тих източник на „изчезнали“ записи. Избери един и
го запиши като коментар в `.env` на машината.

**Една реплика.** Ограничението на заявките е в паметта на процеса
(`src/lib/rate-limit.ts`). Две реплики значат двойно по-висок ефективен таван
при вход. Мащабиране изисква споделено хранилище (Redis) — днес не го прави.

---

## 1. Подготовка на машината

```bash
apt update && apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

Разархивирай продукта в `/opt/erp-ascensori` (или дай пътя на `autodeploy.sh`).

## 2. Тайни

```bash
cd /opt/erp-ascensori
bash scripts/setup-env.sh          # генерира ключовете, mode 600, идемпотентно
```

Скриптът създава `.env` от `.env.example` и попълва `SESSION_SECRET`,
`AUDIT_HMAC_KEY` (различни, по 64 hex знака), `POSTGRES_PASSWORD` и
`HEALTH_TOKEN`. Ако `.env` вече съществува, попълва само празните.

Задай ръчно `TRUSTED_PROXY_HOPS` (1 при един Nginx, 2 зад Cloudflare) и
`BACKUP_AGE_RECIPIENT`.

> **`AUDIT_HMAC_KEY` е доказателственият ключ.** С него се проверява целият
> регистър на операциите. Ротацията минава през `AUDIT_HMAC_KEY_PRECEDENTE`
> (виж § 7б) — старият ключ се приема САМО при проверка. Загубата на двата
> прави досегашния регистър непроверим, затова ключът се бекъпва **заедно** с
> базата и се пази поне колкото най-стария одитен ред (10 години). Копие в
> мениджъра на пароли, извън тази машина.

## 3. Първо пускане

```bash
docker compose up -d --build
docker compose logs -f app          # изчакай „Схемата е приложена"
```

Entrypoint-ът изчаква базата и прилага миграциите. При заварена база без
история (P3005) маркира baseline-а `0_init` и продължава — само при този код,
никога при друга грешка.

## 4. Първият акаунт

```bash
docker compose run --rm -e MASTER_EMAIL=titolare@azienda.it app node scripts/crea-master.mjs
```

Паролата се показва **веднъж** и не се пази никъде. Смени я при първия вход.

> **Не пускай `npm run db:seed` при клиент.** Сийдът зарежда демо данни със
> седем акаунта и парола, публикувана в README-то.

## 5. Nginx и TLS

Копирай `deploy/nginx/erp-ascensori.conf`, смени домейна, после:

```bash
ln -s /etc/nginx/sites-available/erp-ascensori.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d erp.azienda.it
```

Две неща в конфигурацията, които не са козметика:

- `proxy_set_header X-Forwarded-For $remote_addr;` — **задава**, не добавя.
  `$proxy_add_x_forwarded_for` би позволил на клиента да инжектира префикс и с
  `TRUSTED_PROXY_HOPS=1` да подправи IP-то в одита и в ограничението.
- `client_max_body_size 16m` — импортът праща до 2000 реда наведнъж; при 1 MB
  по подразбиране импортите се секат.

Здравните маршрути са ограничени до localhost и IP-то на мониторинга:
`/api/healthz/automatismi` издава кога за последно е минал автоматизмът.

## 6. Автоматизми

Услугата `automatismi` в Compose ги пуска сама:

| Кога | Какво | Защо не може да спре |
|---|---|---|
| всеки ден 05:00 | `contratti` | ражда периодичните посещения и фактурите за canone — това е приходът на клиента |
| всеки ден 06:00 | `scadenze:check` | вдига праговете 90/60/30 по законовите срокове — това е основната функция на продукта |
| неделя 04:00 | `retention` | прочистване по срок; GDPR чл. 5(1)(д) |

Проверка, че живеят:

```bash
curl -fsS http://127.0.0.1:3050/api/healthz/automatismi   # 503 = не е минал за 26 ч
```

## 7. Мониторинг

Три монитора (Uptime Kuma или каквото ползваш):

| Проверка | Интервал | Приемливо |
|---|---|---|
| `GET /api/readyz` | 60 s | 200 |
| `GET /api/healthz/automatismi` | 30 min | 200 |
| `GET /api/metrics` (скрейп от Prometheus) | 30 s | 200 |
| срок на TLS сертификата | 1 ден | > 14 дни |

Метриките, целите (SLO) и правилата за алармите са в
[`docs/OSSERVABILITA.md`](docs/OSSERVABILITA.md); готовите правила — в
[`deploy/prometheus/erp-ascensori.rules.yml`](deploy/prometheus/erp-ascensori.rules.yml).
Алармите са по **симптом** и по скорост на изгаряне на бюджета за грешки, не по
праг „5 % за 5 минути" — той едновременно буди без причина и пропуска бавното
изтичане.

Подробната диагностика на `readyz` иска хедър `x-health-token`. Без него
отговорът е само „готов/не готов“ — вътрешното състояние не е за пред публиката.

**Гледай полето `rls`.** То казва дали втората линия на изолацията между фирмите
е реално включена. Отговорът с валиден хедър изглежда така:

```json
{ "pronto": true, "db": true, "schema": true, "chiavi": true, "rls": true }
```

`"rls": false` с `rlsMotivo: "il ruolo applicativo è superuser"` значи, че
политиките са там, но Postgres ги подминава: суперпотребителят ги заобикаля
безусловно, дори при `FORCE ROW LEVEL SECURITY`. Официалният образ създава
`POSTGRES_USER` именно като суперпотребител, затова миграцията го понижава
(запазвайки `CREATEDB`). Ако някой го е върнал ръчно:

```bash
docker compose exec -T db psql -U postgres -c 'ALTER ROLE erp NOSUPERUSER CREATEDB'
```

## 7б. Смяна на `AUDIT_HMAC_KEY`

Ключът подписва одита; смяната му прави досегашните редове непроверими, ако
старият изчезне. Затова:

1. Премести текущата стойност в `AUDIT_HMAC_KEY_PRECEDENTE`.
2. Сложи новата в `AUDIT_HMAC_KEY` (мин. 32 знака, различна от `SESSION_SECRET`).
3. Рестартирай и провери: `POST /api/audit/verifica` трябва да върне
   `integro: true`, а редовете на стария ключ да излизат в `conChiaveVecchia`.
4. Махни `AUDIT_HMAC_KEY_PRECEDENTE`, чак когато `conChiaveVecchia` е празен
   (тоест старите редове са изтекли по срок).

Предишният ключ се приема **само при проверка** — никога при подписване.

## 8. Бекъп и възстановяване

Услугата `backup` прави дневен `pg_dump -Fc` в 03:00, криптира го с `age` и
пази 31 дни. Частният ключ **не е на този сървър**.

Какво се бекъпва: базата и `.env`. Приложението не пише по файловата система
(`impianti_media` пази пътища, не съдържание), затова том за качени файлове няма.

**Възстановяване — редът има значение:**

```bash
# 1) ПЪРВО тайните
cp /trezor/.env /opt/erp-ascensori/.env && chmod 600 /opt/erp-ascensori/.env
# 2) после базата
age -d -i /trezor/age.key erp-20260725.dump.age > /tmp/erp.dump
docker compose up -d db
# `--exit-on-error`: без него pg_restore изрежда грешките и пак излиза с код 0
docker compose exec -T db pg_restore -U erp -d erp_ascensori --clean --if-exists \
  --exit-on-error < /tmp/erp.dump
docker compose up -d
# 3) и накрая доказателството, че одитът е цял
curl -s -X POST -H 'Content-Type: application/json' -d '{"limite":1000}' \
     --cookie "$SESSIONE" http://127.0.0.1:3050/api/audit/verifica
```

Обратният ред дава масови „манипулирани“ редове — фалшива тревога, която във
фискален контекст струва време и доверие.

**Тествай възстановяването месечно** — с реален restore, не на око:

```bash
cd /opt/erp-ascensori/current/erp-ascensori
BACKUP_SORGENTE_URL="$DATABASE_URL" npm run verifica:backup -- /backup/erp-20260725.dump.age
```

Скриптът възстановява дъмпа в отделна временна база, сверява го и я трие.
Проверява четири неща: таблиците не са празни · броят редове съвпада с източника
(защитата от **частичен** дъмп) · веригата на одита е цяла · политиките
`tenant_isolation` са налице.

**Две неща около RLS, които чупят бекъпа тихо:**

- `pg_dump` ОТКАЗВА да дъмпне таблица с политика, ако ролята не я заобикаля.
  Затова командата в `docker-compose.yml` носи `--enable-row-security` и
  `PGOPTIONS="-c app.tenant_id=*"` (изричният обхват на доставчика). Ако смениш
  бекъп командата, пренеси и двете.
- `pg_restore` излиза с код **нула** дори при грешки („errors ignored on restore").
  Без `--exit-on-error` половин база минава за успешна.

Бекъп без тестван restore не е бекъп.

## 9. Обновяване

```bash
cd /opt/erp-ascensori && docker compose up -d --build
```

Entrypoint-ът прилага новите миграции преди старта. `.env` и томът с базата
преживяват обновяването. Прекъсването е няколко секунди; за нула прекъсване —
`tools/vps/blue-green.sh`.

## 10. Отстраняване на проблеми

| Симптом | Причина | Действие |
|---|---|---|
| контейнерът спира веднага | липсваща/къса тайна | `docker compose logs app` — валидацията при старт казва коя |
| `503` + `Retry-After` | базата не отговаря | `docker compose ps db`, `logs db` |
| `/api/healthz/automatismi` дава 503 | cron-ът не е минал за 26 ч | `docker compose logs automatismi` |
| „ALTERAZIONE RILEVATA“ след restore | базата е върната преди `.env` | върни правилния `AUDIT_HMAC_KEY` |
| всички влизания дават 429 | `TRUSTED_PROXY_HOPS=0` зад прокси | сложи 1 (или 2 зад Cloudflare) |
| импортът се къса на големи файлове | `client_max_body_size` | 16m в Nginx |
