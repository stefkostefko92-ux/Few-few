# Security Policy

## Reporting a vulnerability

Please report security issues privately — **do not** open a public issue.
Email the maintainers (see the repository owner profile) with a description,
reproduction steps, and impact. We aim to acknowledge within 72 hours and to
ship a fix or mitigation as quickly as severity warrants. Please allow
reasonable time for a coordinated disclosure.

## Supported versions

The latest `main` (production) is supported. Fixes land there first.

## Security model (overview)

- **Authentication** — httpOnly cookies only (never localStorage). Short-lived
  access JWT + longer refresh JWT scoped to `/api/auth` with `SameSite=strict`;
  the access cookie is `SameSite=lax`. JWTs are signed and verified pinned to
  `HS256`. Passwords hashed with Argon2; login uses a constant-time dummy verify
  to resist account enumeration.
- **Authorization** — role-based (`requireRole`), with stricter staff-write on
  admin mutations. Bans/erasures are enforced immediately via a Redis denylist.
- **CSRF** — defence-in-depth on top of SameSite: an Origin/Referer allowlist
  guard rejects cross-origin state-changing `/api/*` requests.
- **Input validation** — every REST body and every socket event is validated
  with `zod`. Database access is exclusively through Prisma (parameterized).
- **Rate limiting** — Redis-backed, shared across instances: a global limiter,
  a stricter per-IP auth limiter, and a per-account login throttle
  (credential-stuffing). Fails open on a Redis outage by design.
- **Abuse controls (realtime)** — handshake verifies the auth cookie and
  re-checks ban/revocation; per-socket flood guards; bounded message buffer.
- **Transport & headers** — TLS terminates at nginx; `helmet` on the API; HSTS
  and CSP are set at the edge (see `infra/nginx`).
- **Payments** — Stripe credit is applied only from the signed webhook, which is
  idempotent (a `ProcessedEvent` ledger). Money paths are transactional.
- **Privacy / GDPR** — account data export and erasure (anonymize + revoke) are
  supported; secrets and PII are redacted from logs.

## Secrets

No secrets are committed. `.env` is git-ignored; `.env.example` documents every
variable. Production refuses to boot on placeholder secrets.
