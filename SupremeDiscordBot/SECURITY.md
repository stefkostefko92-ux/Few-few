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
[`/.well-known/security.txt`](https://supreme.carbonstealth.eu/.well-known/security.txt)
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

- `supreme.carbonstealth.eu` (web dashboard and public REST API)
- The Supreme Bot Discord application
- This repository's source code

Out of scope:

- Third-party services we rely on (Discord, Stripe, Hetzner, Google) —
  report those to the respective vendor.
- Denial-of-service / volumetric attacks, social engineering, and physical attacks.

## Data protection

Supreme Bot is GDPR-native and EU-hosted. Custom bot tokens are encrypted at
rest with AES-256-GCM; sessions use HTTP-only, Secure, SameSite cookies. For
data-protection matters (Articles 15–17, 20 GDPR), contact
**privacy@carbonstealth.eu** or the DPO at **dpo@carbonstealth.eu**.
