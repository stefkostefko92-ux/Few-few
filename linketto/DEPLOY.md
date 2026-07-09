# Linketto — пускане в продукция

Чеклист за първо пускане (Фаза 0). Тайните живеят **само на сървъра**
(mode 600), никога в репото или в deploy архива.

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
| `RESEND_API_KEY` + `EMAIL_FROM` | resend.com | доставка на купеното по имейл; **подпиши DPA + EU регион** |
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
  - `customer.subscription.deleted`
  - `charge.refunded`
  - `charge.dispute.created`
- Копирай `Signing secret` → `STRIPE_WEBHOOK_SECRET`.

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

## 6. Build & run

```bash
npm ci --omit=dev
npm run build            # prisma generate + next build
npm start                # или зад reverse proxy (Nginx) + systemd
```

Health probe: `GET /api/health` → `{"status":"ok","db":"up"}` (503 при паднала база).

## 7. Приемен тест преди реални пари (Stripe **test mode**)

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

## 8. Преди публичен старт (не блокират деплоя, но задължителни)

- **Правен преглед:** текстовете в `messages/*.json` (`legal.*`) са изрядни, но
  минават през жив юрист/DPO преди масов трафик.
- **Преводен одит:** през агента Преводач (bg → en → it/es/de/fr).
- **Резервни копия** на базата (дневни, ЕС).
