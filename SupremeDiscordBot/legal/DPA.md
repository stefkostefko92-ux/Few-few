# Data Processing Agreement (DPA) — Supreme Bot

**Version:** 1.0  
**Effective Date:** 2026-04-22  
**Controller:** [Customer Name] ("Customer")  
**Processor:** Carbon Stealth VCC, EIK BG208725180, ul. Samuil 3, Bobov Dol, Bulgaria ("Supreme Bot")

---

## 1. Subject Matter and Duration

1.1 This DPA governs the processing of personal data by Supreme Bot on behalf of the Customer when the Customer uses the Supreme Bot service.

1.2 This DPA shall remain in force for the duration of the Service Agreement between the parties and will automatically terminate when Customer's account with Supreme Bot is terminated, at which point data deletion/return obligations (Section 9) apply.

## 2. Nature and Purpose of Processing

2.1 **Purpose:** Supreme Bot processes personal data solely to provide the contracted service (Discord server management, ticket systems, application forms, AI auto-replies, white-label bot functionality).

2.2 **Nature:** Collection, storage, organization, retrieval, consultation, disclosure to Customer's authorized staff, erasure.

2.3 **Categories of personal data processed:**
- Discord user IDs (pseudonymous identifiers)
- Discord usernames and avatars (public Discord profile data)
- Ticket and application content (as submitted by end users)
- IP addresses (for rate limiting and security)
- Session identifiers (for authentication)
- Payment metadata (transaction IDs, customer IDs — payment data itself is processed by Stripe)

2.4 **Categories of data subjects:**
- Customer's Discord server members
- Customer's staff (ticket handlers, reviewers)
- Customer's administrators

## 3. Controller and Processor Obligations

3.1 **Customer (Controller) shall:**
- Ensure that Customer has a valid legal basis for processing (Article 6 GDPR)
- Provide appropriate privacy notices to its end users
- Respond to data subject requests directed to Customer
- Not instruct Supreme Bot to process data outside the scope of this DPA

3.2 **Supreme Bot (Processor) shall:**
- Process personal data only on documented instructions from Customer
- Ensure confidentiality obligations bind all personnel with data access
- Implement appropriate technical and organizational measures (Section 5)
- Assist Customer in fulfilling data subject rights
- Notify Customer of any data breach within 48 hours of awareness (Section 7)
- Delete or return data upon termination (Section 9)

## 4. Sub-processors

4.1 Customer hereby provides general authorization for Supreme Bot to engage sub-processors subject to the conditions in this Section.

4.2 **Current sub-processors:**

| Sub-processor | Role | Location | Safeguard |
|---|---|---|---|
| Hetzner Online GmbH | Infrastructure hosting | Germany (EU) | Within EEA |
| Stripe Payments Europe Ltd | Payment processing | Ireland (EU) | Within EEA |
| Anthropic PBC | AI inference (optional, Premium feature) | USA | Standard Contractual Clauses |
| Discord Inc. | Authentication + bot delivery | USA | Standard Contractual Clauses |

4.3 Supreme Bot will provide 30 days' notice of any intended changes to sub-processors (via email to the Customer's admin contact) and publish an updated list at the Customer's dashboard under Privacy Settings.

4.4 Customer may object to new sub-processors in writing within 14 days of notice. If the objection cannot be resolved, Customer may terminate the Service Agreement.

## 5. Security Measures

5.1 Supreme Bot implements:

- **Encryption at rest:** AES-256-GCM for sensitive fields (bot tokens, API keys)
- **Encryption in transit:** TLS 1.3 for all client-server and inter-service communication
- **Access control:** Role-based access control (RBAC), multi-factor authentication for admin access
- **Audit logging:** Immutable audit log of all privileged operations, retained for 2 years
- **Session security:** HTTP-only secure cookies, SameSite=Lax, automatic token rotation
- **Rate limiting:** Multi-tier rate limits preventing brute-force and DoS attacks
- **Vulnerability management:** Dependency scanning (npm audit), automated security patches monthly
- **Network isolation:** Docker bridge networks, database bound to localhost only, no public ports except HTTPS
- **Backup:** Daily PostgreSQL backups, 30-day retention, encrypted at rest

5.2 Supreme Bot conducts security reviews at least annually.

## 6. Data Subject Rights

6.1 Supreme Bot provides self-service endpoints for data subjects:
- Article 15 (access) + Article 20 (portability): `/api/gdpr/export`
- Article 17 (erasure): `/api/gdpr/delete-account`
- Article 7(3) (consent withdrawal): `/api/gdpr/withdraw-consent`

6.2 For requests that cannot be fulfilled through self-service, Supreme Bot responds to Customer-forwarded requests within 30 days (Article 12(3)).

## 7. Personal Data Breach Notification

7.1 Supreme Bot shall notify Customer without undue delay, and in any event within 48 hours of becoming aware of a personal data breach affecting Customer's data.

7.2 Notification shall include:
- Nature of the breach
- Categories and approximate number of data subjects affected
- Likely consequences
- Measures taken or proposed to address the breach

7.3 Notification will be sent to the Customer's registered admin email and posted in the Supreme Bot status page at https://supreme.carbonstealth.eu/status.

## 8. International Transfers

8.1 Personal data is primarily stored and processed in the EU (Bulgaria, Germany).

8.2 Where transfers to sub-processors outside the EEA are necessary (Anthropic, Discord — both US), Supreme Bot relies on:
- EU Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914)
- Supplementary technical measures (encryption in transit)

## 9. Return or Deletion

9.1 Upon termination, Customer has 30 days to export data via `/api/gdpr/export`.

9.2 After 30 days, Supreme Bot will anonymize all personal data, retaining only:
- Transaction records (for 7 years per EU tax law)
- Audit logs with anonymized actor IDs (for 2 years for security investigation)

9.3 Deletion is confirmed via an email to Customer's admin contact.

## 10. Audit Rights

10.1 Supreme Bot will provide Customer with:
- Annual third-party security attestation reports (when available)
- Evidence of compliance measures upon reasonable written request
- Cooperation with supervisory authority audits

10.2 Customer may conduct an audit once per year with 30 days' written notice. Costs borne by Customer unless audit reveals material non-compliance.

## 11. Liability and Indemnification

11.1 Liability is governed by the Service Agreement. Nothing in this DPA limits statutory liability under GDPR.

11.2 Each party indemnifies the other for administrative fines, damages, and legal costs arising from its own non-compliance with GDPR.

## 12. Miscellaneous

12.1 This DPA prevails in case of conflict with the Service Agreement on data protection matters.

12.2 Governing law: Republic of Bulgaria. Exclusive jurisdiction: Sofia City Court.

12.3 This DPA may be updated by Supreme Bot with 30 days' notice. Material changes require Customer's written acceptance.

---

**Signed electronically upon Customer's acceptance of the Supreme Bot Terms of Service.**

For questions regarding this DPA: **dpo@carbonstealth.eu** (or privacy@carbonstealth.eu until a DPO is formally designated)

---

*Document prepared for Carbon Stealth VCC, EIK BG208725180. Not a substitute for legal counsel. Customer should have their own legal team review before execution.*
