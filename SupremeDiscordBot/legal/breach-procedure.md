# Personal Data Breach Notification Procedure

**GDPR Articles 33 & 34 compliance document**  
**Controller:** Carbon Stealth VCC (EIK 208725180, VAT BG208725180)  
**Last updated:** 2026-04-22  
**Version:** 1.0  
**Owner:** Managing Director (Stefan Lyubomirov Kostadinov, acting as interim DPO)

---

## Purpose

This document defines the operational procedure for detecting, assessing, documenting, and notifying personal data breaches affecting the Supreme Bot platform, in compliance with:

- **GDPR Article 33** — Notification to supervisory authority (within 72 hours)
- **GDPR Article 34** — Communication to data subjects (without undue delay, where high risk)
- **Bulgarian PDPA** — Local data protection act
- **DSA Article 18** — If breach involves illegal content

## Definition of "Personal Data Breach"

Per Article 4(12) GDPR, a personal data breach is "a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, personal data transmitted, stored or otherwise processed."

Three categories:
1. **Confidentiality breach** — unauthorized disclosure/access (e.g., data leak, unauthorized DB query)
2. **Integrity breach** — unauthorized alteration (e.g., DB corruption, malicious modification)
3. **Availability breach** — accidental loss or destruction (e.g., backup failure + deletion)

## Severity Tiers

### Tier 1 — Critical (notify authority + affected users)
- Mass exfiltration of DB contents
- Compromise of encryption keys
- Unauthorized administrative access persisting >1 hour
- Public exposure of ticket transcripts or application forms
- Compromise of payment-related metadata
- Incident involving >1000 data subjects

### Tier 2 — High (notify authority, assess user notification case-by-case)
- Targeted unauthorized access to specific user accounts
- Session token compromise
- API key leakage
- Breach affecting 100-1000 subjects
- Third-party sub-processor incident (Stripe, Discord, Hetzner, Google)

### Tier 3 — Medium (document, assess case-by-case)
- Temporary DB unavailability (<4 hours)
- Failed login attempts (brute force blocked by rate limiter)
- Single-user credential phishing (user responsibility but logged)

### Tier 4 — Low (document only)
- Access control misconfiguration caught before exploitation
- Minor logging gap detected during audit

## Detection Sources

1. **Automated monitoring:**
   - Sentry error tracking (production errors)
   - VPS monitoring (Hetzner Cloud alerts)
   - Docker container health checks
   - Database audit log anomaly detection (monthly review)
   - Rate limiter hits on auth endpoints (weekly review)

2. **User reports:**
   - `security@carbonstealth.eu` (public contact)
   - Bug bounty submissions (not yet formalized)
   - Support tickets with security concern

3. **Third-party notifications:**
   - Sub-processor breach notifications (contractual obligation per DPA)
   - Vulnerability disclosures (GitHub security advisories for dependencies)
   - CVE alerts (automated dependency scanning)

## Response Procedure

### Phase 1 — Detection and Initial Assessment (0-4 hours)

1. **Acknowledge and triage**
   - Assign unique Breach ID (format: `BREACH-YYYYMMDD-NNN`)
   - Document detection time, source, initial symptoms
   - Classify severity tier (preliminary)

2. **Contain**
   - If active exploitation: revoke compromised credentials, disable affected endpoints, block attacker IP
   - If data exposure: take affected resource offline if possible without worsening impact
   - Preserve evidence: snapshot DB state, export relevant logs to secure storage

3. **Assemble response team**
   - Tier 1/2: Managing Director + technical lead (self if solo) + external legal counsel on standby
   - Tier 3/4: Managing Director documents, no external involvement

### Phase 2 — Investigation (4-48 hours)

1. **Scope assessment**
   - How many data subjects affected?
   - What categories of personal data?
   - Timeline of exposure (when did it start, when was it stopped)
   - Attack vector and root cause
   - Evidence of actual data exfiltration vs. potential access only

2. **Risk assessment for data subjects (Article 34 threshold)**
   - Likelihood of identity theft, fraud, financial loss
   - Likelihood of reputational damage, discrimination
   - Likelihood of physical harm (unusual for SaaS but possible for doxxing)

### Phase 3 — Notification (within 72 hours of awareness)

1. **Supervisory authority notification (Article 33) — MANDATORY for Tier 1 and Tier 2**
   - **Authority:** Commission for Personal Data Protection (CPDP) Bulgaria
   - **Portal:** https://www.cpdp.bg/
   - **Email:** kzld@cpdp.bg
   - **Deadline:** 72 hours from awareness
   - **If deadline missed:** Include justification for delay in the notification

