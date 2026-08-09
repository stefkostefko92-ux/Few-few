# Discord Premium App — native монетизация (втори път за upgrade)

Supreme Bot поддържа **два паралелни начина** за плащане на абонамент:

1. **Stripe** (уеб dashboard) — всички тарифи, вкл. **Agency** (мулти-сървър).
2. **Discord Premium App** (native монетизация, in-app checkout) — само
   **Premium** и **White-label**.

> **Защо Agency остава само Stripe?** Discord subscription SKU-тата се издават
> **per-guild** (един entitlement = един сървър). Agency е мулти-сървърна тарифа
> (5/10 сървъра под общ seat), която не се мапва към единичен guild entitlement.
> Затова `planFromDiscordSku` връща само `premium` / `whitelabel`, никога agency.

---

## 1. Включване на монетизация в Developer Portal

1. Отвори приложението в **Discord Developer Portal → App → Monetization**.
2. Провери **eligibility** изискванията (потвърди актуалните в портала — числата
   се менят):
   - **Verified app** (верификацията е отделен процес; при 100+ сървъра тя вече е
     задължителна).
   - **Team** с попълнен **payout / данъчна информация** на owner-а на екипа.
   - Приети **Monetization Terms** и **сървър за поддръжка**.
3. Приложението трябва да принадлежи на **Team**, не на личен акаунт.

## 2. Създай subscription SKU-та

В **Monetization → Subscriptions** създай **две** guild-scoped subscription-а:

| SKU | Тарифа в кода | Външна цена (Stripe) |
|-----|---------------|----------------------|
| Premium | `premium` | €4.99/мес · €49/год |
| White-label | `whitelabel` | €9.99/мес · €99/год |

**Ценови паритет (задължителен).** Discord **Monetization Requirements**
(в сила от **7 октомври 2024 г.**) изискват цената в Discord да **НЕ е по-висока**
от същата услуга, продавана извън Discord. Т.е. Discord SKU цената трябва да е
**≤** съответната Stripe цена. Не вдигай цените само за Discord.

> ⚠ **При намаление на Stripe цените** (както 2026-08: ÷2 на цялата стълбица)
> паритетът се обръща срещу нас: старата Discord SKU цена става ПО-ВИСОКА от
> външната → нарушение. Смени SKU цените в Dev Portal **едновременно** с
> пускането на новите Stripe цени.

> Провери актуалната формулировка на изискванията на живо преди пускане:
> https://discord.com/developers/docs (Monetization) и
> https://support-dev.discord.com/hc/en-us/articles/... (Monetization Requirements).

## 3. Конфигурирай backend `.env`

Копирай **SKU ID-тата** от портала и ги сложи в `backend/.env`:

```dotenv
# Discord native монетизация (guild-scoped subscription SKU-та)
DISCORD_SKU_PREMIUM=<sku_id_на_premium>
DISCORD_SKU_WHITELABEL=<sku_id_на_whitelabel>
```

Тези се четат от `backend/src/lib/premium.js` → `planFromDiscordSku(skuId)`.
Ако `botът` праща SKU, който не е в тези две env-променливи, backend-ът **игнорира**
събитието (200 ignore) — така случайни/Agency SKU-та не дават достъп.

> `DISCORD_SKU_PREMIUM` се ползва и от бота за upsell бутона
> (`sendPremiumRequired`), затова трябва да е наличен и в **средата на бота**.

## 4. Как работи по веригата

1. Потребител купува абонамент от Discord → Discord издава **entitlement** за
   guild-а.
2. Ботът (gateway) получава `ENTITLEMENT_CREATE/UPDATE/DELETE` и праща POST към
   `POST /api/discord/entitlement` с `x-bot-secret` (само ботът може).
3. Backend-ът резолвва SKU → plan и обновява `Server`:
   `isPremium`, `plan`, `planSource="discord"`, `discordEntitlementId`,
   `discordSkuId`. Пише **AuditLog** `PREMIUM_GRANTED_DISCORD`.
4. При delete / изтекъл `endsAt` → revoke **само** ако сървърът е обезпечен точно
   от този Discord entitlement (`planSource==="discord"`). **Stripe-обезпечени
   сървъри не се пипат.** AuditLog `PREMIUM_REVOKED_DISCORD`.

## 5. Тест

- Използвай **test entitlements** (Developer Portal / `entitlements.createTest`)
  в тестов guild, за да симулираш покупка без реално плащане.
- Провери, че `Server.plan` става `premium`/`whitelabel` и после се връща на
  `free` при изтриване на test entitlement-а.
