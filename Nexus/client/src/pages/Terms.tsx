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

        <h2>3. Conduct, user content, and moderation</h2>
        <p>
          Cheating, exploiting bugs, harassment, hate speech, sexual content involving minors,
          impersonation of staff or other players, spam or scams, and using third-party tools to
          automate gameplay are prohibited. Public free-text you create — character names, guild
          names, tags and mottos, profile bios, and guild chat — is checked automatically before it
          is published, and content that breaks these rules or applicable law is blocked or removed.
        </p>
        <p>
          <strong>Enforcement.</strong> Depending on severity we may remove or reset the offending
          content and/or suspend the account. Suspensions may be <em>temporary</em> (with a stated
          end date) or <em>permanent</em>. To prevent evasion, a suspension may extend to the IP
          address and device associated with the account.
        </p>
        <p>
          <strong>Reporting illegal or infringing content (DSA Art. 16).</strong> Any user can submit
          a notice using the in-game report control (the <span aria-hidden="true">⚑</span> flag icon
          shown on other players&rsquo; content) or by email to
          <a href={`mailto:${OPERATOR.email.abuse}`}>{` ${OPERATOR.email.abuse}`}</a>. When we act on
          a report, the affected user receives a statement of reasons (DSA Art. 17) through the
          in-game mail system. If you believe a moderation decision about your own content or account
          was mistaken, contact us at the address above and we will review it.
        </p>
        <p>
          <strong>Point of contact (DSA Art. 11 &amp; 12).</strong> For communications from users and
          from Member-State authorities regarding these services, our single point of contact is{' '}
          <a href={`mailto:${OPERATOR.email.abuse}`}>{OPERATOR.email.abuse}</a>. Communication is
          accepted in <strong>Bulgarian, English, or Italian</strong>.
        </p>
        {/*
          Забележка за правен преглед: операторът е микро-предприятие →
          DSA Раздел 3 (чл. 20 вътрешна жалбена система, чл. 24 годишен
          отчет) е ОСВОБОДЕН (чл. 19). Затова тук НЕ обещаваме формална
          жалбена система/годишни отчети — само преглед при контакт. Пази
          текста синхронен с реалното поведение (чл. 14 точност).
        */}

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
          deliver them (faulty service). Where we do grant a refund, the corresponding gems (and
          anything obtained with them, to the extent still held) are removed from your account.
        </p>
        <p>
          <strong>Payment disputes and chargebacks.</strong> If you have a problem with a purchase,
          contact us first at <a href={`mailto:${OPERATOR.email.support}`}>{OPERATOR.email.support}</a>
          {' '}and we will help. Initiating a bank chargeback or payment dispute instead — after the
          digital content has been delivered — is treated as fraudulent and results in{' '}
          <strong>permanent suspension</strong> of the account together with the associated IP address
          and device, and reversal of the affected purchase. This does not affect any statutory rights
          you may have as a consumer.
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
          rely on the mandatory consumer-protection rules of their place of residence. Please contact
          us first at <a href={`mailto:${OPERATOR.email.support}`}>{OPERATOR.email.support}</a> — we
          aim to resolve issues directly.
        </p>
        <p>
          For out-of-court dispute resolution, Bulgarian consumers may turn to the{' '}
          <strong>conciliation commissions of the Commission for Consumer Protection (КЗП)</strong>{' '}
          (<a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">kzp.bg</a>), and consumers
          in other EU/EEA countries may use the{' '}
          <a href="https://www.eccnet.eu" target="_blank" rel="noopener noreferrer">European Consumer Centres Network (ECC-Net)</a>{' '}
          or their national ADR body. (The EU Online Dispute Resolution platform was shut down on 20 July 2025.)
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
