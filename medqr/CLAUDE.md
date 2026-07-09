# medqr/ — спешен медицински профил с QR/NFC

A secure emergency medical profile reachable by scanning a QR code or tapping an
NFC tag (`/e/<token>`). Built especially for deaf/hard-of-hearing and nonverbal
people: the emergency view shows blood type, allergies, conditions, meds and an
emergency contact, plus communication tooling (text-to-speech, body map, SOS
mode). **It is an informational service, not a medical device.**

_Stack: Node.js · Express · EJS · SQLite (better-sqlite3) — plain JS (ESM), no
build step. Root rules live in the repo-root `CLAUDE.md`._

## Commands (run inside `medqr/`)

```bash
npm install
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npm start                       # http://localhost:3000
npm run dev                     # node --watch auto-reload

# Quality gates — same as CI (medqr/.github/workflows/ci.yml):
npm run lint                    # ESLint (flat config)
npm run format:check            # Prettier
npm test                        # node test/smoke.test.js (full-flow smoke test)
npm run test:webauthn           # passkeys e2e with a virtual authenticator
```

CI runs lint + `format:check`, tests on Node 20 and 22, and `npm audit` + SBOM.
Node ≥20 required (CI also exercises 22).

## Layout

```
src/server.js        Express app: helmet, HSTS, CSP (nonce), rate limiting, i18n, routes
src/db.js            SQLite schema + migrations (better-sqlite3, WAL)
src/crypto.js        encryption at rest (AES-256-GCM) for sensitive medical fields
src/hashing.js       Argon2id hashing (+ legacy bcrypt verify / transparent migration)
src/auth.js          sessions (incl. long-lived), lockout, 2FA, tokens, recovery codes
src/csrf.js          CSRF protection (synchronizer token + header)
src/i18n.js          BG/EN bilingual layer
src/mailer.js        email (nodemailer); src/notify.js  next-of-kin notifications
src/webauthn.js      passkeys (WebAuthn)
src/profiles.js      profile access with encrypt/decrypt
src/audit.js         tamper-evident audit log (hash chain)
src/label.js         QR sizes + self-explanatory bilingual medical label (SVG)
src/seo.js           robots.txt, sitemap.xml, llms.txt, manifest, GEO meta
src/routes/          auth, profile (incl. SOS), webauthn, emergency
src/views/           EJS templates (incl. legal, 2fa, passkeys, sos)
public/              app.js (CSP-safe client logic), sw.js (offline PWA), styles.css
mobile/              Capacitor project for Android/iOS (wraps the live site)
deploy/              nginx/Caddy, systemd, fail2ban, backup.sh + DEPLOY.md
docs/                research, institutions, deploy guides (Bulgarian)
test/                smoke.test.js + webauthn.e2e.mjs
```

## Conventions (important)

- **Plain JavaScript, ESM** (`"type": "module"`); no TypeScript, no build step. Use
  `import`, `node:`-prefixed core modules.
- **Security is the defining requirement.** Sensitive medical fields (GDPR Art. 9
  special-category data) are **encrypted at rest** (AES-256-GCM via `crypto.js`);
  every access/important action is recorded in a tamper-evident audit log;
  emergency access is via an unguessable token. **Don't weaken these.**
- **`ENCRYPTION_KEY` (32-byte hex) is required in production.** Outside production a
  dev key is used with a warning. Never commit real keys; keep them out of the repo
  (systemd `EnvironmentFile`, mode 600).
- **CSP uses a per-request nonce** — no `unsafe-inline`. Client behavior lives in
  `public/app.js` (CSP-safe), not inline scripts. Preserve this when editing views.
- **CSRF tokens on all forms**; passwords/PINs hashed with **Argon2id** (legacy
  bcrypt hashes migrate transparently on next login).
- Runs behind a reverse proxy in prod (`app.set('trust proxy', 1)`); required prod
  env: `NODE_ENV=production`, `ENCRYPTION_KEY`, `PUBLIC_BASE_URL` (HTTPS). See
  `.env.example`.
- The CHANGELOG follows Keep a Changelog + SemVer; update `CHANGELOG.md` for
  user-facing changes.
- **Never enter real medical data in demo/dev environments.**
