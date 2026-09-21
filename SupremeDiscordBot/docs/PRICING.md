# Тарифи (v3.3 — само през Discord)

Supreme Bot се продава **само** през **Discord Premium Apps** (решение на собственика,
12.09.2026). Stripe остава единствено за **заварени** абонати. Достъпът се гейтва
централизирано в `backend/src/lib/premium.js`; какво и как се продава е на едно място —
`backend/src/lib/billing.js`. Пълната процедура и проверените факти от Discord →
`docs/DISCORD_MONETIZATION.md`.

## Тарифите

| Tier | Цена (информативна, „от“) | Обхват | Какво включва |
|------|---------------------------|--------|----------------|
| **Free** | €0 | 1 сървър | 1 панел, 2 формуляра (до 5 въпроса), 1 верификация, 30-дневни transcript-и |
| **Premium** | от €4.99/мес | 1 сървър | Всичко ОСВЕН white-label: до 50 панела/формуляра/въпроса, верификация, giveaways, poll-ове, sticky + scheduled/recurring, AI отговори, round-robin, webhooks, REST API, безсрочни transcript-и |
| **White-label** | от €9.99/мес | 1 сървър | Premium + собствен бранд бот (качваш свой Discord bot token) |

- **Само месечно.** Discord Premium Apps не поддържа годишни абонаменти → няма
  годишен план и няма „2 месеца безплатно“.
- **Без пробен период.** Discord не поддържа trial; премахнат е и локалният
  (v3.3). Free tier-ът е безсрочен за оценка.
- **Без Agency.** Guild SKU = един сървър; мулти-сървърен пакет няма как да се
  продаде в Discord, а паритетът (Developer Policy) забранява да го продаваме само
  извън него. Заварените агенции работят до отмяна (webhook + портал).
- **Цената е „от“**: реалната се избира от фиксираната стълба на Discord в
  Developer Portal, а крайната сума с ДДС (по държавата на купувача) я показва Discord
  в checkout-а. Discord е препродавач в ЕС/UK — начислява и внася ДДС, издава
  разписките, обработва възстановяванията.
- **Паритет (Developer Policy, от 07.10.2024):** цената в Discord не бива да е
  по-висока от която и да е друга опция. С един канал това е изпълнено по
  конструкция — **не пускай втори канал с по-ниска цена.**
- Само `integrations.whiteLabel` изисква White-label; всяка друга премиум функция
  изисква Premium или по-горе (`PREMIUM_FEATURES` в `lib/premium.js`).

## Как е моделирано (код)

- `Server.plan` — собствената тарифа (`free|premium|whitelabel`; `agency5|agency10`
  само при заварени агенции). `Server.isPremium` се пази в синхрон.
- `Server.planSource` — `discord` | `stripe` (легаси) | `manual`.
- `Server.discordEntitlementId/discordSkuId` — правата (v27);
  `discordSubscriptionId/Status/CurrentPeriodEnd` — „защо/докога“ (v48).
- `getServerTier(serverId)` е единственият източник на истина: собствена тарифа +
  гратис след отмяна + agency seat (+ заварен trial до изтичане) → `{ plan,
  isPremium, hasWhiteLabel, limits, ... }`.
- Достъп се дава **само** през проверен Discord entitlement (или, за заварени,
  проверен Stripe webhook) — никога от client redirect.
- Таблото чете `GET /api/billing/:serverId` (доставчико-неутрално: `source`,
  план, Discord статус, гратис, агенция, легаси портал) и `GET /api/billing/config`.

### Край на абонамента

| Случай | Достъп | Как идва |
|---|---|---|
| **Отмяна в Discord** | до края на платения период | `SUBSCRIPTION_UPDATE` (ENDING) → само етикет; накрая `ENTITLEMENT_UPDATE` с `ends_at` → revoke |
| **Изтичане** | пада при `ends_at` | `ENTITLEMENT_UPDATE` (+ reconcile на 6 ч, ако събитието е изпуснато) |
| **Refund от Discord** | пада веднага | `ENTITLEMENT_DELETE` или `deleted:true` |
| **Легаси Stripe** | както във v40 (гратис / refund / chargeback / дунинг) | Stripe webhook |

## Пускане — какво трябва да направи собственикът

1. Developer Portal → Monetization: eligibility (верифицирано Team приложение, 2FA,
   payout, приети Terms/Policy) → две **месечни guild** SKU-та (Premium, White-label).
2. `backend/.env` + `bot/.env`: `DISCORD_SKU_PREMIUM`, `DISCORD_SKU_WHITELABEL`;
   `BILLING_PROVIDER=discord` (подразбиране). `DISCORD_CLIENT_ID` вече е там.
3. Деплой (миграция **v48** е адитивна). При старт `index.js` крещи при липсващ SKU.
4. Тест с test entitlement в тестов guild (виж `docs/DISCORD_MONETIZATION.md` §7).
5. Stripe: **не** създавай нови цени; остави ключа само ако има заварени абонати.
