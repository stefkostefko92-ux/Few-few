# Record of Processing Activities (ROPA)

**GDPR Article 30 compliance document**  
**Controller/Processor:** Carbon Stealth VCC  
**EIK:** 208725180 · **VAT (ЗДДС):** BG208725180  
**Address:** ul. Samuil 3, Bobov Dol, Kyustendil Province, Bulgaria  
**Contact:** privacy@carbonstealth.eu  
**Last updated:** 2026-09-02  
**Version:** 1.2 — added Activities 13–16 (sticky roles, server activity logging, public API keys, outbound webhooks), which had been live in the product without a record entry

---

## Entity Information

- **Legal name:** Carbon Stealth VCC <!-- ТОЧНАТА правна форма: потвърди с юриста (въпрос №11 от досието) -->
- **Registration:** EIK 208725180, VAT BG208725180, Bulgaria
- **Representative:** Stefan Lyubomirov Kostadinov (Managing Director)
- **Data Protection Officer:** Not yet appointed (threshold Article 37 not yet met; volunteer designation planned)
- **DPO email:** privacy@carbonstealth.eu (interim)

## Processing Activity 1 — Supreme Bot Account Management

| Field | Value |
|---|---|
| **Purpose** | Provide user authentication, session management, dashboard access |
| **Legal basis** | Article 6(1)(b) — Contract performance |
| **Data categories** | Discord user ID, username, avatar URL, email (if provided), OAuth tokens (encrypted) |
| **Data subjects** | Dashboard users (server admins, moderators) |
| **Recipients** | Internal staff with RBAC access; Stripe (billing data); Discord (authentication handshake) |
| **3rd country transfers** | USA (Discord) — SCC safeguards |
| **Retention period** | Duration of account + 30 days grace period, then anonymization |
| **Security measures** | Encrypted cookies, httpOnly, SameSite=Lax, session pruning, MFA for admin |

## Processing Activity 2 — Ticket System

| Field | Value |
|---|---|
| **Purpose** | Manage customer support tickets for Customer's Discord communities |
| **Legal basis** | Article 6(1)(b) — Contract performance; Article 6(1)(f) — Legitimate interest of Customer |
| **Data categories** | Ticket content (messages), Discord IDs of participants, attachments URLs, timestamps |
| **Data subjects** | Discord community members who open tickets |
| **Recipients** | Customer's authorized staff only; Supreme Bot internal staff for technical support (rare) |
| **3rd country transfers** | Google (USA) if AI auto-reply enabled — SCC safeguards |
| **Retention period** | Free tier: 30 days after close; Premium: indefinite (Customer-controlled); Anonymized on account deletion |
| **Security measures** | Database-level encryption, TLS, channel-level Discord permissions |

## Processing Activity 3 — Application Forms

| Field | Value |
|---|---|
| **Purpose** | Collect and review applications for Customer's Discord communities (staff applications, membership, etc.) |
| **Legal basis** | Article 6(1)(a) — Consent (applicant voluntarily fills form); Article 6(1)(b) — Contract performance |
| **Data categories** | Form answers (may include free-text with PII), Discord IDs, application status |
| **Data subjects** | Applicants to Customer's communities |
| **Recipients** | Customer's authorized reviewers |
| **3rd country transfers** | None (processing within EU) |
| **Retention period** | Until application resolved + 90 days, then anonymization on account deletion |
| **Special categories** | Customer may collect sensitive data via forms (not recommended); if so, explicit consent required |

## Processing Activity 4 — Billing and Payments

| Field | Value |
|---|---|
| **Purpose** | Process Premium subscriptions and issue invoices |
| **Legal basis** | Article 6(1)(b) — Contract; Article 6(1)(c) — Legal obligation (tax records) |
| **Data categories** | Stripe customer ID, subscription ID, payment status, invoice metadata; Discord entitlement ID, SKU ID and purchase status (native Discord purchases) |
| **Data subjects** | Paying customers |
| **Recipients** | Stripe (payment processor); Discord Inc. (merchant of record for native App purchases); Bulgarian tax authorities (annual VAT declarations) |
| **3rd country transfers** | Discord Inc. (USA) — SCC; Stripe EU subsidiary processes EU customers |
| **Retention period** | 7 years (Bulgarian tax law retention requirement) |
| **Security measures** | Stripe PCI-DSS compliance; no raw card data stored on Supreme Bot systems |

## Processing Activity 5 — AI Auto-Replies (Premium, opt-in)

| Field | Value |
|---|---|
| **Purpose** | Generate automated first-response messages to tickets using AI |
| **Legal basis** | Article 6(1)(b) — Contract performance (opt-in Premium feature) |
| **Data categories** | Ticket content, server name, custom system prompt |
| **Data subjects** | Ticket creators (indirectly — their first message is sent for AI processing) |
| **Recipients** | Google LLC (USA) — AI inference provider (Gemini API) |
| **3rd country transfers** | USA — SCC safeguards. ВНИМАНИЕ: безплатният Gemini API tier позволява на Google да използва подадено съдържание за подобряване на услугите (възможно и човешки преглед) — отразено в Privacy §5; при преминаване на платен tier обнови реда |
| **Retention period** | Not retained by Supreme Bot beyond normal ticket message retention; Google retains for 30 days per their policy |
| **Special measures** | EU AI Act Article 50 disclosure: AI origin clearly shown in Discord embed; Opt-in only |

