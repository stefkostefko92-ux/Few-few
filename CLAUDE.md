# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Repository overview

This is a **monorepo containing several independent products** by Carbon Stealth VCC
(https://carbonstealth.eu). They share no code and have separate dependencies,
toolchains, CI workflows and deployment paths. Always work inside the relevant
subdirectory.

| Dir            | Product       | Stack                                                        | Public URL                          |
| -------------- | ------------- | ----------------------------------------------------------- | ----------------------------------- |
| `zabobovdol/`  | За Бобов дол  | Next.js 15 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL · Tailwind | https://zabobovdol.carbonstealth.eu |
| `medqr/`       | MedQR         | Node.js · Express · EJS · SQLite (better-sqlite3) — plain JS (ESM) | https://medqr.carbonstealth.eu      |
| `supreme/`     | Supreme Bot   | Express · discord.js v14 · React 18 + Vite · Prisma · PostgreSQL · Redis · Docker — plain JS (ESM) | https://supreme.carbonstealth.eu    |

There is **no root-level `package.json`** — `cd` into the project you are
changing and run its scripts there. The root `.gitignore` only ignores
`node_modules/` and `.DS_Store`.

**User-facing language is Bulgarian.** UI text, code comments, commit messages,
docs and changelogs are written in Bulgarian. Both apps offer a BG/EN toggle for
end users, but the source-of-truth content and developer-facing prose are
Bulgarian. Use the typographic quotes „ … “ for Bulgarian quotations.

---

## zabobovdol/ — civic portal for the town of Bobov dol

A digital assistant for an aging population: local services directory, 500+
step-by-step "Как да…" (how-to) guides for e-government, listings, events, news,
mutual aid, spending transparency, and accessibility tooling.

### Commands (run inside `zabobovdol/`)

```bash
npm install
cp .env.example .env            # fill DATABASE_URL + secrets
npx prisma db push              # create schema (dev); or npm run prisma:migrate
npm run db:seed:all             # seed content + admin user
npm run dev                     # http://localhost:3000

# Quality gates — must all pass; same as CI (.github/workflows/zabobovdol.yml):
npm run lint                    # ESLint (next/core-web-vitals + typescript)
npm run typecheck               # tsc --noEmit
npm test                        # unit tests: tsx --test src/lib/__tests__/*.test.ts
npm run build                   # prisma generate && next build
```

Admin login is at `/admin/login` with the credentials from `.env`
(`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

### Layout

```
src/app/            App Router routes — public pages + /admin panel + /api + robots/sitemap/llms
src/components/      shared React components (UI + admin/)
src/lib/             non-UI logic: auth, prisma, seo, markdown, settings, search, chat, …
src/lib/admin/       config-driven CRUD: resources.ts + server actions
src/lib/__tests__/   unit tests (node:test via tsx, no external deps)
src/middleware.ts    guards /admin/* (JWT cookie check)
prisma/              schema.prisma + many seed-*.ts scripts
scripts/             deploy, HTTPS (Let's Encrypt), encrypted backup helpers
android/             Android TWA wrapper (Bubblewrap) — wraps the live site
print/, public/      print assets and static files
```

### Conventions (important)

- **TypeScript, avoid unjustified `any`.** Validate external/user input with
  **Zod**.
- **Path alias `@/*` → `src/*`** (see `tsconfig.json`). Import db via
  `@/lib/prisma`, settings via `@/lib/settings`, JSON-LD via `@/lib/seo`.
- **Prisma client is a singleton** (`src/lib/prisma.ts`) to avoid exhausting
  connections in dev hot-reload. Never `new PrismaClient()` elsewhere.
- **Pages that read the database must be `force-dynamic`** so the production
  build does not touch a real DB (CI builds with a dummy `DATABASE_URL`).
- **Auth**: signed JWT sessions (`jose`, HS256) in an `HttpOnly`,
  `SameSite=strict` cookie named `zbd_session`; passwords are bcrypt. `auth.ts`
  is `server-only`. `AUTH_SECRET` must be ≥32 chars and not a placeholder (the
  code throws otherwise).
- **Admin panel is config-driven.** To add/change a managed content type, edit
  the `RESOURCES` array in `src/lib/admin/resources.ts` (each `Resource`
  declares its fields once; lists/forms/actions are generated). Roles: `ADMIN`
  and `EDITOR`; `adminOnly` and `moderated` flags gate behavior.
- **AI chat assistant** (`src/lib/ai-config.ts`, `chat.ts`): provider resolves
  from admin-panel settings → `.env` → default. Providers: `rules` (no AI,
  answers from site content), `gemini`, `anthropic`. Falls back to `rules` if
  the selected provider has no API key. Default Anthropic model is
  `claude-opus-4-8`.
- **SEO/GEO/AEO** is a first-class concern: structured JSON-LD graph built in
  `@/lib/seo`, plus `robots.txt`, `sitemap.xml`, `llms.txt`, IndexNow.
- Escape all user-generated content (see `markdown.ts`, `linkify.ts`).

### Deployment

Docker Compose on a VPS behind Nginx; `scripts/setup-env.sh`,
`scripts/deploy.sh`, `scripts/init-letsencrypt.sh`. Scheduled data ingestion
(news, transparency) via authenticated `/api/ingest-*` endpoints. See
`DEPLOY.md` and `ПРЕДИ-ПУСКАНЕ.md`.

---

## medqr/ — emergency medical profile with QR/NFC

A secure emergency medical profile reachable by scanning a QR code or tapping an
NFC tag (`/e/<token>`). Built especially for deaf/hard-of-hearing and
nonverbal people: an emergency view shows blood type, allergies, conditions,
meds and an emergency contact, plus communication tooling (text-to-speech, body
map, SOS mode). **It is an informational service, not a medical device.**

### Commands (run inside `medqr/`)

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

### Layout

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
src/applinks.js      App Links / Universal Links assoc. → served at /.well-known/assetlinks.json + apple-app-site-association (deep-link /e/<token> into the native app)
src/routes/          auth, profile (incl. SOS), webauthn, emergency
src/views/           EJS templates (incl. legal, 2fa, passkeys, sos)
public/              app.js (CSP-safe client logic), sw.js (offline PWA), styles.css
mobile/              Capacitor project for Android/iOS (wraps the live site)
deploy/              nginx/Caddy, systemd, fail2ban, backup.sh + DEPLOY.md
docs/                research, institutions, deploy guides (Bulgarian)
test/                smoke.test.js + webauthn.e2e.mjs
```

### Conventions (important)

- **Plain JavaScript, ESM** (`"type": "module"`); no TypeScript, no build step.
  Use `import`, `node:`-prefixed core modules.
- **Security is the defining requirement.** Sensitive medical fields (GDPR
  Art. 9 special-category data) are **encrypted at rest** (AES-256-GCM via
  `crypto.js`); every access/important action is recorded in a tamper-evident
  audit log; emergency access is via an unguessable token. Don't weaken these.
- **`ENCRYPTION_KEY` (32-byte hex) is required in production.** Outside
  production a dev key is used with a warning. Never commit real keys; keep them
  out of the repo (systemd `EnvironmentFile`, mode 600).
- **CSP uses a per-request nonce** — no `unsafe-inline`. Client behavior lives in
  `public/app.js` (CSP-safe), not inline scripts. Preserve this when editing
  views.
- **CSRF tokens on all forms**; passwords/PINs hashed with **Argon2id** (legacy
  bcrypt hashes migrate transparently on next login).
- Runs behind a reverse proxy in production (`app.set('trust proxy', 1)`);
  required prod env: `NODE_ENV=production`, `ENCRYPTION_KEY`, `PUBLIC_BASE_URL`
  (HTTPS). See `.env.example`.
- **Mobile deep links** are env-driven and filled in *after* the apps are signed:
  `ANDROID_PACKAGE_NAME` + `ANDROID_CERT_FINGERPRINTS` (the **Play App Signing**
  SHA-256, not the upload key) and `APPLE_APP_IDS` (`<TeamID>.<BundleID>`). Until
  set, `src/applinks.js` serves valid but "unlinked" `.well-known` files (normal pre-build).
- The CHANGELOG follows Keep a Changelog + SemVer; update `CHANGELOG.md` for
  user-facing changes.
- **Never enter real medical data in demo/dev environments.**

---

## Working in this repo

- **Scope changes to one project.** Decide whether the task is `zabobovdol/` or
  `medqr/`, `cd` there, and run that project's gates. Don't mix dependencies or
  tooling between them.
- **Run the full quality gate** for the project you touched before considering
  work done (lint + typecheck/format + test + build as listed above). CI is
  path-filtered, so each workflow only runs when its subdirectory changes.
- **Match the surrounding style.** zabobovdol is strict TypeScript with Zod
  validation and the `@/` alias; medqr is plain ESM JS with Prettier. Keep
  comments and UI strings in Bulgarian.
- **Conventional, descriptive commit messages in Bulgarian** matching existing
  history (e.g. "Печатна брошура А5 (лице/гръб) с QR код…"). Development happens
  on feature branches merged to `main` via PRs.
- Both products are proprietary (`UNLICENSED` / proprietary `LICENSE`) and host
  data in the EU; treat privacy/GDPR and security as primary requirements, not
  afterthoughts. See each project's `SECURITY.md`.

---

## Custom agents — `.claude/agents/`

This repo ships **15 purpose-built Claude Code subagents** (one markdown file each, Bulgarian
system prompt, least-privilege `tools`). Invoke with the Agent tool (e.g. *"пусни Кодаджията
върху промените"*); several run in parallel. Each carries **durable verified memory** and a
**harness-enforced self-learning loop** (`SubagentStart`/`SubagentStop` hooks → `_memory/<id>.md`;
verified-only, source-or-nothing, secrets hard-dropped). The live **dashboard** is `agents-dashboard/`.
All fifteen have reached **v10.0** (mastery) via genuine verified learning.

**Full roster, the self-learning loop (v6→v10 + v7 hardening), the per-agent `tools/<area>/` hands,
the dashboard, and authoring conventions live in [`.claude/agents/README.md`](.claude/agents/README.md).**
Keep that file **and** `agents-dashboard/agents.json` in sync when you add or change an agent.

**Communication style (caveman-inspired):** in agent output and reviews prefer terse, fragment-style
prose; keep every technical token (code, commands, `file:line`, error strings) exact; drop filler;
**never** compress the Bulgarian user-facing UI strings.

> CLAUDE.md hygiene: keep this file lean — deep per-area detail belongs in linked docs, not here.

---

## Deployment workflow — `deploy/`

**Owner preference (the canonical flow):** the GitHub archive is uploaded to the VPS
**manually**, into the **root folder (`/root`)**. From there everything is **automated**,
from unzip to a live server — there is no `git pull` on the box and no CI/CD push.

The automation is `deploy/autodeploy.sh` (lives at the repo root, so it ships inside the
archive). Run once after uploading the archive:

```bash
# 1) (manual) GitHub → Download ZIP → scp Few-few.zip root@SERVER:/root/
# 2) (automated) on the server:
cd /root && unzip -o Few-few.zip >/dev/null
sudo bash /root/few-few-*/deploy/autodeploy.sh
```

It is **idempotent** and **monorepo-aware**: it unpacks into a timestamped release under
`/opt/few-few/releases/`, normalizes the GitHub top folder, then deploys each configured
project — **zabobovdol** via `scripts/deploy.sh` (Docker Compose build + up + migrate,
seed only on first run) and **medqr** via rsync to `/opt/medqr` + `npm ci --omit=dev` +
`systemctl restart medqr` (auto-rollback on health-check failure). Secrets never live in
the archive: `zabobovdol/.env` and `/etc/medqr/medqr.env` stay on the server (mode 600)
and are carried over on each deploy. Config (which projects, paths, health URLs) is the
block at the top of `deploy/autodeploy.sh`. One-time server hardening (users, `ufw`,
systemd unit, Nginx/Caddy, TLS) is in `zabobovdol/DEPLOY.md` and `medqr/deploy/DEPLOY.md`.
The **VPS-аджията** agent owns this pipeline. See `deploy/README.md`.
