# Release 3.3.0 — деплой runbook

Канонично: ZIP на `main` → `/root` → `autodeploy.sh`. Този документ покрива
**какво носи 3.3.0** и какво да направиш **преди** и **след** деплоя. Пълният
списък е в `CHANGELOG.md` → `[3.3.0]`; фактите от Discord и процедурата в
Developer Portal — `docs/DISCORD_MONETIZATION.md`.

**Същност:** плащанията са **само през Discord Premium Apps**; Stripe остава
единствено за заварени абонати; **пробният период е премахнат отвсякъде**.
Миграция **v48** (адитивна).

## 0. Преди деплоя — Developer Portal (един път, ~15 мин)

Без това след деплоя **никой не може да купи** — ботът и таблото ще водят към
магазин, който не съществува, а `index.js` ще крещи при старт.

1. Developer Portal → приложението на бота → **Monetization** → изпълни
   eligibility (верифицирано, собственост на **Team**, 2FA, payout/данъчни
   данни, приети Monetization Terms + Policy, ToS/Privacy линкове в App
   Directory: `/terms`, `/privacy`).
2. **Subscriptions → New SKU** ×2, **guild** (server) subscription, **месечни**:
   „Premium“ (най-близката стъпка до €4.99) и „White-label“ (до €9.99). Копирай
   двете SKU id-та.
3. Публикувай магазина (Store page) — адресът е
   `https://discord.com/application-directory/<DISCORD_CLIENT_ID>/store`.

## 1. Env промени (на сървъра, преди autodeploy)

```bash
# backend/.env  — ЗАДЪЛЖИТЕЛНО
BILLING_PROVIDER=discord            # подразбиране; stripe/both само ако нарочно
DISCORD_SKU_PREMIUM=<sku_id>
DISCORD_SKU_WHITELABEL=<sku_id>
# STRIPE_TRIAL_DAYS — махни го, вече не се чете.
# STRIPE_* остават САМО ако имаш заварени абонати (webhook + портал).

# bot/.env — същите две SKU (ботът рисува native Premium бутона)
DISCORD_SKU_PREMIUM=<sku_id>
DISCORD_SKU_WHITELABEL=<sku_id>
```

Ръчен бекъп както винаги (autodeploy прави и свой fail-closed dump):
```bash
docker compose -f /opt/few-few/current/SupremeDiscordBot/docker-compose.yml \
  exec -T postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip \
  > /var/backups/supreme-manual-$(date +%F-%H%M).sql.gz
ls -la /var/backups/supreme-manual-*.gz   # ненулев размер!
```

## 2. Деплой (каноничният поток)

```bash
cd /root
rm -rf Few-few-main Few-few.zip
curl -fsSL -o Few-few.zip https://github.com/stefkostefko92-ux/Few-few/archive/refs/heads/main.zip
unzip -q -o Few-few.zip
SRC="$(ls -d /root/[Ff]ew-few-main | head -1)"
sudo ARCHIVE=/root/Few-few.zip PROJECTS="SupremeDiscordBot" bash "$SRC/deploy/autodeploy.sh"
```

### Миграции в този релийз

- **v48 `discord_subscription_state`** — адитивна: три nullable колони в
  `servers` (`discordSubscriptionId`, `discordSubscriptionStatus`,
  `discordCurrentPeriodEnd`). Trial колоните **не** се дропват тук — заварени
  пробни периоди изтичат сами (≤14 дни); дропът е отделна миграция.

## 3. След деплоя (проверки, 5 мин)

```bash
cd /opt/few-few/current/SupremeDiscordBot && docker compose ps      # петте healthy
docker compose logs --tail=80 backend | grep -iE "BILLING_PROVIDER|Discord монетизацията|v48|error"
# НЕ трябва да има „❌ … Discord монетизацията е непълна" — ако има, SKU липсва в .env
curl -s https://supremebot.carbonstealth.eu/api/billing/config
# {"provider":"discord","discord":{"enabled":true,"configured":true,"storeUrl":"https://discord.com/application-directory/<app>/store",...}}
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://supremebot.carbonstealth.eu/api/stripe/create-checkout/x
# 401 (нелогнат) — а логнат админ получава 410 STRIPE_PURCHASES_DISABLED
```

В Discord (тестов сървър, `Ctrl+R` на клиента):

- `/premium status` на Free сървър → текст + **native Premium бутон** (или линк
  към магазина при white-label клиент).
- Купи с **test entitlement** (Developer Portal → Test / `POST
  /applications/{app}/entitlements`) → в лога на бота `💎 Entitlement created`,
  в backend `PREMIUM_GRANTED_DISCORD`; `/premium status` показва „Discord
  subscription“; таблото → Premium показва „Таксува се през Discord“.
- Изтрий test entitlement-а → планът пада на `free`, бранд ботът (ако е имало)
  слиза.

В таблото (`Ctrl+Shift+R`): Premium страницата няма бутон за плащане — само
„Отворете магазина на Discord“ (нов таб); няма trial банер; landing на 8 езика
показва само месечни цени „през Discord“.

## 4. Заварени Stripe абонати

Нищо не се прекъсва: webhook-ът, порталът (само за `planSource="stripe"`) и
дунингът работят. Discord изрично не изисква прекратяване на съществуващи
отношения. Ако решиш да ги мигрираш — комуникация с клиента (отмяна в Stripe →
покупка в Discord), не автоматика.

## 5. Rollback план

`current` сочи новия релийз едва след успешен health + smoke. При проблем:
върни симлинка към предишния релийз + `docker compose up -d`. **v48 е
адитивна** — старият код работи срещу новата схема, значи rollback на кода
**без** възстановяване на базата е безопасен. Внимание: при rollback към 3.2.0
Stripe checkout отново продава — ако междувременно SKU-тата са публикувани на
по-ниска цена от Stripe, паритетът се нарушава; за кратък откат е приемливо,
за дълъг — свали Stripe цените или скрий магазина.
