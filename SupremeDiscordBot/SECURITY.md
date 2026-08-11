# Security Policy

Carbon Stealth VCC takes the security of Supreme Bot and its customers' data
seriously. This document explains how to report vulnerabilities and what to
expect from us.

## Reporting a vulnerability

Please report security issues privately to **security@carbonstealth.eu**.

Do **not** open public GitHub issues for security vulnerabilities.

When reporting, please include:

- A description of the issue and its potential impact
- Steps to reproduce (proof-of-concept where possible)
- Affected component (web dashboard, backend API, Discord bot) and version/commit
- Any relevant logs or screenshots

A machine-readable disclosure policy is published at
[`/.well-known/security.txt`](https://supremebot.carbonstealth.eu/.well-known/security.txt)
(RFC 9116).

## Our commitment

- We acknowledge new reports within **2 business days**.
- We provide an assessment and remediation timeline within **7 business days**.
- We will keep you informed of progress and notify you when the issue is resolved.
- We will credit you for the discovery (with your consent) once a fix is shipped.
- We will not pursue legal action against researchers acting in good faith who
  follow this policy and avoid privacy violations, service disruption, or data
  destruction during testing.

## Scope

In scope:

- `supremebot.carbonstealth.eu` (web dashboard and public REST API)
- The Supreme Bot Discord application
- This repository's source code

Out of scope:

- Third-party services we rely on (Discord, Stripe, Hetzner, Google) —
  report those to the respective vendor.
- Denial-of-service / volumetric attacks, social engineering, and physical attacks.

## Anti-brute-force posture

Every secret-bearing surface is defended in **three independent layers**, so a
failure in one does not expose the secret. The design follows NIST SP 800-63B
§5.2.2 (throttle failed authentication attempts) and OWASP ASVS 4.0 V2.2.1
(anti-automation), rather than relying on request-rate limits alone.

**Layer 1 — cryptographic strength.** API keys carry 192 bits of entropy
(`crypto.randomBytes(24)`); public archive links carry 128 bits. Guessing either
is computationally infeasible regardless of throttling. Secrets are stored as
SHA-256 hashes, never in plaintext.

**Layer 2 — constant-time comparison.** Bot secret, top.gg webhook secret and
archive tokens are compared with `timingSafeEqual`, with a length check first.
A naive `===` leaks the position of the first mismatch through timing.

**Layer 3 — throttling of *failed* attempts** (`backend/src/lib/bruteForce.js`).
Request-rate limits protect the resource; they do not protect the secret — a
legitimate client practically never mistypes its own credential, so failure
thresholds can be aggressive without affecting anyone. Failures are counted per
source in a sliding window, with an escalating lockout (1 min → 5 min → 30 min →
24 h). Success clears the counter. Blocked callers are rejected **before** any
database work, so guessing costs the attacker and not us. Each engaged block is
written once to the audit log (`SECURITY_BRUTE_FORCE_BLOCK`) with the source
address truncated — enough to see the shape of an attack, not enough to track a
person (GDPR recital 30).

Covered surfaces: public API keys (`/public/v1` and `/api/v1`), the internal bot
secret, public archive transcript tokens, and the top.gg webhook secret. Member
verification (captcha) is throttled separately and server-side, with a
per-panel attempt cap and cooldown; the expected answer never reaches the client.

Uniform failure messages are deliberate: "no such key" and "revoked key" return
identical responses, so a guesser cannot learn that it hit a real key.

**Known limitation (deliberate, documented):** throttling state lives in process
memory. It is shared correctly behind our reverse proxy (`trust proxy` is scoped
to loopback and unique-local addresses, so `X-Forwarded-For` cannot be spoofed
from outside), but it resets when the API process restarts and is not shared
across replicas. Given a single API replica and operator-controlled restarts,
this is an accepted trade-off against adding a Redis dependency to the
authentication hot path. Moving the counters to Redis is the next step if the
API is ever scaled horizontally.

## Data protection

Supreme Bot is GDPR-native and EU-hosted. Custom bot tokens are encrypted at
rest with AES-256-GCM; sessions use HTTP-only, Secure, SameSite cookies. For
data-protection matters (Articles 15–17, 20 GDPR), contact
**privacy@carbonstealth.eu** or the DPO at **dpo@carbonstealth.eu**.
