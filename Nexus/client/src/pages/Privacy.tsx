import React from 'react';
import { Link } from 'react-router-dom';

export default function Privacy(): React.ReactElement {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <Link to="/" className="muted">← Back to landing</Link>
      </header>
      <article>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: 2026-06-10</p>

        <h2>1. What we collect</h2>
        <p>
          We collect the minimum data needed to operate the Game and process payments:
        </p>
        <ul>
          <li><strong>Account</strong>: username, email, password hash (bcrypt, never plaintext), registration date.</li>
          <li><strong>Gameplay</strong>: character name, class, level, combat history, inventory, guild membership.</li>
          <li><strong>Technical</strong>: IP address (truncated for analytics), country code, browser type, request logs (retained 30 days).</li>
          <li><strong>Payment</strong>: Stripe customer id and purchase metadata. Card details never touch our servers.</li>
        </ul>

        <h2>2. Why we collect it</h2>
        <p>
          Operating the Game (account auth, character persistence, combat resolution), processing
          purchases, preventing abuse (rate-limiting, ban evasion), and complying with legal
          obligations (tax records, fraud prevention).
        </p>

        <h2>3. Legal basis (GDPR / Bulgaria / Italy)</h2>
        <p>
          For account and gameplay data: <em>performance of contract</em> (you cannot play the
          Game without us storing your character). For payment data: <em>legal obligation</em>.
          For analytics: <em>legitimate interest</em>, with opt-out controls in the cookie
          banner. For marketing emails: <em>explicit consent</em> (we currently do not send
          marketing emails).
        </p>

        <h2>4. Who we share with</h2>
        <ul>
          <li><strong>Stripe</strong> — payment processing.</li>
          <li><strong>Sentry</strong> — error monitoring (anonymised stack traces).</li>
          <li><strong>Hosting provider</strong> — server logs.</li>
        </ul>
        <p>
          We do not sell, rent, or trade your personal data to third parties for marketing.
        </p>

        <h2>5. Your rights</h2>
        <p>
          Under GDPR (and the equivalent Bulgarian and Italian data-protection acts) you have
          the right to:
        </p>
        <ul>
          <li>Request a copy of your personal data (data portability).</li>
          <li>Correct inaccurate data.</li>
          <li>Delete your account and associated data (right to erasure).</li>
          <li>Object to processing for marketing or analytics.</li>
          <li>Lodge a complaint with your national data-protection authority.</li>
        </ul>
        <p>
          To exercise any of these rights, email <code>privacy@nexus-dominion.example</code>.
          We respond within 30 days.
        </p>

        <h2>6. Retention</h2>
        <p>
          Account data is retained while your account exists. Payment records are retained 7
          years for tax compliance. Request logs are retained 30 days. Closed accounts are
          purged within 90 days unless legal obligations require longer retention.
        </p>

        <h2>7. Cookies</h2>
        <p>
          We use one essential session cookie for authentication. Analytics cookies are opt-in
          and disabled by default; you control them via the cookie banner on first visit.
        </p>

        <p className="muted" style={{ marginTop: 32 }}>
          See also: <Link to="/terms">Terms of Service</Link>.
        </p>
      </article>
    </div>
  );
}
