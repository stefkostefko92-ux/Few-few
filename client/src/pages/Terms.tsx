import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms(): React.ReactElement {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <Link to="/" className="muted">← Back to landing</Link>
      </header>
      <article>
        <h1>Terms of Service</h1>
        <p className="muted">Last updated: 2026-06-10</p>

        <h2>1. The service</h2>
        <p>
          Nexus Dominion (the "Game") is a free-to-play browser MMORPG operated by Nexus
          Dominion Studio ("we", "us"). By registering an account you agree to these terms.
        </p>

        <h2>2. Accounts</h2>
        <p>
          You must be at least 13 years old to register, and at least 16 if you reside in the
          EU. You are responsible for keeping your password safe. If you suspect your account
          has been compromised, change your password — it revokes existing sessions.
        </p>

        <h2>3. Conduct</h2>
        <p>
          Cheating, exploiting bugs, harassment, and using third-party tools to automate
          gameplay are grounds for immediate account suspension. Guild names, character names,
          chat messages, and profile bios that violate applicable hate-speech or
          impersonation laws will be removed at our discretion.
        </p>

        <h2>4. Premium currency</h2>
        <p>
          Gems are a digital good and are non-refundable once delivered. Stripe handles all
          payment processing; we do not store full card data. EU consumers retain a 14-day
          right of withdrawal except for digital content the consumer has consented to
          consuming immediately (gems credited to your account on purchase).
        </p>

        <h2>5. Cosmetics, characters, and item ownership</h2>
        <p>
          Characters, items, and cosmetics are licensed to you for use within the Game; we
          retain ownership of the underlying intellectual property. Closing your account
          deletes the associated character data.
        </p>

        <h2>6. Service availability</h2>
        <p>
          We aim for high uptime but do not guarantee uninterrupted service. Scheduled
          maintenance windows are announced via the in-game mail system at least 24 hours
          ahead. Unplanned outages may occur.
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          The Game is provided as-is. To the maximum extent allowed by applicable law, we
          disclaim warranties of fitness, merchantability, and non-infringement. We are not
          liable for indirect, incidental, or consequential damages arising from your use of
          the Game.
        </p>

        <h2>8. Changes</h2>
        <p>
          We may update these terms; material changes are surfaced in-game and on this page.
          Continued use of the Game after a change indicates acceptance of the updated terms.
        </p>

        <h2>9. Contact</h2>
        <p>
          For account, billing, or data-protection enquiries, email
          <code> support@nexus-dominion.example</code>.
        </p>

        <p className="muted" style={{ marginTop: 32 }}>
          See also: <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </article>
    </div>
  );
}
