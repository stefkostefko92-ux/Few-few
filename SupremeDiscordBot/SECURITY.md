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
thresholds can be aggressive without affecting anyone. This layer itself has
four parts:

1. **Per source.** Failures counted in a sliding window with an escalating
   lockout: 1 min → 5 min → 30 min → 24 h. Success clears the counter, so a
   human who mistypes once carries nothing forward.
2. **Per subnet** (`/24` IPv4, `/64` IPv6). This closes the real bypass of
   per-IP throttling: a botnet or proxy pool rotates addresses, but rarely
   rotates whole networks. Thresholds here are higher, because legitimate users
   share a network with the attacker. IPv4-mapped IPv6 addresses are normalised,
   so one client cannot obtain two independent budgets.
2b. **Per wide network** (`/16` IPv4, `/48` IPv6), with the most patient
   thresholds of all. IPv6 makes layer 2 weak on its own: providers hand a single
   customer an entire `/48`, i.e. 65,536 distinct `/64` networks, so an attacker
   changes "network" at will without leaving their own allocation. The coarse
   layer catches exactly that rotation while staying far above what legitimate
   traffic from a whole `/16` ever accumulates in *failures*.
3. **Adaptive tightening.** When total failures for a scope spike, per-source
   thresholds contract (5 → 2). We deliberately do **not** block everyone under
   attack — that would be a self-inflicted denial of service, letting an attacker
   lock out legitimate clients. Since legitimate clients almost never fail,
   tightening does not touch them.
4. **Durability via Redis.** Counters and blocks survive restarts and are shared
   across processes and replicas. Memory remains an always-available fallback and
   the decision is *the worse of the two*, so an unavailable Redis narrows reach
   but never disables the defence and never unblocks someone already blocked.
   The Redis client fails fast (no offline queue), so an outage never stalls
   authentication.

Blocked callers are rejected **before** any database work, so guessing costs the
attacker and not us. Each engaged block is written once to the audit log
(`SECURITY_BRUTE_FORCE_BLOCK`) with the source address truncated — enough to see
the shape of an attack, not enough to track a person (GDPR recital 30).

Covered surfaces: public API keys (`/public/v1` and `/api/v1`), the internal bot
secret, public archive transcript tokens, the top.gg webhook secret (that one is
operator-typed, so its entropy is not guaranteed — exactly the case where guessing
is realistic), and **member verification**.

Verification deserves its own note, because it is the anti-raid feature and its
answer space is small by design. A per-panel cap (5 attempts) with a flat cooldown
(10 minutes) does not stop a patient bot: an EASY math challenge has roughly 17
possible answers, so five guesses succeed about 29% of the time *per window* — and
the window resets forever. Failed verifications therefore also feed the escalating
ladder above, keyed per panel and member, so sustained guessing gets exponentially
more expensive instead of resetting. A human who solves the challenge clears their
counter and never notices. The expected answer is generated and held server-side
and never reaches the client.

**What verification still cannot do.** The escalating ladder is keyed per member,
because Discord never tells a bot a member's IP address. A raid using many
throwaway accounts therefore gets a fresh ladder per account; what it does *not*
get is unlimited attempts per account, and account-age gating (Premium) is the
intended answer to disposable accounts. We state this rather than implying the
captcha is raid-proof on its own.

Throttle keys are classified with `net.isIP`, not by "does it contain a colon" —
the network-aggregation layers apply only to real addresses, so a non-address key
(such as `panelId:userId`) is never mistaken for an IPv6 address and never forms a
bogus shared bucket.

Uniform failure messages are deliberate: "no such key" and "revoked key" return
identical responses, so a guesser cannot learn that it hit a real key.

Rate limiting itself rests on correct client identification: `trust proxy` is
scoped to loopback and unique-local addresses, so `X-Forwarded-For` cannot be
spoofed from outside to forge a fresh budget.

The ordinary request-rate limiters (global, auth, bot, archive) are backed by the
same Redis instance through a small custom store. Before that they used
per-process memory, which left two holes: **every restart reset the quotas**, so
an attacker only had to wait for (or provoke) a deploy, and a second replica
would have meant each process enforcing its own counter — an effective ceiling of
N times the advertised one.

**Residual limitation (documented honestly):** without `REDIS_URL` both the
failure counters and the rate limits degrade to process memory — still enforced,
but forgotten on restart and not shared across replicas. Production sets
`REDIS_URL`; the fallback exists so a Redis outage cannot take authentication
down with it.

## Hardening beyond authentication

**Outbound requests (SSRF).** Customers supply URLs the server will fetch —
webhook endpoints and white-label avatars. Delivery originates inside the Docker
network, so the guard (`backend/src/services/webhooks.js`) refuses anything that
leads inward: loopback, unspecified, private (RFC 1918), CGNAT, link-local and
cloud-metadata (`169.254.169.254`), IETF/benchmark blocks, multicast, broadcast;
for IPv6 also ULA, link-local, IPv4-mapped/compatible, **NAT64 (`64:ff9b::/96`,
which wraps the entire IPv4 space)**, 6to4 and Teredo. Addresses are compared
**as addresses** (`net.BlockList`), never as strings — `0:0:0:0:0:0:0:1` is the
same host as `::1` and a string comparison would not know that. Hostnames are
resolved at validation time *and* re-checked by a custom `lookup` at connect
time, which closes the DNS-rebinding window between the two. IPv6 literals are
unbracketed before the check, so a public IPv6 endpoint is accepted and an
internal one is refused with the *real* reason rather than a misleading
"could not be resolved". A caveat we state rather than hide: Node skips
`lookup` for IP literals, so for those the validation-time check is the only
layer — which is why it compares binary, not text.

**Customer-supplied regular expressions (ReDoS).** Form answers can be validated
against a pattern written by the Customer. Each match runs in an isolated
worker thread with a 1 s timeout, so catastrophic backtracking can never stall
the shared event loop. That isolation had a cost of its own — a worker is
~6–10 MB and one was spawned per answer without limit, so 100 concurrent
answers meant ~880 MB — therefore concurrency is capped at 8. At the cap the
answer is accepted without validation: format validation is a convenience for
the applicant, while a live bot is a condition for every tenant, and refusing
would hand an attacker exactly the outcome they want.

**Containers.** The three services we build run as non-root (`USER node`;
`nginx-unprivileged`) with `no-new-privileges` and all Linux capabilities
dropped. Postgres and Redis are deliberately excluded from the capability drop:
their official entrypoints start as root and drop privileges themselves
(`gosu`/`su-exec`), which requires `CHOWN`/`SETUID`/`SETGID`. Published ports
bind to `127.0.0.1` only; TLS terminates at the host reverse proxy.

**Dependencies.** `npm audit --omit=dev` is kept at zero in all three packages.
Where the fixed version sits outside a transitive range we pin it with
`overrides` rather than wait (e.g. `qs` 6.16.0 under Express 4, which locks
`~6.15.1`), and the affected behaviour is exercised in a real request before the
pin lands. Third-party GitHub Actions are pinned by commit SHA; every workflow
declares `permissions`.

## Data protection

Supreme Bot is GDPR-native and EU-hosted. Custom bot tokens are encrypted at
rest with AES-256-GCM; sessions use HTTP-only, Secure, SameSite cookies. For
data-protection matters (Articles 15–17, 20 GDPR), contact
**privacy@carbonstealth.eu** or the DPO at **dpo@carbonstealth.eu**.
