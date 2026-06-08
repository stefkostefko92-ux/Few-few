# KAGURA SPIN — Store & Regulatory Compliance Notes

> **DRAFT — operational checklist, not legal advice.** Confirm each item with
> counsel and the relevant store policies before submission.

## 1. Randomized purchases (loot boxes / gacha) — odds disclosure

KAGURA SPIN includes a **gacha summon** (companions) with randomized outcomes,
purchasable indirectly via Spirit Tokens. Apple, Google, and several
jurisdictions **require the probabilities to be disclosed to players before
purchase.**

- **The server publishes live odds** at `GET /gacha/rates` (regulatory
  transparency, GDD §12.2): per-rarity drop rates **and** the pity counters
  (guaranteed Epic/Mythic thresholds). The client **must** surface these on the
  summon screen and the store listing.
- Keep the disclosed odds in lock-step with the live LiveOps config — the same
  source feeds both `/gacha/rates` and the actual draw, so they cannot drift.
- **Pity system:** disclose that a guaranteed higher-rarity result occurs after
  N pulls (epicPity / mythicPity), as these affect effective odds.

### Store policy hooks
- **Apple App Store Review Guideline 3.1.1** — apps with loot boxes must disclose
  the odds of receiving each type of item.
- **Google Play** — paid randomized items must disclose odds prior to purchase.

## 2. Regional restrictions to evaluate (with counsel)

- **Belgium & Netherlands** — paid loot boxes have been treated as gambling and
  restricted/banned. Plan to **disable paid randomized mechanics** in these
  markets (geo-gating) or remove direct purchase of summons.
- **Other markets** (e.g. Japan — no "kompu gacha"; South Korea; China — odds
  publication + spend limits): review per-market before launch.

## 3. Age rating

- Submit **IARC** questionnaires (Google Play / consoles) and Apple age rating.
- Disclose: in-app purchases, simulated gambling/randomized rewards, social
  chat (user-generated content), if applicable.

## 4. In-app purchase requirements

- Use only the platform billing APIs for digital goods.
- Show price, contents, and (for randomized items) odds before purchase.
- Honor platform refund flows.
- Provide a **restore purchases** path for non-consumable/one-time products.

## 5. User-generated content (clan chat)

- Provide reporting/blocking and a moderation policy (store requirement for
  social features).
- Maintain a profanity filter and abuse rate limits.

## 6. Privacy & data

- Publish the Privacy Policy ([PRIVACY.md](./PRIVACY.md)) and link it in both
  store listings and in-game.
- Provide in-app **data export** and **account deletion** (implemented:
  `GET /account/export`, `DELETE /account`). Google Play also requires an
  **account-deletion web URL**.
- Complete the **Apple Privacy Nutrition Labels** and **Google Play Data Safety**
  forms to match actual collection (see PRIVACY.md §1).

## 7. Terms

- Publish Terms of Service ([TERMS.md](./TERMS.md)); link at signup and in store.
