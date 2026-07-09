# Contributing to АСО

Thanks for contributing! This is a pnpm + Turborepo TypeScript monorepo.

## Prerequisites

- Node `>=22` (an `.nvmrc` pins the major — run `nvm use`)
- pnpm `10.33.0` (`corepack enable` will provide it from `packageManager`)
- Docker (for local Postgres + Redis)

## Local setup

```bash
pnpm install
cp .env.example .env            # fill in secrets (min 32 chars for JWT_*)
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm --filter @aso/db generate
pnpm --filter @aso/db migrate:deploy
pnpm dev                        # runs all apps via turbo
```

Apps: `api` :4500 · `realtime` :4501 · `web` :4502 · `marketing` · `worker`.

## Quality gates (run before pushing)

```bash
pnpm typecheck   # tsc --noEmit, strict everywhere
pnpm lint        # eslint (flat config, no-any, eqeqeq)
pnpm test        # vitest across packages
pnpm build       # turbo build
```

CI runs the same four on every PR; all must be green.

## Testing patterns

- **Unit/logic** — `vitest`, files named `*.test.ts` next to the source.
  Game engines live in `packages/game-core` and must stay deterministic (all
  randomness via the injected `SeededRng`).
- **HTTP** — prefer `supertest` against the Express app for new API routes.
- **E2E** — Playwright specs in `apps/web/e2e/*.spec.ts`. They need the full
  stack: `infra/e2e-stack.sh up`, then `pnpm --filter @aso/web e2e`. (`vitest`
  excludes `e2e/`.)

## Commit & PR conventions

- Conventional-commit style prefixes: `feat`, `fix`, `perf`, `a11y`, `harden`,
  `test`, `docs`, `chore`, scoped where useful (`feat(web): …`).
- Keep PRs focused; update tests and docs with the change.
- PR checklist: gates green · tests added/updated · no secrets committed
  (`.env` is git-ignored) · user-facing strings added to all locales
  (`apps/web/src/i18n/{bg,en,it}`).

## Code style

TypeScript `strict` is on (incl. `noUncheckedIndexedAccess`). No `any`. Validate
all external input with `zod`. Prettier (printWidth 100) formats everything:
`pnpm format`.
