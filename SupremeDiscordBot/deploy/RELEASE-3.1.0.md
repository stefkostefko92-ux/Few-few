# Release 3.1.0 — деплой runbook

Канонично: качваш ZIP в `/root`, пускаш `autodeploy.sh`. Този документ покрива
**еднократните стъпки специфични за 3.x цикъла** (3.0.0 + 3.1.0 се деплойват заедно) — след тях следващите релийзи са
пак „качи → една команда".

## 0. Преди деплоя (5 мин, на сървъра)

```bash
# 0.1 Ръчен бекъп (задължителен по deploy дисциплината, независимо от скрипта)
docker compose -f /opt/few-few/current/SupremeDiscordBot/docker-compose.yml \
  exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip \
  > /var/backups/supreme-manual-$(date +%F-%H%M).sql.gz
ls -la /var/backups/supreme-manual-*.gz   # провери ненулев размер!

# 0.2 Паролата за автоматичните бекъпи (еднократно; пази копие ИЗВЪН сървъра)
openssl rand -base64 32 > /root/.supreme-backup-pass && chmod 600 /root/.supreme-backup-pass
```

## 1. Нови env променливи (backend/.env на сървъра)

```bash
# Stripe тарифи (излизат от: STRIPE_SECRET_KEY=sk_live_... bash scripts/stripe-setup.sh)
STRIPE_PRICE_PREMIUM_MONTH=price_...
STRIPE_PRICE_PREMIUM_YEAR=price_...
STRIPE_PRICE_WHITELABEL_MONTH=price_...
STRIPE_PRICE_WHITELABEL_YEAR=price_...
STRIPE_PRICE_AGENCY5_MONTH=price_...
STRIPE_PRICE_AGENCY5_YEAR=price_...
STRIPE_PRICE_AGENCY10_MONTH=price_...
STRIPE_PRICE_AGENCY10_YEAR=price_...
STRIPE_PORTAL_CONFIGURATION_ID=bpc_...      # също от скрипта

# AI (смяна: ANTHROPIC_API_KEY вече НЕ се ползва — може да го изтриеш)
GEMINI_API_KEY=...                          # aistudio.google.com/apikey (безплатен)
# GEMINI_MODEL="gemini-2.5-flash"           # по избор (това е default)

# По избор (при активиране):
# DISCORD_SKU_PREMIUM=... DISCORD_SKU_WHITELABEL=...   (native монетизация; и в bot/.env)
# TOPGG_WEBHOOK_AUTH=...                                (при листване в top.gg)
```

`stripe-setup.sh` е идемпотентен — пусни го преди деплоя, той печата точните
стойности + ръчните Dashboard стъпки (statement descriptor, invoice footer,
Tax настройки). Ще преизползва съществуващите цени по lookup_key.

## 2. Деплой (каноничният поток)

```bash
cd /root && unzip -o Few-few.zip >/dev/null
sudo PROJECTS="SupremeDiscordBot" bash /root/few-few-*/deploy/autodeploy.sh
```

Новото в autodeploy за supreme: **fail-closed pre-deploy pg_dump** (спира преди
миграция при провален дъмп) + инсталира `supreme-backup.timer` (дневен шифрован
бекъп 03:00 UTC) след успешен health.

Миграции в този релийз (прилагат се автоматично; v27-v30 доказани срещу
чиста база, v31-v32 са адитивни по същия модел):
- v27 тарифи+Agency (grandfather: текущите premium → whitelabel)
- v28 User.email · v29 canned responses · v30 ticket priorities + 12 индекса
- v31 SLA (панелни цели + тикет маркери) · v32 Knowledge base

Известно безвредно: `webhooks.updatedAt` има DB default от стара миграция,
който schema-та не декларира — козметика, НЕ пипай.

## 3. След деплоя (проверки, 5 мин)

```bash
curl -s https://supreme.carbonstealth.eu/api/health            # {"status":"ok"}
curl -s http://127.0.0.1:3001/health                           # gateway:"connected" (ботът)
systemctl status supreme-backup.timer                          # active (waiting)
bash /opt/few-few/current/SupremeDiscordBot/deploy/backup-postgres.sh  # първи ръчен рън
journalctl -u supreme-backup.service -n 20                     # верификацията минала
```

Ботът ще пре-регистрира командите сам (нови: /tag, /stats, /ticket priority,
context menus + локализациите) — виж в Discord клиента, че описанията излизат
на езика на клиента ти.

**Тестов restore** (еднократно, изпълнява DPA обещанието — БЕЗ него бекъпите
са теория): следвай `deploy/BACKUP.md` §3 (`restore-postgres.sh --into
supreme_restore_test`).

## 4. SEO пинг (задължителен — нови страници/sitemap)

```bash
node tools/seo/indexnow.mjs https://supreme.carbonstealth.eu
```
(4 нови страници + /commands + обновен sitemap; Google се хваща от sitemap-а.)

## 5. Rollback план

`current` симлинкът сочи новия release едва след успешен health. При проблем:
върни симлинка към предишния release + `docker compose up -d`. Базата: v27-v30
са адитивни (нови колони/таблици с defaults) — старият код работи срещу новата
схема, затова rollback на кода БЕЗ восстановяване на базата е безопасен.
Пълен DB restore само при реална повреда: `deploy/BACKUP.md`.

## 6. След стабилизиране (по желание, не блокира)

- Discord Dev Portal: SKU-та за native монетизация (docs/DISCORD_MONETIZATION.md)
- top.gg листване + `TOPGG_WEBHOOK_AUTH`
- Прегледай 4-те нови публични страници (/compare/*, /guides/*)
- Юрист/счетоводител: docs/LEGAL_FINANCIAL_READINESS.md
