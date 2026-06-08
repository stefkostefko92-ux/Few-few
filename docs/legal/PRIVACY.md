# Privacy Policy — KAGURA SPIN

> **DRAFT TEMPLATE — not legal advice.** Review and finalize with qualified
> privacy counsel before publishing. Bracketed `[…]` items are company-specific.
> Last updated: [DATE].

[COMPANY LEGAL NAME] ("we", "us") operates the KAGURA SPIN game ("the Game").
This policy explains what personal data we process, why, and your rights.

## 1. Data we collect

| Data | Purpose | Legal basis (GDPR) |
|---|---|---|
| **Device identifier + generated device secret** (hashed) | Account creation and login without requiring an email/password | Contract (Art. 6(1)(b)) |
| **Display name** | Shown to you, clan-mates, and on leaderboards | Contract |
| **Game save-state** (currencies, islands, companions, progression) | Provide the Game | Contract |
| **Purchase records** (store transaction id, product, timestamp) | Deliver and reconcile in-app purchases; fraud prevention; legal/accounting | Contract; Legal obligation (Art. 6(1)(c)) |
| **Clan membership & chat messages** | Provide social features | Contract |
| **Gameplay analytics events** (spins, builds, purchases — keyed by player id, no contact data) | Balancing, abuse detection, product analytics | Legitimate interests (Art. 6(1)(f)) |
| **IP address** (transiently, for rate limiting/security) | Protect the service | Legitimate interests |

We do **not** intentionally collect names, email addresses, precise location, or
other contact information through the Game backend.

## 2. Payments

In-app purchases are processed by the platform store (Apple App Store / Google
Play) and our payment aggregator, [RevenueCat]. We receive a verified
transaction identifier — **not** your payment card or full billing details. See
the store's and aggregator's own privacy policies.

## 3. Retention

- Save-state, credentials, and clan data: kept while your account exists.
- Purchase/transaction records: retained for **[7] years** to meet tax/accounting
  obligations, even after account deletion (Art. 17(3)(b)).
- Analytics events: retained for **[14] months** then deleted or aggregated.

## 4. Your rights (GDPR / UK GDPR / CCPA where applicable)

- **Access & portability** — download your data in-app: **Settings → Privacy →
  Export my data** (`GET /account/export`).
- **Erasure** — delete your account in-app: **Settings → Privacy → Delete my
  account** (`DELETE /account`). This removes your player profile, credential,
  purchase-grant linkage, and clan membership. Financial transaction records are
  retained as above.
- **Objection / restriction** — contact us at [privacy@company.com].
- You may lodge a complaint with your supervisory authority.

## 5. Children

The Game is not directed to children under [13 / the age of digital consent in
your country]. We do not knowingly collect data from them. See also the in-game
purchase controls and store-level parental controls.

## 6. International transfers

Data may be processed in [REGIONS]. Where required we rely on [Standard
Contractual Clauses / adequacy decisions].

## 7. Security

Credentials are stored only as salted hashes; transport is encrypted (TLS);
access to production data is restricted. No method is perfectly secure.

## 8. Contact

[COMPANY], [ADDRESS]. Data Protection contact: [privacy@company.com].
[EU/UK representative, if applicable.]
