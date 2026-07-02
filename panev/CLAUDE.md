# panev/ — Panev Ascensori (sito + e-commerce)

Institutional site + online shop for **Panev Ascensori SAS**, an Italian maker of
patented lift-door brackets (UIBM N. 202023000002112). **User-facing language:
Italian.** B2B flow: cart says „Richiedi Preventivo" (request a quote), not „Paga".
Root rules live in the repo-root `CLAUDE.md`.

_Stack: Node.js **plain JS** · Express · SQLite (better-sqlite3) · Stripe;
`jsonwebtoken` + `bcryptjs` auth; `nodemailer`. Static front (`css/ js/ img/`) +
`server.js` + server-side `admin/`._

## Commands (run inside `panev/`)

```bash
npm run dev              # nodemon server.js
npm start                # node server.js
npm run db:seed          # node scripts/seed.js
npm run db:reset         # rm data/panev.db && seed   (destructive — dev only)
```

## Conventions (important)

- **Plain JavaScript** (no TS, no build step); server renders/serves the static
  front + a REST API.
- **Admin is server-side** (JWT `HttpOnly` cookie + `bcrypt`) — no DevTools bypass;
  products/orders/messages persist in **SQLite**, never `localStorage`.
- **Stripe is money-critical:** the webhook saves orders **server-side** and is
  **idempotent**; never trust client-supplied amounts; grant/record only via the
  verified webhook. Given the B2B quote flow, checkout may be quote-first.
- **Secrets** (`STRIPE_*`, JWT secret, SMTP) stay in `.env` (see `.env.example`),
  never in the repo.
- Validate + rate-limit public forms; escape user-generated content.
- Legal/e-commerce (IT/EU): recesso, IVA, Omnibus, cookie/consent apply — loop in
  the **Правният Разбирач** / **Продавача** agents for checkout/legal changes.
