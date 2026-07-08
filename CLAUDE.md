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
| `SupremeDiscordBot/` | Supreme Bot — Discord SaaS | Express · discord.js v14 · React 18+Vite · Prisma · PostgreSQL · Redis · Docker · plain JS ESM | supreme.carbonstealth.eu |
| `treydar/` | Трейдъра — spot трейдинг бот (Binance) | Node · CCXT · plain JS ESM | self-hosted · риск-първо, **НЕ** инвест. съвет |
| `Gaming/` | АСО — premium browser gaming portal | TS monorepo (`apps/api·marketing·web`) | multi-lang |
| `Minyor/` | ФК „Миньор“ Бобов дол — клубен сайт | Next.js · React · TS · Prisma | BG |
| `Nexus/` | Nexus Dominion — браузър игра (клиент) | React · Vite · Three.js · TS | — |
| `scuolabulgara/` | Qui Bulgaria — бълг. училище Милано (CMS) | Next.js · React · TS · Prisma | IT/BG multilingue |
| `panev/` | Panev Ascensori — сайт + e-commerce | Express · SQLite · Stripe | IT |
| `kebab/` | Uylas Kebap Center — сайт | static | IT |
| `Ivan/` | sklad — складов backend | Express · Prisma | — |
| `CSPos/` | Carbon Stealth POS — касова система за хранителни магазини | Next.js 15 · React 19 · TS · Prisma · SQLite · Tailwind · Electron (.exe) | BG · Н-18/СУПТО/евро · фискални у-ва + ПОС терминали · тъч |
| `vizitka/` | Vizitka — винаги актуална дигитална визитка (QR профил) | Express · EJS · SQLite · plain JS ESM | BG · vizitka-bg.com |
| `mastilko/` | Мастилко — безплатни етикети, визитки и CV за печат | Next.js 15 · React 19 · TS · Tailwind · Gemini Flash | BG · без база (localStorage) · mastilko-bg.com |
| `linketto/` | Linketto — многоезичен „link in bio“ (конкурент на Linktree) | Next.js 15 · React 19 · TS · Prisma · PostgreSQL · Tailwind · next-intl · Stripe | 6+ езика · 5%/0% комисиони · linketto.carbonstealth.eu |

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
  plain ESM JS + Prettier in medqr/SupremeDiscordBot/treydar/panev. Avoid unjustified `any`.
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

## Учебни промптове — Claude като учител (reusable)

Готови промптове за учене/менторство. Замести `[topic]`/`[skill]` с темата. Пази ги
дословно.

1. **Find Your Weak Spots** — Act as an expert tutor and assess my understanding of
   [topic] by asking me a series of thoughtful questions. Use my answers to identify
   misconceptions, knowledge gaps, and concepts I don't fully understand. After the
   assessment, explain where I'm struggling, why my answers were incorrect or
   incomplete, and what I should focus on improving first. Give me honest, practical
   feedback and prioritize the areas that will have the biggest impact on my
   understanding.

2. **Create a Fast Learning Plan** — Create a step-by-step roadmap for mastering
   [skill] as efficiently as possible. Break the journey into clear learning stages,
   explain what I should learn first and why, define measurable goals for each stage,
   highlight common mistakes to avoid, and suggest practical ways to track my
   progress. Design the plan to maximize learning while minimizing wasted time and
   unnecessary effort.

3. **Simplify Complex Information** — Explain [topic] in the clearest and simplest way
   possible using practical frameworks, relatable examples, analogies, and memorable
   mental models. Organize the information from the most important concepts to the
   least important, clearly show how each idea connects to the next, and remove
   unnecessary jargon or theory. Focus on helping me understand the topic deeply and
   apply it confidently in real-world situations.

4. **Remember What You Learn Better** — Design a spaced repetition system for [topic]
   that helps me retain information for the long term. Create a review schedule that
   tells me exactly what to revise daily, weekly, and monthly, while emphasizing the
   concepts that are most likely to be forgotten. Structure the plan to strengthen
   long-term memory through consistent review rather than last-minute cramming.

5. **Learn With Active Recall** — Teach me [topic] thoroughly, then test my
   understanding using challenging active recall questions without allowing me to rely
   on my notes. After I answer, evaluate each response, explain what I got right and
   wrong, correct any misconceptions, and identify the concepts I still need to
   master. Continue challenging me until I demonstrate a solid understanding of the
   material.

6. **Understand From First Principles** — Explain [topic] using first-principles
   thinking. Break it down into its most fundamental building blocks, explain how each
   part works and how they connect, remove unnecessary complexity, and use simple,
   concrete examples to illustrate the underlying logic. Help me understand why the
   topic works the way it does so I can reason from the fundamentals instead of
   relying on memorization.

7. **Use the Feynman Technique** — Teach me [topic] as if I'm a complete beginner,
   using simple language, relatable examples, and clear explanations. Once you've
   taught the lesson, ask me to explain the topic back to you in my own words.
   Carefully analyze my explanation, identify gaps in my understanding, correct any
   mistakes, clarify confusing concepts, and repeat the process until I can explain
   the topic accurately, clearly, and confidently without relying on memorized
   definitions.

<!-- Maintainer hygiene (stripped from context, costs no tokens):
 • Keep this root file <200 lines and CROSS-CUTTING only. Adherence drops as it grows.
 • Per-product detail → that product's CLAUDE.md (lazy-loaded when Claude reads files there).
 • Verbose multi-step procedures → a skill (.claude/skills/, loaded on demand).
 • Conditional/path-specific rules → .claude/rules/*.md with `paths:` frontmatter (load only on matching files).
 • `@`-imports load at LAUNCH (no token saving) — prefer nested CLAUDE.md for per-area content.
 • Review quarterly: remove stale/contradictory lines (contradictions make Claude pick arbitrarily). -->
