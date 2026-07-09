# Linketto — пускане в продукция

Чеклист за първо пускане (Фаза 0). Тайните живеят **само на сървъра**
(mode 600), никога в репото или в deploy архива.

## 0. Предпускови гейтове (одит 2026-07-09 — 5 агента)

**Пускаме DIGITAL + COURSE. Членствата (MEMBERSHIP) са изключени** зад флаг
`MEMBERSHIPS_ENABLED=false` (`src/lib/plans.ts`) до правния пакет — не се
създават. Кодът им е готов и проверен на живо; пускат се при `true`.

**Затворено в кода:** webhook `customer.subscription.updated` (отнема достъп
при спряло плащане), атомарен брояч на промо кодове, поправен open-redirect в
`/buyer/verify`, детайлната аналитика/CSV износ уважават избрания профил,
hreflang без диалектите, robots за `/buyer` `/s` `/unsubscribe`, поправена
cookie/privacy политика (строго необходими бисквитки + бюлетин/купувачи +
обхват Resend), поправено счупено ДДС изречение в разписката.

**Втори (дълбок) одит — също затворено в кода:** refund/chargeback отнема
достъпа до курса (webhook + админ/продавач refund); `/delivery` отказва
върнати/оспорени покупки; CAS срещу двойно теглене на реферал бонуса;
CSV износът неутрализира формула-инжекция; magic-link токенът е хеширан в
БД; сървърен гейт на checkout-а (само от FREE) + **Stripe Customer Portal**
за самостоятелна смяна/отмяна на план; заявките за час (BOOKING) се чистят
след 12 мес. и са декларирани в политиката; декларирана е и третата
бисквитка `NEXT_LOCALE` (езикова, до 12 мес.); аналитиката не брои върнати
продажби.

**БЛОКЕРИ за собственика/юриста преди „live":**
1. **Env:** `RESEND_API_KEY` + `EMAIL_FROM` (без тях курсовете са недоставими)
   и `STRIPE_*` live ключове; Stripe webhook с новите събития (§3).
