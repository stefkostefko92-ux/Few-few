# АСО — Microtransactions Spec

How money becomes value in АСО, the surfaces that sell it, and the rules that
keep it legal and fair. This documents the system as built across `apps/api`
(billing + webhook), `apps/web` (purchase surfaces), and the Stripe integration.

## 1. Principles (non-negotiable)

1. **Not gambling.** АСО is a social game. Virtual chips are **never** cashed
   out, traded for money, or withdrawn. Betting-style games (Svara, Hold'em)
   wager **virtual chips only**. (§11.4 regulatory.)
2. **No pay-to-win on skill.** Money buys cosmetics, comfort, and **entry
   chips** — never an in-match competitive advantage, board insight, or rating.
   Matchmaking and engine outcomes are identical for paying and free players.
3. **Credit only from the signed webhook.** A purchase grants value **only**
   when Stripe sends a signature-verified webhook. Client redirects never
   credit anything. (See `apps/api/src/webhooks/stripe.ts`.)
4. **Idempotent + auditable.** Every Stripe event is deduped by `event.id`
   (`ProcessedEvent`), and every grant is written in the same DB transaction as
   its dedupe marker. `Purchase` / `Subscription` rows form the audit trail.
5. **Env-gated.** With no `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, billing
   is disabled: checkout returns `503 stripe_unavailable` and the UI shows a
   graceful "payments not enabled" notice. The app still runs end-to-end.

## 2. Currencies & entitlements

| Asset            | Source                          | Spends on                                   | Cashable |
| ---------------- | ------------------------------- | ------------------------------------------- | -------- |
| 🪙 **Chips**     | Daily bonus, wins, chip packs   | Table buy-ins / bets in chip games          | **No**   |
| 💎 **Gems**      | Gem packs (premium currency)    | Cosmetics, comfort, convenience             | **No**   |
| 👑 **VIP**       | Monthly subscription            | Perks (see `VIP_PERKS`): cosmetic + comfort | n/a      |

Chips are soft currency (also earned for free); gems are premium; VIP is a
recurring entitlement. None convert back to money.

## 3. Catalog (SKUs)

Source of truth for display + grant mapping: `apps/api/src/economy/catalog.ts`.
Authoritative charged amount is the Stripe price; these mirror it.

| SKU             | Kind      | Price  | Grant            |
| --------------- | --------- | ------ | ---------------- |
| `gems_small`    | GEMS      | €1.99  | 100 gems         |
| `gems_medium`   | GEMS      | €4.99  | 300 gems         |
| `gems_large`    | GEMS      | €9.99  | 700 gems         |
| `chips_small`   | CHIP_PACK | €1.99  | 5,000 chips      |
| `chips_large`   | CHIP_PACK | €6.99  | 25,000 chips     |
| `vip_silver`    | VIP_SUB   | €4.99  | VIP Silver / mo  |
| `vip_gold`      | VIP_SUB   | €9.99  | VIP Gold / mo    |
| `vip_platinum`  | VIP_SUB   | €19.99 | VIP Platinum / mo|

## 4. Purchase flow

```
Client (web)                  API                         Stripe
  │  POST /api/shop/checkout    │                            │
  ├────────────────────────────►  create Checkout Session    │
  │                             ├───────────────────────────►│
  │  { url }                    │◄───────────────────────────┤
  │◄────────────────────────────┤                            │
  │  window.location = url ─────────────────────────────────►│  (hosted pay)
  │                             │   webhook (signed) ◄────────┤
  │                             ├─ verify sig                 │
  │                             ├─ dedupe by event.id         │
  │                             ├─ grant + write Purchase     │
  │  redirect /shop?status=success                            │
  │  → refetch /me (wallet updates)                           │
```

- **One-time** SKUs (gems, chips): `mode: payment`; granted on
  `checkout.session.completed`.
- **VIP**: `mode: subscription`; VIP applied on `invoice.paid`, kept in sync via
  `customer.subscription.updated` / `.deleted`; managed through the Stripe
  **Billing Portal** (`POST /api/shop/portal`).
- Identity + SKU travel in `client_reference_id` / `metadata` so the webhook
  knows what to grant, to whom.

Webhook events handled (`handleEvent`): `checkout.session.completed`,
`invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`.

## 5. In-game purchase surfaces (web)

The header renders during matches, so its wallet works as the primary in-game
buy point — players top up without leaving the table.

1. **Wallet bar** (`apps/web/src/app/Header.tsx`): shows 🪙 chips + 💎 gems with
   a `+` top-up button. When chips fall below `LOW_CHIPS` (500) the bar turns to
   the loss accent and opens the store with the `chips` reason.
2. **Quick store modal** (`features/shop/StoreModal.tsx`): app-wide overlay
   (mounted in `Layout`, so it covers games too) for one-tap gem/chip checkout,
   with a shortcut into the full shop. Opened via `useStoreModal`.
3. **Full shop** (`features/shop/Shop.tsx`): the complete catalog incl. VIP and
   cosmetics, plus post-redirect status handling and wallet refresh.
4. **VIP management**: Billing Portal link from the shop for active subscribers.

Future hook points (not yet wired): an "out of chips" prompt at a betting
table's buy-in, and a gem-priced cosmetic picker per game felt/card back.

## 6. Fairness & safeguards

- Bets and buy-ins draw from the virtual chip balance only; losing chips has no
  monetary consequence and chips can always be re-earned for free (daily bonus,
  wins).
- Gems and VIP are confined to cosmetics/comfort; no SKU alters legal moves,
  visible information, RNG, or matchmaking.
- All grants are server-authoritative and transactional; the client cannot
  self-credit.

## 7. Configuration

```
STRIPE_SECRET_KEY=        # enables checkout/portal
STRIPE_WEBHOOK_SECRET=    # enables the only crediting path
VITE_STRIPE_PK=           # client publishable key (if used)
PUBLIC_WEB_URL=           # success/cancel redirect base
```

Leave blank in dev to run with billing disabled.
