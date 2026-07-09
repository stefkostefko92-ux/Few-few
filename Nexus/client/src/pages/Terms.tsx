import React from 'react';
import { Link } from 'react-router-dom';
import { OPERATOR } from '../lib/legal';

export default function Terms(): React.ReactElement {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <Link to="/" className="muted">← Back to landing</Link>
      </header>
      <article>
        <h1>Terms of Service</h1>
        <p className="muted">Last updated: 2026-06-26</p>

        <h2>1. The service and operator (Impressum)</h2>
        <p>
          Nexus Dominion (the "Game") is a free-to-play browser MMORPG. The Game is operated by:
        </p>
        <address style={{ fontStyle: 'normal' }}>
          <strong>{OPERATOR.legalName}</strong> (trading as Nexus Dominion)<br />
          {OPERATOR.address.street}, {OPERATOR.address.postal} {OPERATOR.address.city}, {OPERATOR.address.country}<br />
          VAT/EIK: {OPERATOR.vat} · Registry: {OPERATOR.registry}<br />
          Legal representative: {OPERATOR.representative}<br />
          Support: <a href={`mailto:${OPERATOR.email.support}`}>{OPERATOR.email.support}</a>
          · Legal: <a href={`mailto:${OPERATOR.email.legal}`}>{OPERATOR.email.legal}</a>
          · Abuse: <a href={`mailto:${OPERATOR.email.abuse}`}>{OPERATOR.email.abuse}</a>
        </address>
        <p>
          By registering an account you agree to these terms.
        </p>

        <h2>2. Accounts and age</h2>
        <p>
          You must be at least the age of digital consent in your country to register. For users
          residing in <strong>Bulgaria</strong> or <strong>Italy</strong> that age is <strong>14</strong>;
          France 15; Germany and most other EU member states 16; non-EU 13 (or local equivalent).
          Registration collects your date of birth and refuses any sign-up below the threshold for the
          declared country. You are responsible for keeping your password safe; changing it via
          <code> /app/account</code> revokes every existing session.
        </p>

        <h2>3. Conduct, user content, DSA notice mechanism</h2>
        <p>
          Cheating, exploiting bugs, harassment, hate speech, impersonation, and using third-party
          tools to automate gameplay are grounds for immediate account suspension. Guild names,
          character names, chat messages, auction listings, and profile bios that violate applicable
          law will be removed.
        </p>
        <p>
          <strong>Reporting illegal content (DSA Art. 16).</strong> Any user can submit a notice via
          our reporting flow inside the Game (right-click → Report) or by email to
          <a href={`mailto:${OPERATOR.email.abuse}`}>{` ${OPERATOR.email.abuse}`}</a>. A statement of
          reasons (DSA Art. 17) is sent to the affected user; both parties may appeal via our internal
          complaint-handling system (DSA Art. 20) within 6 months of the decision. Transparency
          reports are published annually (DSA Art. 24).
        </p>

        <h2>4. Premium currency, refunds, EU 14-day withdrawal</h2>
        <p>
          Gems and cosmetics are digital content. Stripe handles all payment processing and we do
          not store full card data.
        </p>
        <p>
          <strong>14-day right of withdrawal.</strong> EU consumers normally have a 14-day right of
          withdrawal for distance contracts (Dir. 2011/83/EU Art. 9). For digital content delivered
          immediately, Art. 16(m) lets you waive that right — and our checkout flow requires you to
          tick <em>"I consent to immediate delivery and I acknowledge that this waives my 14-day
          right of withdrawal"</em> before payment. Once the gems are credited the purchase is not
          refundable except where required by mandatory consumer law or where the Game fails to
          deliver them (faulty service).
        </p>
        <p>
          <strong>VAT.</strong> Prices include VAT at the rate of your country of residence (EU
          place-of-supply rules for digital content). Stripe Tax computes the rate and emits a VAT
          invoice you can download from <code>/app/premium</code>.
        </p>

        <h2>5. Cosmetics, characters, and item ownership</h2>
        <p>
          Characters, items, and cosmetics are licensed to you for use within the Game; we retain
          ownership of the underlying intellectual property. Deleting your account purges the
          associated character data.
        </p>

        <h2>6. Service availability</h2>
        <p>
          We aim for high uptime but do not guarantee uninterrupted service. Scheduled maintenance
          windows are announced via the in-game mail system at least 24 hours ahead. Unplanned
          outages may occur.
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          The Game is provided as-is. To the maximum extent allowed by applicable law we disclaim
          warranties of fitness, merchantability, and non-infringement. We are not liable for
          indirect, incidental, or consequential damages arising from your use of the Game.
          Nothing in these terms limits liability for fraud, gross negligence, or statutory
          consumer rights.
        </p>

        <h2>8. Governing law and dispute resolution</h2>
        <p>
          These terms are governed by the law of {OPERATOR.address.country}. EU consumers may also
          rely on the consumer-protection rules of their place of residence. Disputes may be brought
          before the EU Online Dispute Resolution platform:
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            {' '}ec.europa.eu/consumers/odr
          </a>.
        </p>

        <h2>9. Changes</h2>
        <p>
          We may update these terms; material changes are surfaced in-game and on this page.
          Continued use after a change indicates acceptance of the updated terms.
        </p>

        <p className="muted" style={{ marginTop: 32 }}>
          See also: <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </div>
  );
}