## Processing Activity 6 — Audit Logs

| Field | Value |
|---|---|
| **Purpose** | Security investigation, compliance evidence, dispute resolution |
| **Legal basis** | Article 6(1)(f) — Legitimate interest (platform security) |
| **Data categories** | Actor ID, action type, target ID, timestamp, metadata JSON, IP address |
| **Data subjects** | Anyone performing privileged actions on the platform |
| **Recipients** | Internal staff for investigations; law enforcement on valid legal request |
| **3rd country transfers** | None |
| **Retention period** | 2 years |
| **Security measures** | Append-only table, no update/delete endpoints exposed |

## Processing Activity 7 — Abuse Reports (DSA)

| Field | Value |
|---|---|
| **Purpose** | Receive and investigate reports of illegal content or platform abuse |
| **Legal basis** | Article 6(1)(c) — Legal obligation (Digital Services Act); Article 6(1)(f) — Legitimate interest |
| **Data categories** | Reporter's Discord ID (optional), reported target ID, reason, details |
| **Data subjects** | Reporters; reported parties |
| **Recipients** | Internal moderation team; competent authorities if content is illegal |
| **3rd country transfers** | None |
| **Retention period** | 1 year after case resolution |

## Processing Activity 8 — Analytics (Internal)

| Field | Value |
|---|---|
| **Purpose** | Product improvement, usage pattern understanding |
| **Legal basis** | Article 6(1)(f) — Legitimate interest (aggregate, not individual tracking) |
| **Data categories** | Aggregated metrics (ticket counts, resolution times) — no PII |
| **Data subjects** | N/A (aggregated) |
| **Recipients** | Internal only |
| **3rd country transfers** | None |
| **Retention period** | Indefinite (aggregated, non-personal) |
| **Note** | No third-party analytics (Google Analytics, Mixpanel, etc.) are used |

---

## Processing Activity 9 — Error Monitoring and Performance Tracing

| Field | Value |
|---|---|
| **Purpose** | Detecting and diagnosing faults; performance tracing |
| **Legal basis** | Article 6(1)(f) — Legitimate interest (service availability and security) |
| **Data categories** | Stack traces, request metadata, Discord/server identifiers appearing in error context. Secrets and message content are filtered before transmission |
| **Data subjects** | Dashboard users; Discord members whose identifiers appear in a failing request |
| **Recipients** | Functional Software, Inc. (Sentry) |
| **3rd country transfers** | USA — Standard Contractual Clauses (EU region selected where available) |
| **Retention period** | 90 days (Sentry default retention) |

---

## Processing Activity 10 — Server-side Session Storage

| Field | Value |
|---|---|
| **Purpose** | Keeping dashboard administrators signed in |
| **Legal basis** | Article 6(1)(b) — Necessary to provide the contracted service |
| **Data categories** | Session identifier, Discord user id, expiry timestamp (`ExpressSession` table) |
| **Data subjects** | Dashboard users (server administrators) |
| **Recipients** | Internal only (own EU PostgreSQL) |
| **3rd country transfers** | None |
| **Retention period** | Until expiry; expired rows pruned hourly by a scheduled job |

---

## Processing Activity 11 — Ticket Activity Timestamps

| Field | Value |
|---|---|
| **Purpose** | Inactivity auto-close and first-response SLA measurement |
| **Legal basis** | Article 6(1)(f) — Legitimate interest (support operations); processed on behalf of the Customer as controller |
| **Data categories** | Timestamp of the last message in a ticket (`Ticket.lastActivityAt`) — no message content |
| **Data subjects** | Discord members participating in a ticket |
| **Recipients** | Internal only |
| **3rd country transfers** | None |
| **Retention period** | Same as the parent ticket |

---

## Processing Activity 12 — White-label Avatar Retrieval

| Field | Value |
|---|---|
| **Purpose** | Applying the Customer's chosen bot name and avatar to their own Discord bot |
| **Legal basis** | Article 6(1)(b) — Necessary to provide the White-label tier |
| **Data categories** | Image supplied by the Customer at a URL of their choosing; fetched transiently and forwarded to Discord |
| **Data subjects** | N/A (brand asset, not personal data by design) |
| **Recipients** | Discord Inc. |
| **3rd country transfers** | USA (Discord) — Standard Contractual Clauses |
| **Retention period** | Not stored — held in memory for the duration of the request only |

---

## Processing Activity 13 — Sticky Roles (Discord role snapshots)