2. **Affected data subjects notification (Article 34) — Required if HIGH RISK to rights and freedoms**
   - Via email (primary admin contact on file)
   - Via in-app banner in dashboard
   - Via status page post at https://supreme.carbonstealth.eu/status
   - Via Discord DM if only Discord ID is known (with opt-out respected)

3. **Customer DPA notification — Required for all breaches affecting Customer data**
   - Email to Customer's designated DPA contact within 48 hours
   - Per DPA Section 7 obligations

### Phase 4 — Remediation and Follow-up (48+ hours)

1. **Root cause remediation**
   - Patch vulnerability
   - Revoke and rotate affected credentials
   - Deploy additional security controls (rate limits, WAF rules)
   - Update monitoring to detect similar patterns

2. **Documentation**
   - Complete Breach Register entry (see template below)
   - Internal retrospective within 7 days
   - If applicable, update security practices documentation

3. **Supervisory authority follow-up**
   - Provide additional information as requested
   - File closing report once remediation complete

## Template — Notification to Supervisory Authority

**Subject:** Personal Data Breach Notification — Carbon Stealth VCC — [BREACH-ID]

**Controller identification:**
- Legal name: Carbon Stealth VCC
- Registration: EIK 208725180, VAT BG208725180
- Address: ul. Samuil 3, Bobov Dol, Kyustendil Province, Bulgaria
- Contact: [Stefan Lyubomirov Kostadinov, privacy@carbonstealth.eu, +359 XX XXX XXXX]

**Breach details:**
- Date/time of breach: [ISO 8601 timestamp]
- Date/time discovered: [ISO 8601 timestamp]
- Nature: [Confidentiality / Integrity / Availability]
- Description: [Factual summary — what happened, how]

**Scope:**
- Categories of data subjects: [users / customers / ticket participants / applicants]
- Approximate number of subjects affected: [number]
- Categories of personal data: [list]
- Approximate number of records affected: [number]

**Likely consequences:**
[Assessment of possible impact on rights and freedoms of data subjects]

**Measures taken or proposed:**
- Containment: [actions taken]
- Mitigation: [actions planned]
- Communication to subjects: [yes/no, with justification]

**DPO contact:** privacy@carbonstealth.eu (interim — DPO not formally appointed per Article 37 thresholds)

## Template — Notification to Data Subjects

**Subject:** Important Security Notice — Supreme Bot

Dear [User],

On [date], we detected a security incident that may have affected your account data on Supreme Bot.

**What happened:** [Plain-language description — avoid jargon]

**What information was involved:** [Specific data categories]

**What we have done:** [Containment and remediation actions]

**What you should do:**
- [Specific recommendations: change Discord password, enable MFA, review recent logins, etc.]

**For more information:**
- Detailed technical post: https://supreme.carbonstealth.eu/status
- Contact: security@carbonstealth.eu
- To request deletion of your data: https://supreme.carbonstealth.eu/dashboard/privacy-settings

We sincerely apologize for this incident and are taking steps to prevent recurrence.

— Stefan Kostadinov, Managing Director, Carbon Stealth VCC

## Breach Register (Active Log)

Kept at `legal/breach-register.md`. Required fields per entry:

- Breach ID
- Detection date/time
- Severity tier
- Categories of data affected
- Number of subjects affected
- Root cause
- Containment actions
- Authority notification date and reference
- Subject notification date (if applicable)
- Remediation status
- Lessons learned

**Current entries:** None (as of 2026-04-22)

## Authority Contacts

### Bulgaria (Lead Authority — Controller's main establishment)
- **Commission for Personal Data Protection (CPDP)**
- Website: https://www.cpdp.bg/
- Email: kzld@cpdp.bg
- Phone: +359 2 91 53 518
- Address: 2 Prof. Tsvetan Lazarov Blvd, Sofia 1592, Bulgaria

### Italy (Representative — for Italian data subjects if Customer-specific)
- **Garante per la protezione dei dati personali**
- Website: https://www.gpdp.it/
- Email: protocollo@gpdp.it

### Other EU Member States
- EDPB portal for cross-border cases: https://edpb.europa.eu/about-edpb/about-edpb/members_en

## Insurance

**Recommended:** Cyber liability insurance should be acquired before commercial launch.
Coverage should include:
- Breach response costs (forensics, notification, credit monitoring)
- Regulatory fines (where insurable by local law)
- Third-party liability (customer lawsuits)
- Business interruption

**Indicative market:** AXA, Hiscox, Munich Re, Chubb — EU SaaS policies start ~€1500/year for small platforms.

**Status:** Not yet acquired. Required before commercial launch.

## Review

This procedure is reviewed:
- Annually (mandatory)
- After any Tier 1 or Tier 2 breach
- After material changes to platform architecture
- Upon advice from legal counsel

**Next review:** 2027-04-22
