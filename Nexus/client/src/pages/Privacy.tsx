import React from 'react';
import { Link } from 'react-router-dom';
import { OPERATOR } from '../lib/legal';

export default function Privacy(): React.ReactElement {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <Link to="/" className="muted">← Back to landing</Link>
      </header>
      <article>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: 2026-06-26</p>

        <h2>1. Controller (data fiduciary)</h2>
        <p>
          The controller for personal data processed by Nexus Dominion is:
        </p>
        <address style={{ fontStyle: 'normal' }}>
          <strong>{OPERATOR.legalName}</strong><br />
          {OPERATOR.address.street}<br />
          {OPERATOR.address.postal} {OPERATOR.address.city}, {OPERATOR.address.country}<br />
          VAT/EIK: {OPERATOR.vat} · Registry: {OPERATOR.registry}<br />
          Email: <a href={`mailto:${OPERATOR.email.privacy}`}>{OPERATOR.email.privacy}</a><br />
          Data-protection contact: <a href={`mailto:${OPERATOR.email.dpo}`}>{OPERATOR.email.dpo}</a>
        </address>

        <h2>2. What we collect</h2>
        <p>We collect the minimum data needed to operate the Game and process payments:</p>
        <ul>
          <li><strong>Account</strong>: username, email, password hash (bcrypt, never plaintext), date of birth (age-gate only — we do not display it), registration date.</li>
          <li><strong>Gameplay</strong>: character name, class, level, combat history, inventory, guild membership.</li>
          <li><strong>Technical</strong>: IP address (truncated for analytics if you opt in), country code, browser type, request logs (retained 30 days).</li>
          <li><strong>Payment</strong>: Stripe customer id, purchase metadata, billing country, VAT amount. Card details never touch our servers.</li>
          <li><strong>Safety &amp; moderation</strong>: a random device identifier (stored in your browser and sent with requests), content reports you submit, and moderation actions taken. Where an account is suspended for fraud (for example a payment chargeback), the associated IP address and device identifier are retained to enforce the suspension and prevent evasion.</li>
        </ul>

        <h2>3. Why we collect it (legal basis)</h2>
        <ul>
          <li><strong>Account &amp; gameplay</strong> — Art. 6(1)(b) GDPR (performance of contract). You cannot play without us persisting your character.</li>
          <li><strong>Payments &amp; VAT records</strong> — Art. 6(1)(c) GDPR (legal obligation; EU VAT directive 2006/112/EC; 7-year retention).</li>
          <li><strong>Security / fraud prevention</strong> — Art. 6(1)(f) GDPR (legitimate interest).</li>
          <li><strong>Analytics / marketing</strong> — Art. 6(1)(a) GDPR (explicit opt-in via the cookie banner). Off by default.</li>
        </ul>

        <h2>4. Sub-processors and EU transfers</h2>
        <p>We share personal data only with the sub-processors listed below. Each is bound by a Data Processing Agreement (DPA).</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #444', padding: '4px 8px' }}>Sub-processor</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #444', padding: '4px 8px' }}>Purpose</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #444', padding: '4px 8px' }}>Region / transfer</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={{ padding: '4px 8px' }}>Stripe Payments Europe Ltd.</td><td style={{ padding: '4px 8px' }}>Payment processing, VAT, OSS</td><td style={{ padding: '4px 8px' }}>EU (Ireland); SCCs for US fallback</td></tr>
            <tr><td style={{ padding: '4px 8px' }}>Sentry GmbH</td><td style={{ padding: '4px 8px' }}>Error monitoring</td><td style={{ padding: '4px 8px' }}>EU region (de.sentry.io); SCCs</td></tr>
            <tr><td style={{ padding: '4px 8px' }}>{OPERATOR.hosting.name}</td><td style={{ padding: '4px 8px' }}>Hosting, server logs</td><td style={{ padding: '4px 8px' }}>{OPERATOR.hosting.region}</td></tr>
          </tbody>
        </table>
        <p>We do not sell, rent, or trade your personal data to third parties for marketing.</p>

        <h2>5. Your rights</h2>
        <p>
          Under GDPR (and the Bulgarian Data Protection Act / Italian Codice Privacy):
        </p>
        <ul>
          <li><strong>Access &amp; portability</strong> — export your data from <code>/app/account</code> (or email us).</li>
          <li><strong>Rectification</strong> — change account fields in <code>/app/account</code>.</li>
          <li><strong>Erasure</strong> — delete your account from <code>/app/account</code>. Purchase rows are pseudonymised but kept 7 years for VAT.</li>
          <li><strong>Object / restrict</strong> — withdraw analytics consent at any time via the cookie banner link in the footer.</li>
          <li><strong>Lodge a complaint</strong> — Bulgaria: Commission for Personal Data Protection (<a href="https://www.cpdp.bg/" target="_blank" rel="noopener noreferrer">cpdp.bg</a>). Italy: Garante per la protezione dei dati personali (<a href="https://www.gpdp.it/" target="_blank" rel="noopener noreferrer">gpdp.it</a>).</li>
        </ul>
        <p>
          To exercise any of these rights, email <a href={`mailto:${OPERATOR.email.privacy}`}>{OPERATOR.email.privacy}</a>. We respond within 30 days (extendable by 60 per Art. 12(3) GDPR).
        </p>

        <h2>6. Retention</h2>
        <p>
          Account data is retained while your account exists. Payment records: 7 years (VAT). Request logs: 30 days. Closed accounts purged within 90 days unless legal obligations require longer.
        </p>

        <h2>7. Cookies and tracking</h2>
        <p>
          We use one essential session token (a JWT held in your browser's localStorage, not a third-party cookie) for authentication, and one random device identifier (also in localStorage) used for account-security and abuse prevention. Neither is a third-party tracking cookie. Analytics is opt-in and disabled by default; the cookie banner exposes per-category controls (Necessary / Preferences / Analytics / Marketing). You can withdraw consent any time via the "Cookie settings" link in the footer.
        </p>

        <h2>8. Children</h2>
        <p>
          We do not knowingly process data of children below the digital-consent age for their country (14 in Bulgaria and Italy). Registration requires a date of birth and is refused below the local threshold.
        </p>

        <p className="muted" style={{ marginTop: 32 }}>
          See also: <Link to="/terms">Terms of Service</Link>.
        </p>
      </article>
    </div>
  );
}