2. **Правно:** политиката за поверителност/бисквитки е обновена родно на
   **bg/en/it/es/de/fr** (Преводача, не машинно — бюлетин/чл. 28, buyer
   identity, Resend обхват, „две бисквитки"). Остава **жив преглед от
   юрист/DPO** преди масов трафик (роля администратор↔обработващ за бюлетина
   по чл. 28; ДДС deemed-supplier по чл. 9а Регл. 282/2011 — потвърди с
   данъчен). `legal.*` са чернови по правилото на продукта.
3. **Stripe test mode:** мини приемния тест (§8) с реален курс — magic-link
   имейлът трябва да пристигне и да отключи `/learn`.

**За членствата (когато `MEMBERSHIPS_ENABLED=true`):** добави преддоговорна
информация за авто-подновяване/период/отказ (Дир. 2011/83 чл. 6), buyer път
за отмяна (Stripe Billing Portal), разделен waiver по тип продукт — всичко с
правен преглед. Дребни (след старт): idempotency ключове на checkout/refunds,
rate-limit на публичните форми, хеширане на magic-токена.

## 1. База данни (PostgreSQL, ЕС регион)

```bash
# Създай базата и приложи миграциите
DATABASE_URL="postgresql://…" npx prisma migrate deploy
```

Миграциите са в `prisma/migrations/` (една начална `…_init`). `migrate deploy`
е идемпотентен — безопасно се преизпълнява.

## 2. Environment (`.env` на сървъра)

Виж `.env.example` за пълния списък. Задължителни за магазина:

| Ключ | Откъде | Бележка |
|------|--------|---------|
| `DATABASE_URL` | PostgreSQL в ЕС | — |
| `PUBLIC_BASE_URL` | `https://linketto.carbonstealth.eu` | влиза в sitemap, canonical, Stripe redirect-и, имейли |
| `STRIPE_SECRET_KEY` | Stripe Dashboard (live) | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks (виж §3) | `whsec_…` |
| `STRIPE_PRICE_PRO_*` / `STRIPE_PRICE_BUSINESS_*` | Stripe → Products → Prices | по един Price ID за всеки период: `_MONTHLY/_QUARTERLY/_SEMIANNUAL/_ANNUAL` (отстъпка 0/10/15/20%) |
| `STRIPE_PRICE_FOUNDER` | Stripe → Products → Prices | еднократно плащане |
| `RESEND_API_KEY` + `EMAIL_FROM` | resend.com | **ЗАДЪЛЖИТЕЛНИ** — без тях курсовете (достъп през magic-link имейл) са НЕДОСТАВИМИ и разписките/доставките не тръгват; **подпиши DPA + EU регион** |
| `GEMINI_API_KEY` | aistudio.google.com | „Преведи с AI"; за ЕС ползвай **платен tier + DPA** (иначе входът се ползва за обучение) |
| `ADMIN_EMAILS` | ти | запетая-разделени имейли с достъп до `/admin` |

## 3. Stripe webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://linketto.carbonstealth.eu/api/stripe/webhook`
- **Събития** (точно тези — кодът ги обработва):
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `account.updated`
  - `account.application.deauthorized`
  - `customer.subscription.updated` (отнема достъп до членство при спряло плащане — всички dunning изходи)
  - `customer.subscription.deleted`
  - `charge.refunded`
  - `charge.dispute.created`
- Копирай `Signing secret` → `STRIPE_WEBHOOK_SECRET`.
- Stripe Billing → Settings: dunning да завършва с **cancel** на абонамента (за да дойде `subscription.deleted`).
- Stripe Billing → **Customer portal**: конфигурирай (еднократно) — бутонът
  „Управление на абонамента" в дашборда го отваря за смяна на план/период,
  начин на плащане, фактури и отмяна (изискване за лесен отказ от
  авто-подновяване).

## 4. Платежни методи

Stripe Dashboard → Settings → Payment methods → включи методите. Появяват се
автоматично в checkout-а — нула код.

- **Абонаментни планове** (Pro/Business/Founder): карти + wallets (Apple/Google
  Pay), плюс каквото включиш (Revolut Pay, PayPal, SEPA, iDEAL…).
- **Магазинът** (Stripe Connect, destination charges): ⚠️ **PayPal НЕ се
  поддържа** от Stripe за destination charges — само **карти** (Revolut Pay да
  се потвърди на живо за твоя акаунт).
- **Евтиният вариант за Revolut/PayPal без наша комисиона:** създателят слага
  **TIP блок** с `revolut.me/<име>` или `paypal.me/<име>` — плащането е директно
  към него (с официалните бранд икони), не минава през нас.

## 5. Stripe Connect (магазинът)

- Connect → Settings: активирай **Express** акаунти.
- Провери, че `application_fee` + `on_behalf_of` са позволени за твоя платформен
  акаунт (destination charges).

## 6. Автоматичен избор на език по IP (CDN държавен хедър)

Сайтът избира езика на посетителя по **държава** от IP-то. Кодът чете
хедъри, които **CDN/прокси-то отпред трябва да подава** — иначе тихо пада
към `Accept-Language`, после към `en` (работи, но по-неточно):

| Хедър | Източник | За какво |
|-------|----------|----------|
| `cf-ipcountry` | Cloudflare (вкл. в безплатния план) | държава → език |
| `x-vercel-ip-country` | Vercel | алтернатива |

**Cloudflare (препоръчано, безплатно):** насочи домейна през Cloudflare →
`cf-ipcountry` идва автоматично.

Диалектите (неаполитански/сицилиански/милански) **не** се избират
автоматично — Италия винаги → стандартен италиански (`it`); диалектът е
само за ръчен избор от потребителя. Ръчният избор (бутонът за език) пише
cookie `NEXT_LOCALE` и винаги печели пред IP. Без CDN хедър сайтът пак
работи — просто без геолокация.

## 7. Build & run

```bash
npm ci --omit=dev
npm run build            # prisma generate + next build
npm start                # или зад reverse proxy (Nginx) + systemd
```

Health probe: `GET /api/health` → `{"status":"ok","db":"up"}` (503 при паднала база).

## 8. Приемен тест преди реални пари (Stripe **test mode**)

1. Регистрирай създател → създай профил + продукт (цена ≥ €3, delivery URL).
2. Connect onboarding (test) → изчакай `account.updated` да отключи магазина.
3. Отвори публичния профил → купи с тестова карта `4242 4242 4242 4242`.
4. Провери: имейл с линка пристига (на езика на купувача); доставката
   пренасочва към `deliveryUrl`; продажбата се вижда в дашборда; комисионата
   е записана.
5. Направи refund от дашборда на продавача → парите се връщат, `application_fee`
   също.
6. Тествай delayed метод (SEPA) → достъп се дава чак при
   `async_payment_succeeded`.

Чак след зелен приемен тест — превключи на live ключове.

## 9. Преди публичен старт (не блокират деплоя, но задължителни)

- **Правен преглед:** текстовете в `messages/*.json` (`legal.*`) са изрядни, но
  минават през жив юрист/DPO преди масов трафик.
- **Преводен одит:** през агента Преводач (bg → en → it/es/de/fr).
- **Резервни копия** на базата (дневни, ЕС).
