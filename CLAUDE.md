# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Repository overview

This is a **monorepo containing two independent products** by Carbon Stealth VCC
(https://carbonstealth.eu). They share no code and have separate dependencies,
toolchains, CI workflows and deployment paths. Always work inside the relevant
subdirectory.

| Dir            | Product       | Stack                                                        | Public URL                          |
| -------------- | ------------- | ----------------------------------------------------------- | ----------------------------------- |
| `zabobovdol/`  | За Бобов дол  | Next.js 15 (App Router) · React 19 · TypeScript · Prisma · PostgreSQL · Tailwind | https://zabobovdol.carbonstealth.eu |
| `medqr/`       | MedQR         | Node.js · Express · EJS · SQLite (better-sqlite3) — plain JS (ESM) | https://medqr.carbonstealth.eu      |

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

This repo ships a small team of **purpose-built Claude Code subagents**. Each is a
markdown file with YAML frontmatter (`name`, `description`, `tools`, `model`) and a
Bulgarian system prompt distilled from deep web + GitHub research. Invoke one with the
Agent tool (e.g. *"пусни Кодаджията върху промените"*); several can run in parallel.

| Agent (file)                              | Викай го за…                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| **Правният Разбирач** `pravniyat-razbirach.md` | EU-law audit: GDPR, ePrivacy/cookies, DSA, accessibility (EAA/WCAG 2.1 AA), imprint, robots/sitemap/llms/JSON-LD. Read-only auditor; ends every legal output with a „not legal advice“ disclaimer. |
| **Кодаджията** `kodadjiyata.md`           | Code review & bug hunting (Next.js/Prisma + Express/SQLite): correctness, OWASP, auth, XSS/CSRF, data leaks, perf. Diff-focused; **adversarially self-verifies** every finding before reporting; severity × confidence with `file:line`. |
| **Геймъра** `geymara.md`                  | Writing/reviewing FiveM (CFX) Lua resources: fxmanifest, client/server/shared, events, ESX/QBCore/Qbox-ox, ox_lib/oxmysql. **Server-authoritative validation** and native/Wait discipline are non-negotiable. |
| **SEO** `seo.md`                          | Discoverability & ranking: classic SEO + GEO/AEO (answer-engine optimization), Core Web Vitals, JSON-LD coverage, multilingual hreflang (bg/en/it), sitemap/robots/llms. Findings ranked by impact × effort. |
| **Преводач** `prevodach.md`               | Localization across **BG → EN → IT**: keeps UI strings & content in sync, per-language typography/register, safety-critical medical wording. Bulgarian is the source of truth. |
| **Сийдъра** `siydara.md`                  | zabobovdol Prisma seed scripts (`prisma/seed-*.ts`): idempotent `upsert`-keyed content (how-to guides, services, scams…), registers them in `package.json` + `db:seed:all`. Verified Bulgarian facts. |
| **VPS-аджията** `vps-adjiyata.md`         | The rented server (Hetzner/EU, Ubuntu) & deploy: owns `deploy/autodeploy.sh` (archive in `/root` → live), Docker Compose / systemd, Nginx/Caddy, TLS, backups, hardening, diagnostics. |
| **3D Maniac** `3d-maniac.md`              | 3D reverse engineering & Mesh→Solid CAD for **carbon-fiber motorcycle parts**; QuickSurface Pro power user: scan→CAD, class-A NURBS (G2), deviation analysis, design-intent capture, composite tooling (ply offset, draft, parting lines), automation via CadQuery/build123d/FreeCAD/PyMeshLab/Open3D. |
| **Социалджията** `socialdjiyata.md`       | Social Media Manager for max **reach/visibility** (TikTok/Reels/Shorts/X/LinkedIn/FB): hook science, retention, social SEO, cadence/repurpose. Uniquely **produces clips** via a scriptable pipeline (ffmpeg reframe 9:16, WhisperX karaoke captions, cut-on-silence, music duck, −14 LUFS, C2PA/AI disclosure). |
| **Продавача** `prodavacha.md`             | E-commerce & online payments at enterprise grade: correct **Stripe** integration (Checkout/Payment Element/PaymentIntents, SCA/3DS, signature-verified **idempotent webhooks**), Stripe Billing (subscriptions, trials, proration, dunning, Customer Portal, Stripe Tax, invoices), minimal **PCI scope** (SAQ A), and EU online-selling law (VAT OSS/IOSS, 14-day withdrawal + Art. 16(m), Omnibus, ЗЗП). **Never trusts client-side amounts; access is granted via verified webhook, not a redirect.** |
| **Мобилджията** `mobildjiyata.md`         | iOS & Android apps at enterprise grade: the repo's two paths (**Capacitor** wrapper for medqr, **TWA/Bubblewrap** for zabobovdol) + native capabilities (push APNs/FCM, Universal/App Links, **Core NFC**, biometrics, offline), security by **OWASP MASVS** (Keychain/Keystore, no secrets in the bundle), accessibility (EAA/EN 301 549), and passing **App Store Review** (Guideline 4.2 for wrappers, Privacy Manifest, ATT) + **Google Play** (App Signing, AAB, target API, Data Safety). **A thin wrapper gets rejected; give it native value.** |
| **Принтаджията** `printadjiyata.md`       | 3D design & print-prep for the **Creality K2 Plus** (FDM, CoreXY, 60 °C chamber, **CFS** multi-colour up to 16 filaments): design-for-FDM (walls, overhangs, **orientation/anisotropy**, tolerances/fits, heat-set inserts, elephant-foot), slicing (Creality Print / OrcaSlicer, **3MF**), multi-colour with **minimum CFS waste**, and mesh hygiene (watertight/manifold, mm, normals). Distinct from **3D Maniac** (scan→CAD reverse-engineering / NURBS / carbon moulds) — this is parametric print-ready FDM. |
| **Дизайнера** `dizayner.md`               | Brutal, weird, mindblowing web **visual effects** at Awwwards level: WebGL/**Three.js** (+react-three-fiber/drei/postprocessing), **WebGPU/TSL/WGSL**, **GLSL** shaders (raymarching/SDF, noise, fresnel, displacement, post-fx), animation (**GSAP**+ScrollTrigger/SplitText/Flip, Motion, anime.js v4, WAAPI, View Transitions, CSS scroll-driven, **Lenis**), 2D/generative (Pixi v8, p5, SVG filters, blend modes), physics (Rapier/Matter), Lottie/Rive. Unique imagination, **context-driven**: full `prefers-reduced-motion`/progressive-enhancement discipline for **serious** sites (corporate/medical/civic — incl. zabobovdol/medqr); **maximal spectacle by default** for **creative**/brand sites; the one universal rule (both modes) is **never strobe** (WCAG 2.3.1, seizure safety). `motion-a11y.mjs` takes a `--creative` flag. |
| **Хромаджията** `hromadjiyata.md`         | Google **Chrome extensions** (and Edge/Brave/Chromium) at enterprise grade, **Manifest V3-native**: event-driven **service worker** (ephemeral lifecycle, synchronous listeners, state in `chrome.storage`, `chrome.alarms`), **content scripts** (isolated/MAIN world), least-privilege permissions (**`activeTab`**/`optional_permissions` over `<all_urls>`), message passing, **`declarativeNetRequest`** instead of blocking `webRequest`, action/**Side Panel**/offscreen APIs, strict extension **CSP**, OAuth/identity. Passes **Chrome Web Store** review (MV3-only, **single purpose**, **zero remote code**, honest data disclosure) and publishing; migrates **MV2→MV3**. `mv3-lint.mjs` flags MV2 leftovers, remote code, weak CSP, broad permissions, blocking webRequest, `localStorage` in the SW. |
| **Дискорджията** `diskordjiyata.md`       | **Discord** at enterprise grade — bots, webhooks & everything Discord: **application/slash commands**, **interactions** (3s reply, **defer**, 15-min token) and **message components** (buttons/select/modals), **Gateway** (WebSocket, **intents** incl. privileged, **sharding**, heartbeat/resume), **REST API v10**, **Webhooks** (execute + embeds), **OAuth2** (scopes `bot`/`applications.commands`, bitwise permissions), **HTTP interactions** with **Ed25519** signature verification + PING→PONG, **rate limits** (per-route buckets + global, 429/`retry_after`, Cloudflare-ban threshold), `discord.js`/`discord.py`. Security: **secret token** (never in code/git), **least-privilege intents**, validated input, `allowed_mentions` guard. `discord-lint.mjs` flags hardcoded tokens/webhook URLs, privileged intents, missing Ed25519 verification, no-defer, tight REST loops. |

All fifteen agents are at **v6.0**. Each definition layers: an **operating contract** (v1.0 —
source-or-silence, verify-before-asserting, confidence labels, self-check, stop-and-ask, Definition
of Done); a **v1.1** worked example + competence boundary; a **v2.0** *instrumented-executor* block
(runs real `tools/<area>/`); a **v2.1 reliability** block (Chain-of-Verification for legal/SEO/
translator, Reflexion against real gates for code/seed/VPS/FiveM, deterministic graders only for 3D,
cross-family judge calibration); a **v3.0–5.0** block — **team orchestration** (agents hand off
through gates), **file-based memory** (durable verified learnings), and **autonomy/self-audit**; and
a **v6.0 self-improvement loop** (below). When upgrading an agent, append an `evolution` entry + bump
the version in `agents-dashboard/agents.json`.

**v6.0 — the self-improvement loop (harness-enforced, drift-proof).** Subagents are stateless, so
genuine "learn every time it runs" can only be *enforced by the harness*, not left to the model to
remember. The loop is **read → act → verify → persist → curate**: a `SubagentStart` hook
(`.claude/hooks/memory-preload.mjs`) injects each agent's *verified* memory into its context at spawn;
the agent ends every turn with a strict, self-identifying ```learn block; a `SubagentStop` hook
(`.claude/hooks/memory-capture.mjs`) parses it from the transcript and persists it — **verified
lessons → memory, everything else → a `Карантина` (quarantine) section that is never read as fact** —
deduping as it goes (works even for the read-only auditors that can't write files themselves) and
also **appending a learning entry to that agent's activity feed in the dashboard** (`agents.json` +
the embedded FALLBACK in `index.html`, atomic write + lock) and **bumping the agent's minor version**
(6.1 → 6.2 → …, a `vX.Y — учене` timeline entry — verified learning level-ups the agent; quarantine and
repeat lessons don't; major versions stay for architectural upgrades) so the agents-lab page updates itself
on every new lesson; `tools/memory/curate.mjs` then dedups, caps size, and flags contradictions for human review. The
verify gate (only tool/eval/test/live-source-backed lessons become fact) is what keeps it flawless —
no unverified claim contaminates memory. Hooks are registered in `.claude/settings.json`, scoped by
matcher to the fifteen agent types; the schema + `learn`-block format live in `.claude/agents/_memory/PROTOCOL.md`.
**v7.0 hardening** (distilled from GitHub prior art — anthropic-cookbook `research_subagent`, wshobson
PluginEval, Mem0, DSPy/Guardrails/ragas): the capture hook now **hard-drops any lesson containing a
secret/key/token**, **downgrades a `verified` lesson whose source isn't a real URL/`file:line`/tool to
quarantine** (don't trust self-assessment), and `curate.mjs` **flags time-sensitive verified facts older
than 45 days for re-verification** (TTL/provenance); agents must run **Chain-of-Verification** before
marking anything `verified`. See PROTOCOL.md's "v7.0 — закалена безгрешност" section.

Supporting files under `.claude/agents/`:
- **`_shared/glossary.md`** — canonical BG·EN·IT glossary (incl. the *verified* clinical terms
  and the ready IT base) + base project facts, so agents don't re-derive or drift. Преводач owns it.
- **`_orchestration.md`** — v3.0 team handoff map (who passes work to whom, common multi-agent flows).
- **`_memory/<id>.md`** — per-agent durable memory: a `Проверени поуки (verified)` section (facts,
  preloaded into the agent each run) + a `Карантина` section (unverified hypotheses, never treated as
  fact). v6.0 makes the read/write automatic via hooks; `_memory/PROTOCOL.md` defines the `learn`-block
  schema and the laws (verified-only, source-or-nothing, no secrets, contradiction → stop).
- **`_proposals/v2.0.md`** — the v2.0 roadmap (✅ shipped vs 🟡 planned, per agent, with effort).
- **`_evals/reliability.md`** — the v2.1 reliability playbook (which technique per agent + judge
  calibration); **`_evals/run.sh`** under `tools/evals/` is the runnable deterministic-grader gate
  (it caught the 536 duplicate seed slugs). **`_evals/promptfooconfig.yaml`** scaffolds the LLM-rubric layer.
- **`_evals/golden-cases.md`** — one manual golden case per agent (input + expected traits +
  pitfalls); run an agent against its case after an upgrade to catch regressions.

Agents have real "hands" — runnable scripts under **`tools/<area>/`**, one area per agent
(each with a README + requirements, degrading gracefully when an optional tool is absent):
`tools/legal/` (consent-scan + a11y via Playwright/axe), `tools/code/` (scan.sh: Semgrep +
osv-scanner + gitleaks + SBOM, with repo-specific `semgrep-rules.yml`), `tools/fivem/`
(luacheck/selene configs + CI), `tools/seo/` (cwv.mjs PSI/CrUX, check-jsonld.mjs, ai-bots.mjs),
`tools/i18n/` (check-parity.mjs, pseudo.mjs), `tools/seed/` (check-dups.mjs, zod-factory.example.ts),
`tools/vps/` (Ansible skeleton, backup-verify.sh, monitoring compose), `tools/3d/`
(clean_and_validate.py, ransac_segment.py, generate_mold.py), `tools/social/` (clip.sh, trends.py,
c2pa-sign.sh, publish.md), `tools/commerce/` (stripe-lint.mjs: static detector of Stripe
anti-patterns + `stripe listen`/`trigger` notes), `tools/mobile/` (store-readiness.mjs: detects
thin-wrapper/4.2 risk, secrets in the bundle, missing Privacy Manifest/usage descriptions, TWA
assetlinks), `tools/print/` (printability.mjs: binary-STL watertight/manifold + build-volume +
units check for the K2 Plus), `tools/design/` (motion-a11y.mjs: flags animation without a
`prefers-reduced-motion` gate, WebGL without a fallback, autoplay/strobe, inline-script CSP risk),
`tools/chrome/` (mv3-lint.mjs: flags MV2 leftovers, remote code/`eval`, weak extension CSP, broad
`host_permissions`, blocking `webRequest`, `localStorage` in the service worker — Chrome MV3),
`tools/discord/` (discord-lint.mjs: flags hardcoded bot tokens/webhook URLs, privileged intents,
HTTP interactions without Ed25519 verification, interaction without defer, tight REST loops, `@everyone`
without `allowed_mentions`),
and `tools/memory/` (curate.mjs: dedup/cap/contradiction-flag for the v6.0 self-learning memory). The shipped-vs-planned split per agent is in `_proposals/v2.0.md`.
The v6.0 loop's hooks live in **`.claude/hooks/`** (`memory-preload.mjs` + `memory-capture.mjs`),
registered in `.claude/settings.json`.

Conventions when authoring or editing an agent: keep the **system prompt in Bulgarian**;
scope `tools` to least privilege (read-only auditors: Правният Разбирач, SEO, Кодаджията; the
rest may write files/run scripts); give the `description` crisp triggers so the agent
auto-selects; add a worked example + competence boundary; bump the version + append an
`evolution` entry in `agents-dashboard/agents.json` whenever you change a definition.

### Agents lab dashboard — `agents-dashboard/`

A self-contained page (`index.html`, no build step) that visualizes the roster: each
agent's capabilities, **evolution timeline** (versions) and an **activity feed**, driven by
`agents.json` (the canonical manifest; the HTML also embeds a fallback snapshot so it opens
over `file://`). Open it directly, or serve it: `python3 -m http.server -d agents-dashboard`.
Note: Claude Code subagents are stateless between runs — they don't persistently "learn", so
the dashboard tracks the honest equivalent: how each definition *evolves* and what it's *used
for*. Keep `agents.json` in sync when you add/upgrade an agent.

### Communication style (caveman-inspired)

Following the *caveman* approach (https://github.com/juliusbrussee/caveman — "why use many
token when few token do trick"): in agent output and reviews, prefer terse, fragment-style
prose that keeps every technical token (code, commands, `file:line`, error strings) exact and
drops filler. Compress the prose, never the substance — and never the Bulgarian user-facing
UI strings, which stay full and natural.

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
