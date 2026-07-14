# Custom agents — `.claude/agents/`

> Изнесено от `CLAUDE.md`, за да не подпухва глобалният контекст (той се зарежда на всяко
> извикване). Тук живеят пълният ростер, цикълът на самообучение и инструментите на агентите.

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
| **Трейдъра** `treydara.md`                | **Automated-trading systems engineering** at enterprise grade — **NOT a profit machine, NOT investment advice**. Exchange APIs (**CCXT**, Binance/Bybit/Kraken REST+**WebSocket**), **order idempotency** (`clientOrderId`, no blind retry after network error), rate limits/backoff, reconnect+resubscribe+**reconcile**, **precision** (tick/lot/`minNotional`, floor, no float money), **risk-first** (position sizing, mandatory **stop-loss on the exchange**, daily loss limit, global **max-drawdown → kill-switch**), **honest backtesting** (no look-ahead/survivorship bias, fees+slippage, walk-forward, out-of-sample), then **paper/testnet before real capital**. Security: keys with **no withdrawal**, IP allowlist, secrets out of the repo. EU regulation-aware (**MiFID II** art. 17, MAR market-abuse). `trader-lint.mjs` flags missing `clientOrderId`, blind retry, float money, missing stop-loss/kill-switch, WS-no-reconnect, tight poll loops, backtest look-ahead, hardcoded keys; `backtest-check.mjs` catches missing fees/slippage/out-of-sample + look-ahead. **Never guarantees profit; every delivery ends with a not-investment-advice / capital-at-risk disclaimer.** |

| **Качествения** `kachestveniyat.md`       | **Code quality** (distinct from Кодаджията's bug/security hunting): maintainability, readability & simplicity — duplication/**DRY limits** (rule-of-three, wrong-abstraction), **cyclomatic** (McCabe ~10) & **cognitive complexity** (SonarSource), single responsibility & size, **connascence**/coupling, dead code, error-handling shape, and **test quality** (behavior not coverage theater; mutation testing for strength). Proposes minimal, **behavior-preserving** refactors from Fowler's catalog with `file:line`, ranked by impact × effort (**churn × complexity** hotspots). Keeps the product gate (lint/format/typecheck/test) green; tidy separated from behavior (Beck). Hands off with **Кодаджията** through a gate. |
| **AI-джията** `ai-djiyata.md`             | **LLM/AI provider integration** at enterprise grade (Google **Gemini**, OpenAI, Anthropic Claude): model lifecycle (deprecations, fixed-version vs **„-latest“ aliases**, 404 unknown-model), generation config (**thinking/reasoning budgets** — `thinkingBudget:0` so reasoning tokens don't eat `maxOutputTokens`), auth (key format `AIza…` vs OAuth, `x-goog-api-key`/Bearer), rate limits & quotas (free vs paid tier, `429 RESOURCE_EXHAUSTED`, EEA restrictions), resilient server proxy route (timeout, error-by-code, Zod, graceful degradation), streaming/structured-output/tool-calling, prompt engineering, cost. Security & GDPR: **key server-only** (never in repo/bundle), client never talks to the provider directly, user input to the provider is **disclosed** (coordinate with Правния Разбирач). Verifies models/limits against **live provider docs** (they change often). |
All seventeen agents have reached **v10.0** — mastery — through genuine, source-verified learning
(see the version scheme below). Each definition layers: an **operating contract** (v1.0 —
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
the embedded FALLBACK in `index.html`, atomic write + lock) and **bumping the agent's version**
(a `vX.Y — учене` timeline entry — verified learning level-ups the agent; quarantine and repeat lessons
don't). **Version scheme (`bumpVersion` in `memory-capture.mjs`):** each verified lesson is +0.1 and
**every 10 verified lessons roll into a +1 major** (6.9 → 7.0 → … → **10.0**); minor is a single digit
0–9 and the version **caps at 10.0 = mastery** (40 verified lessons). So the agents-lab page updates
itself on every new lesson; `tools/memory/curate.mjs` then dedups, caps size, and flags contradictions for human review. The
verify gate (only tool/eval/test/live-source-backed lessons become fact) is what keeps it flawless —
no unverified claim contaminates memory. Hooks are registered in `.claude/settings.json`, scoped by
matcher to the seventeen agent types; the schema + `learn`-block format live in `.claude/agents/_memory/PROTOCOL.md`.
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
