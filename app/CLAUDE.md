# CLAUDE.md — `app/` workspace

All new work happens **in this `app/` folder**. The sibling `zabobovdol/`
folder is an existing, separate project: treat it as **read-only reference**
— never edit, move, delete, or run builds against it.

## Work economically (applies to every session)

The point of this file is to keep sessions short and cheap.

- Do all work inside `app/`. Don't create or change files outside it.
- `zabobovdol/` is off-limits for edits. You may read it for reference only when a task explicitly needs it; otherwise don't explore it — its ~70 `prisma/seed-*.ts` scripts and large lockfile waste context.
- Trust this file instead of re-discovering the layout. Read a file only when about to change it or when you need its exact contents; don't re-read to "verify" an edit the tools already confirmed.
- Prefer Grep/Glob with a tight pattern over reading whole directories or large files; use `offset`/`limit` for big files.
- Run a build/lint/test gate once when relevant, not "just to be sure," and only the gate the change can affect.
- Replies: lead with the outcome, prose, minimal formatting. Skip preamble/postamble. No headers/bullets for simple answers.

## This workspace — „За Дупница" civic portal

A Next.js 15 / React 19 / TypeScript / Prisma / PostgreSQL / Tailwind civic portal
for the town of Dupnitsa, modeled on the read-only `zabobovdol/` reference and
grounded in `research/dupnitsa-digital-gaps.md`. Bulgarian UI, elderly-focused
accessibility. The app root IS this `app/` folder.

- Run commands from `app/`: `npm run dev`, `npm run build`, `npm run lint`,
  `npm run typecheck`, `npm test`. Build/lint/typecheck/test all pass; keep them green.
- MVP pages render from typed, **verified** data in `src/data/*` (each fact has a
  source; unverified phone numbers are flagged). The site builds with **no database**.
  Don't wire pages to Prisma until the admin phase — `prisma/schema.prisma` and
  `prisma/seed.ts` exist for that next step.
- Bulgarian strings use guillemets „…" — the **closing** quote must be the curly
  `“` (U+201D), not a straight `"`, or both `tsc` and the `react/no-unescaped-entities`
  lint rule will break.
- Layout: `src/app/` pages (`/uslugi`, `/dezhurna-apteka`, `/dostapnost`, `/za-nas`)
  + robots/sitemap/manifest; `src/components/` (header, footer, AccessibilityBar,
  inline `icons.tsx`, `ui.tsx`); `src/lib/` (site config, seo, slug, prisma);
  `src/data/` verified content. Accessibility classes (`hc`/`dark`/`bt`) live in
  `src/app/globals.css` and are toggled by `AccessibilityBar`.
- Add new pages to `PRIMARY_NAV`/`FOOTER_NAV` in `src/lib/site.ts` and to the
  `sitemap.ts` PATHS list.
- Forms (signali, kontakti, obyavi/nova, smetishta) use server actions with Zod +
  honeypot, persisting via Prisma; they degrade gracefully without a DB.
- Admin (`/admin/*`) is protected by `src/middleware.ts` (edge-safe session verify
  in `src/lib/session.ts`, Web Crypto HMAC). Login is env-configured —
  `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (no DB user). Server actions
  call `requireSession()` and write an `audit()` log. Public chrome is hidden under
  `/admin` via `ChromeGate`.
- Admin moderates citizen submissions (complaints, dumps, listings, contacts) and
  manages content (events, posts, businesses), which feed the public DB-backed lists.
