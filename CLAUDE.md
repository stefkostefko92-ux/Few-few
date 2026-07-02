# CLAUDE.md

Guidance for AI assistants working in this **monorepo** — several independent
products by Carbon Stealth VCC (https://carbonstealth.eu). Products share **no
code**: separate deps, toolchains, CI and deploy paths. Always `cd` into the
product you touch — **there is no root `package.json`** (root `.gitignore` only
ignores `node_modules/` and `.DS_Store`).

**Every product dir has its own `CLAUDE.md`** with the deep detail — it loads **on
demand only when you read files there** (zero token cost otherwise), so this root
file holds only what is true across all products. Keep it that way.

## Products

| Dir | Product | Stack | Notes |
|-----|---------|-------|-------|
| `zabobovdol/` | За Бобов дол — граждански портал | Next.js 15 · React 19 · TS · Prisma · PostgreSQL · Tailwind | BG · zabobovdol.carbonstealth.eu |
| `medqr/` | MedQR — спешен мед. профил (QR/NFC) | Express · EJS · SQLite · plain JS ESM | BG/EN · medqr.carbonstealth.eu |
| `supreme/` | Supreme Bot — Discord SaaS | Express · discord.js v14 · React 18+Vite · Prisma · PostgreSQL · Redis · Docker · plain JS ESM | supreme.carbonstealth.eu |
| `treydar/` | Трейдъра — spot трейдинг бот (Binance) | Node · CCXT · plain JS ESM | self-hosted · риск-първо, **НЕ** инвест. съвет |
| `Gaming/` | АСО — premium browser gaming portal | TS monorepo (`apps/api·marketing·web`) | multi-lang |
| `Minyor/` | ФК „Миньор“ Бобов дол — клубен сайт | Next.js · React · TS · Prisma | BG |
| `Nexus/` | Nexus Dominion — браузър игра (клиент) | React · Vite · Three.js · TS | — |
| `scuolabulgara/` | Qui Bulgaria — бълг. училище Милано (CMS) | Next.js · React · TS · Prisma | IT/BG multilingue |
| `panev/` | Panev Ascensori — сайт + e-commerce | Express · SQLite · Stripe | IT |
| `kebab/` | Uylas Kebap Center — сайт | static | IT |
| `Ivan/` | sklad — складов backend | Express · Prisma | — |

Non-product dirs: `agents-dashboard/` (live agent dashboard → Netlify), `tools/`
(agents' "hands" — real scripts), `deploy/` (autodeploy), `.claude/` (agents,
hooks, rules).

## Global rules

- **One project per change.** `cd` into it; never mix deps/tooling across products.
- **Bulgarian is the source of truth** for UI text, code comments, commits and
  docs (some products are IT/multilingual — match the product). Use „ … “ quotes.
  **Never machine-translate safety-critical medical/legal strings.**
- **Run that project's full quality gate before you call work done** (lint +
  typecheck/format + test + build — listed in the product's `CLAUDE.md`/`README`).
  CI is **path-filtered**: each workflow runs only when its subdir changes.
- **Match the surrounding style.** Strict TS + Zod + `@/*` alias in the Next apps;
  plain ESM JS + Prettier in medqr/supreme/treydar/panev. Avoid unjustified `any`.
- **Commits: Bulgarian, conventional, descriptive** (e.g. „Печатна брошура А5…“),
  matching existing history. Feature branch → PR → `main`.
- **Proprietary, EU-hosted.** GDPR + security are primary requirements, not
  afterthoughts; see each product's `SECURITY.md`. **Secrets never enter the repo
  or the deploy archive** — they live on the server (mode 600).

## Custom agents — `.claude/agents/`

16 purpose-built subagents (BG system prompt, least-privilege `tools`), each with
**durable verified memory** + a **hook-enforced self-learning loop**
(`SubagentStart`/`SubagentStop` → `_memory/<id>.md`; verified-only,
source-or-nothing, secrets hard-dropped). Live dashboard: `agents-dashboard/`.
Invoke via the Agent tool (*„пусни Кодаджията върху промените“*); several run in
parallel. **Full roster, the loop, per-agent `tools/<area>/`, the dashboard and
authoring rules → [`.claude/agents/README.md`](.claude/agents/README.md).** Keep
that file **and** `agents-dashboard/agents.json` in sync when you change an agent.

**Communication style (caveman):** terse, fragment prose; every technical token
(code, commands, `file:line`, error strings) exact; drop filler; **never**
compress the Bulgarian user-facing UI strings.

## Deployment — `deploy/`

Canonical flow (owner preference): GitHub ZIP uploaded **manually** to `/root`,
then fully automated — no `git pull` on the box, no CI/CD push.

```bash
cd /root && unzip -o Few-few.zip >/dev/null
sudo bash /root/few-few-*/deploy/autodeploy.sh   # idempotent, monorepo-aware
```

`autodeploy.sh` (ships in the archive) unpacks a timestamped release under
`/opt/few-few/releases/` and deploys each configured project — zabobovdol via
Docker Compose (build + up + migrate, seed only on first run); medqr via rsync +
`npm ci --omit=dev` + `systemctl restart medqr` (auto-rollback on health-check
fail). Secrets stay on the server and carry over. Full flow + one-time hardening
→ `deploy/README.md`, `zabobovdol/DEPLOY.md`, `medqr/deploy/DEPLOY.md`. The
**VPS-аджията** agent owns this pipeline.

<!-- Maintainer hygiene (stripped from context, costs no tokens):
 • Keep this root file <200 lines and CROSS-CUTTING only. Adherence drops as it grows.
 • Per-product detail → that product's CLAUDE.md (lazy-loaded when Claude reads files there).
 • Verbose multi-step procedures → a skill (.claude/skills/, loaded on demand).
 • Conditional/path-specific rules → .claude/rules/*.md with `paths:` frontmatter (load only on matching files).
 • `@`-imports load at LAUNCH (no token saving) — prefer nested CLAUDE.md for per-area content.
 • Review quarterly: remove stale/contradictory lines (contradictions make Claude pick arbitrarily). -->