| Field | Value |
|---|---|
| **Purpose** | Restore a member's Discord roles when they rejoin a server that enabled the feature |
| **Legal basis** | Article 6(1)(f) — Legitimate interest of the Customer (server administration); processed on behalf of the Customer as controller. Opt-in per server (`stickyRolesEnabled`, default off) — nothing is stored while the feature is off (Article 5(1)(c)) |
| **Data categories** | Discord user ID, server ID, list of Discord role IDs held at the moment of leaving, capture timestamp (`MemberRoleSnapshot`) |
| **Data subjects** | Discord members who leave a server with the feature enabled |
| **Recipients** | Internal only; roles are re-applied via Discord on rejoin |
| **3rd country transfers** | USA (Discord) — Standard Contractual Clauses |
| **Retention period** | 180 days after capture (`backend/src/jobs/dataRetention.js`, step 2б), or immediately on successful restore, on ban, or on erasure request (Article 17); included in the Article 15 export |
| **Security measures** | Roles with dangerous permissions, managed roles, and roles above the bot are never restored (same guard as autorole, applied at restore time); no foreign key to the User table by design |

---

## Processing Activity 14 — Server Activity Logging (event log)

| Field | Value |
|---|---|
| **Purpose** | Post member events (voice join/leave/mute, role and nickname changes, timeouts, bans/kicks, message edits/deletes, channel changes) to a Discord channel chosen by the Customer |
| **Legal basis** | Article 6(1)(f) — Legitimate interest of the Customer (moderation); the Customer is controller and must inform its members. Opt-in per server and per category |
| **Data categories** | Event type, Discord user ID and display name, timestamps, and — for the *Messages* category only — message content of edits and deletions |
| **Data subjects** | Members of the Customer's server |
| **Recipients** | The Customer's own Discord channel(s) |
| **3rd country transfers** | USA (Discord) — Standard Contractual Clauses |
| **Retention period** | **Not stored by Supreme Bot.** Events are forwarded to Discord and exist only there, under Discord's and the Customer's retention. Only the configuration (enabled flag, categories, channel IDs) is stored |

---

## Processing Activity 15 — Public API Keys

| Field | Value |
|---|---|
| **Purpose** | Let Customers integrate their own systems with the REST API |
| **Legal basis** | Article 6(1)(b) — Contract performance (Premium feature) |
| **Data categories** | Key name, SHA-256 hash of the key, first 8 characters (prefix) for identification, scopes, creator's Discord user ID, creation/last-use/expiry/revocation timestamps, request count (`ApiKey`) |
| **Data subjects** | Dashboard users who create keys |
| **Recipients** | Internal only |
| **3rd country transfers** | None |
| **Retention period** | Until revoked or expired by the Customer; revoked keys keep their metadata for the audit trail; included in the Article 15 export (metadata only — never the hash) |
| **Security measures** | Plaintext shown once at creation, never stored; failed key attempts throttled by the anti-brute-force ladder; scoped to a single server |

---

## Processing Activity 16 — Outbound Webhooks

| Field | Value |
|---|---|
| **Purpose** | Deliver ticket/application events to an HTTPS endpoint chosen by the Customer |
| **Legal basis** | Article 6(1)(b) — Contract performance (Premium feature); the Customer is controller for what it does with the payload |
| **Data categories** | Endpoint URL, optional HMAC-SHA256 signing secret, subscribed event types, creator's Discord user ID, last delivery status/time and failure count (`Webhook`); delivered payloads contain ticket/application data as described in Activities 2–3 |
| **Data subjects** | Members whose ticket/application events are delivered; dashboard users who configure webhooks |
| **Recipients** | The Customer's own endpoint — third party from Supreme Bot's perspective, chosen and controlled by the Customer |
| **3rd country transfers** | Determined by the Customer's endpoint location; Supreme Bot does not choose it |
| **Retention period** | Configuration until deleted by the Customer; **payloads are not stored** after delivery; included in the Article 15 export (name and timestamps only — never URL or secret) |
| **Security measures** | HTTPS only; SSRF guard rejects private, loopback, link-local, metadata, NAT64/6to4/Teredo ranges (binary comparison, re-checked at connect time against DNS rebinding); delivery gated on an active Premium tier at *execution* time. **Residual:** the signing secret is stored in plaintext in the database (it is a Customer-supplied credential, not personal data); encrypting it at rest like OAuth tokens is a tracked improvement |

---

## Data Protection Impact Assessment (DPIA) Status

Per Article 35, DPIA is required for high-risk processing. Current assessment:

- **Large-scale processing:** Not yet reached threshold (<10,000 subjects)
- **Special category data:** Not intentionally processed
- **Automated decision-making with legal effect:** Not implemented (AI auto-replies are advisory, not decisions)
- **Systematic monitoring of public areas:** No

**Conclusion:** DPIA not currently mandatory. Will be conducted if platform reaches 10,000+ subjects or introduces high-risk features.

## Data Breach Register

Maintained separately at `legal/breach-register.md`. Format:
- Breach ID
- Date discovered
- Nature and scope
- Authorities notified (date, reference)
- Subjects notified (if applicable)
- Remediation actions

Current entries: None.

## Review Schedule

This ROPA is reviewed:
- Annually (mandatory)
- After any material change in processing
- After any personal data breach
- Upon new sub-processor onboarding

---

**Prepared by:** Stefan Lyubomirov Kostadinov, Managing Director  
**Next review:** 2027-04-22
