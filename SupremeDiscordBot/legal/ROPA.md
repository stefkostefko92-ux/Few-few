# Record of Processing Activities (ROPA)

**GDPR Article 30 compliance document**  
**Controller/Processor:** Carbon Stealth VCC  
**EIK:** 208725180 · **VAT (ЗДДС):** BG208725180  
**Address:** ul. Samuil 3, Bobov Dol, Kyustendil Province, Bulgaria  
**Contact:** privacy@carbonstealth.eu  
**Last updated:** 2026-04-22  
**Version:** 1.0

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
| **3rd country transfers** | Anthropic USA if AI auto-reply enabled — SCC safeguards |
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
| **Recipients** | Anthropic PBC (USA) — AI inference provider |
| **3rd country transfers** | USA — SCC safeguards; Anthropic commits to not using API data for training |
| **Retention period** | Not retained by Supreme Bot beyond normal ticket message retention; Anthropic retains for 30 days per their policy |
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
