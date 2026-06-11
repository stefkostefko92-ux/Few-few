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
| 💎 **Gems**      | Gem packs, VIP stipend (SILVER+)| Per-game cosmetics                          | **No**   |
| 👑 **VIP**       | Monthly subscription            | Perks (see `VIP_PERKS`): cosmetic + comfort | n/a      |

Chips are soft currency (also earned for free); gems are premium; VIP is a
recurring entitlement. None convert back to money. **All real-money prices are
in euro (EUR)** — gems/chips/VIP are the only things euro buys; cosmetics are
bought with gems.

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
| `vip_bronze`    | VIP_SUB   | €3.99  | VIP Bronze / mo  |
| `vip_silver`    | VIP_SUB   | €4.99  | VIP Silver / mo  |
| `vip_gold`      | VIP_SUB   | €9.99  | VIP Gold / mo    |
| `vip_platinum`  | VIP_SUB   | €19.99 | VIP Platinum / mo|

### VIP tiers (distinct feature sets)

Each tier is strictly different, not just "more". `VIP_PERKS` (shared) is the
source of truth; the shop renders these per card.

| Tier         | €/mo   | Ads | XP    | Daily chips | Gems/mo | Exclusive cosmetics | Quest slots | Badge |
| ------------ | ------ | --- | ----- | ----------- | ------- | ------------------- | ----------- | ----- |
| **Bronze**   | €3.99  | off | +10%  | +20%        | —       | —                   | 4           | ✓     |
| **Silver**   | €4.99  | off | +20%  | +35%        | 60      | ✓                   | 5           | ✓     |
| **Gold**     | €9.99  | off | +35%  | +60%        | 160     | ✓                   | 6           | ✓     |
| **Platinum** | €19.99 | off | +50%  | +100%       | 400     | ✓                   | 8           | ✓     |

Bronze is the €3.99 entry plan: ad-free + VIP badge + small comfort boosts, but
no gem stipend or exclusive cosmetics — those begin at Silver. The monthly gem
stipend is credited on each paid invoice (`invoice.paid`), inside the dedup
transaction so renewals grant gems and retries don't double-credit.

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

5. **Per-game cosmetics shop** (`features/shop/CosmeticsModal.tsx`): opened from
   each lobby tile's 🎨 button. Buys table felts, card backs, and board themes
   with **gems**, then equips instantly. VIP-exclusive items are locked unless
   the player is SILVER+.
6. **Out-of-chips gate** (`features/game/OutOfChips.tsx`): a player who can't
   cover a betting table's buy-in (Svara/Hold'em) is shown a top-up prompt
   instead of being seated — never coercive (chips are also free to earn).

## 5a. Cosmetics (gems, per game)

Source of truth: `packages/shared/src/cosmetics.ts`. Cosmetics are **virtual,
gem-priced, and game-scoped** (id `GAME.TYPE.variant`) — they never touch
Stripe and never affect gameplay.

- **Types**: `FELT` (table sukno), `CARDBACK` (card back), `BOARD` (square
  theme). Card games get felt + card back; chess/draughts get board themes.
- **API** (`/api/cosmetics`, auth required): `GET ?game=` (catalog + owned /
  equipped / locked flags), `POST /buy` (atomic gem debit guarded in the WHERE,
  then inventory row), `POST /equip` (one equipped item per game+type slot),
  `GET /equipped` (ids, loaded after sign-in to apply visuals).
- **Application**: equipped ids live in a client store; `FeltTable`,
  `PlayingCard`, and `BoardFrame` read the current route's game and recolour via
  CSS variables (`--table-felt`, `--cb-a/b`, `--sq-light/dark`).
- **VIP gating**: VIP-exclusive cosmetics require `exclusiveCosmetics` (Silver+).

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
