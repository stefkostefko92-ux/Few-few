// frontend/src/pages/PrivacyPage.jsx
import Seo from "../components/Seo";

export default function PrivacyPage() {
  const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/support";
  const COMPANY    = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
  const EMAIL      = import.meta.env.VITE_CONTACT_EMAIL || "legal@carbonstealth.eu";
  const COUNTRY    = import.meta.env.VITE_COMPANY_COUNTRY || "Bulgaria";

  return (
    <LegalPage title="Privacy Policy" updated="27 June 2026">
      <Seo
        title="Privacy Policy — Supreme Bot"
        description="Privacy Policy for Supreme Bot: what data we process, EU data residency, GDPR rights, subprocessors, and retention periods."
        path="/privacy"
      />

      <div className="bg-cs-cyan/10 border border-cs-cyan/20 rounded-lg p-4 mb-8 text-sm text-cs-text">
        <strong className="text-cs-text">Summary:</strong> We collect only the data necessary to run the
        Service. We do not sell your data. We do not serve ads. We use Discord, Stripe, and optionally
        Anthropic to provide our features. You can request deletion of your data at any time.
      </div>

      <S title="1. Data Controller">
        <p>
          The data controller responsible for your personal data is <strong>{COMPANY}</strong>,
          registered in {COUNTRY}.
        </p>
        <p>
          Contact for data protection matters:{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>
        </p>
        <p>
          Where we process personal data of your Discord server members on your behalf (e.g.,
          ticket messages, application answers), you are the <strong>data controller</strong> and
          we act as your <strong>data processor</strong> under Article 28 GDPR. A Data Processing
          Agreement (DPA) is available on request.
        </p>
      </S>

      <S title="2. What Personal Data We Collect and Why">

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Category</Th>
                <Th>Data collected</Th>
                <Th>Purpose</Th>
                <Th>Legal basis (GDPR Art. 6)</Th>
                <Th>Retention</Th>
              </tr>
            </thead>
            <tbody className="text-cs-muted">
              <Tr>
                <Td>Identity</Td>
                <Td>Discord user ID, username, avatar hash, discriminator</Td>
                <Td>Authenticate you; display your profile in dashboard</Td>
                <Td>Art. 6(1)(b) — contract performance</Td>
                <Td>Until account deletion</Td>
              </Tr>
              <Tr>
                <Td>Authentication tokens</Td>
                <Td>Discord OAuth2 access token, refresh token, expiry</Td>
                <Td>Fetch your server list; authenticate API calls to Discord on your behalf</Td>
                <Td>Art. 6(1)(b) — contract performance</Td>
                <Td>Token TTL (~7 days), automatically renewed; deleted on logout</Td>
              </Tr>
              <Tr>
                <Td>Session data</Td>
                <Td>Session ID (opaque, stored in cookie)</Td>
                <Td>Maintain your login state across page loads</Td>
                <Td>Art. 6(1)(b) — contract performance</Td>
                <Td>7 days (cookie maxAge); cleared on logout</Td>
              </Tr>
              <Tr>
                <Td>Server configuration</Td>
                <Td>Discord guild IDs, guild names, channel IDs, role IDs, panel/form settings</Td>
                <Td>Provide the bot management service</Td>
                <Td>Art. 6(1)(b) — contract performance</Td>
                <Td>Until server is removed or account deleted</Td>
              </Tr>
              <Tr>
                <Td>Ticket & message data</Td>
                <Td>Discord user IDs of ticket creators, message content, attachment URLs</Td>
                <Td>Provide ticket system; generate transcripts</Td>
                <Td>Processed on behalf of the server operator (controller) under Art. 28 — the operator determines the legal basis (typically Art. 6(1)(f))</Td>
                <Td>Free: 30 days after closure. Premium: indefinite (or until deleted)</Td>
              </Tr>
              <Tr>
                <Td>Application form answers</Td>
                <Td>Text answers submitted by Discord users in application forms</Td>
                <Td>Provide application management feature</Td>
                <Td>Processed on behalf of the server operator (controller) under Art. 28 — the operator determines the legal basis (typically Art. 6(1)(f))</Td>
                <Td>Until server operator deletes or account is removed</Td>
              </Tr>
              <Tr>
                <Td>Server activity events (optional, off by default)</Td>
                <Td>Member actions the server operator chooses to log — voice mute/deaf/join, role &amp; nickname changes, timeouts, bans/kicks (no message content)</Td>
                <Td>Server moderation and audit trail, enabled and configured by the server operator</Td>
                <Td>Processed on behalf of the server operator (controller) under Art. 28 — the operator enables the feature and determines the legal basis and member notice</Td>
                <Td>Relayed in real time to the operator's chosen Discord channel only — not stored in our database</Td>
              </Tr>
              <Tr>
                <Td>Billing data</Td>
                <Td>Stripe customer ID, subscription ID, payment status, invoice amounts</Td>
                <Td>Process payments; manage subscription state; provide invoices</Td>
                <Td>Art. 6(1)(b) — contract; Art. 6(1)(c) — legal obligation (tax records)</Td>
                <Td>7 years (legal obligation for financial records)</Td>
              </Tr>
              <Tr>
                <Td>Custom bot token</Td>
                <Td>Discord bot token (Premium white-label feature)</Td>
                <Td>Operate your custom branded bot instance</Td>
                <Td>Art. 6(1)(b) — contract performance</Td>
                <Td>Until removed by user or account deleted</Td>
              </Tr>
              <Tr>
                <Td>Audit logs</Td>
                <Td>Action type, actor ID, timestamp, target resource ID, and (for security/abuse events) IP address</Td>
                <Td>Security audit trail; fraud prevention; compliance</Td>
                <Td>Art. 6(1)(f) — legitimate interest (security)</Td>
                <Td>2 years (records tied to GDPR requests or abuse reports are kept longer where legally required)</Td>
              </Tr>
              <Tr>
                <Td>Error / diagnostic data</Td>
                <Td>Stack traces, request context (anonymised), error messages</Td>
                <Td>Debug and improve the Service (Sentry)</Td>
                <Td>Art. 6(1)(f) — legitimate interest (service quality)</Td>
                <Td>30 days (Sentry default)</Td>
              </Tr>
            </tbody>
          </table>
        </div>
      </S>

      <S title="3. Sensitive Data">
        <p>
          We do not intentionally collect special categories of personal data as defined in
          Article 9 GDPR (e.g., health data, racial or ethnic origin, political opinions,
          religious beliefs, sexual orientation). You should not submit such data through the
          Service. If such data is inadvertently submitted (e.g., in a ticket message), it will
          be processed solely to provide the requested service and deleted according to the
          standard retention schedule.
        </p>
      </S>

      <S title="4. How We Store and Protect Your Data">
        <p><strong>4.1 Infrastructure.</strong> Data is stored in PostgreSQL databases and Redis
        cache. All data at rest is stored on servers located within the EU. Backups are encrypted
        and stored in the same jurisdiction.</p>

        <p><strong>4.2 Encryption.</strong> All data in transit is protected by TLS 1.2+. Custom
        Discord bot tokens are encrypted at rest using AES-256-GCM before storage. OAuth2 tokens
        are stored in a dedicated sessions table with row-level access control.</p>

        <p><strong>4.3 Access control.</strong> Access to production systems is restricted to
        authorised personnel on a need-to-know basis. Administrative actions are logged in the
        audit trail.</p>

        <p><strong>4.4 Payment data.</strong> We do not store credit card numbers or payment
        instrument details. All payment processing is performed by Stripe, Inc., which is
        PCI DSS Level 1 certified.</p>
      </S>

      <S title="5. Third-Party Processors">
        <p>
          We engage the following sub-processors to provide the Service. Each is subject to a
          Data Processing Agreement and provides appropriate GDPR safeguards:
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Processor</Th>
                <Th>Purpose</Th>
                <Th>Data transferred</Th>
                <Th>Location</Th>
                <Th>Safeguards</Th>
              </tr>
            </thead>
            <tbody className="text-cs-muted">
              <Tr>
                <Td>Hetzner Online GmbH</Td>
                <Td>Infrastructure hosting; database; backups</Td>
                <Td>All platform data (at rest)</Td>
                <Td>Germany (EU)</Td>
                <Td>Within EEA; ISO 27001 certified</Td>
              </Tr>
              <Tr>
                <Td>Discord, Inc.</Td>
                <Td>Authentication; bot operation</Td>
                <Td>User ID, username, OAuth tokens; bot messages</Td>
                <Td>USA</Td>
                <Td>SCC (Standard Contractual Clauses)</Td>
              </Tr>
              <Tr>
                <Td>Discord, Inc. (merchant of record)</Td>
                <Td>Payment processing for purchases made through Discord's Premium App checkout</Td>
                <Td>Discord user ID, entitlement and SKU identifiers, purchase status</Td>
                <Td>USA</Td>
                <Td>SCC (Standard Contractual Clauses); Discord acts as merchant of record</Td>
              </Tr>
              <Tr>
                <Td>Stripe Payments Europe, Ltd.</Td>
                <Td>Payment processing</Td>
                <Td>Email (if provided), billing amounts, subscription metadata</Td>
                <Td>Ireland (EU)</Td>
                <Td>Within EEA; PCI DSS Level 1</Td>
              </Tr>
              <Tr>
                <Td>Anthropic PBC</Td>
                <Td>AI auto-reply (Premium, optional)</Td>
                <Td>Ticket message content (first message only, on opt-in)</Td>
                <Td>USA</Td>
                <Td>SCC; Anthropic DPA; no training on API data</Td>
              </Tr>
              <Tr>
                <Td>Sentry (Functional Software, Inc.)</Td>
                <Td>Error monitoring (optional)</Td>
                <Td>Anonymised stack traces, request metadata</Td>
                <Td>USA/EU</Td>
                <Td>SCC; optional EU region</Td>
              </Tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          <strong>AI Auto-Reply notice.</strong> When the AI auto-reply feature is enabled by a
          Premium server administrator, message content from newly created tickets is sent to
          Anthropic's Claude API. This feature is <em>disabled by default</em> and must be
          explicitly enabled by the server administrator. Server members are informed via
          a prominent disclosure in every AI-generated message per EU AI Act Article 50.
        </p>
      </S>

      <S title="6. International Transfers">
        <p>
          Some of our sub-processors (Discord, Anthropic, Sentry) are located in the
          United States. Transfers of personal data to these processors are governed by Standard
          Contractual Clauses (SCCs) approved by the European Commission under Article 46(2)(c)
          GDPR, supplemented by technical and organisational measures assessed in our Transfer
          Impact Assessments.
        </p>
        <p>
          We only transfer the minimum data necessary for each processor to perform its function.
        </p>
      </S>

      <S title="7. Your Rights Under GDPR">
        <p>
          If you are in the EU/EEA/UK, you have the following rights under the GDPR (and where
          applicable, the UK GDPR):
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Right</Th>
                <Th>Article</Th>
                <Th>What it means</Th>
              </tr>
            </thead>
            <tbody className="text-cs-muted">
              <Tr>
                <Td>Access</Td>
                <Td>Art. 15</Td>
                <Td>Request a copy of all personal data we hold about you</Td>
              </Tr>
              <Tr>
                <Td>Rectification</Td>
                <Td>Art. 16</Td>
                <Td>Request correction of inaccurate data</Td>
              </Tr>
              <Tr>
                <Td>Erasure ("right to be forgotten")</Td>
                <Td>Art. 17</Td>
                <Td>Request deletion of your data (subject to legal retention obligations)</Td>
              </Tr>
              <Tr>
                <Td>Restriction of processing</Td>
                <Td>Art. 18</Td>
                <Td>Request that we limit processing while a dispute is resolved</Td>
              </Tr>
              <Tr>
                <Td>Data portability</Td>
                <Td>Art. 20</Td>
                <Td>Receive your data in a structured, machine-readable format (JSON)</Td>
              </Tr>
              <Tr>
                <Td>Objection</Td>
                <Td>Art. 21</Td>
                <Td>Object to processing based on legitimate interest</Td>
              </Tr>
              <Tr>
                <Td>Withdraw consent</Td>
                <Td>Art. 7(3)</Td>
                <Td>Where processing is based on consent, withdraw it at any time</Td>
              </Tr>
              <Tr>
                <Td>Automated decisions</Td>
                <Td>Art. 22</Td>
                <Td>Not to be subject to solely automated decisions with legal effects</Td>
              </Tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          To exercise any right, contact us at{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>.
          We will respond within <strong>30 days</strong> as required by Article 12 GDPR.
          We may need to verify your identity before processing your request.
        </p>
        <p>
          <strong>What deletion (erasure) actually does:</strong> when you delete your account we
          anonymize your profile (username and avatar) and erase your sessions and OAuth tokens.
          For referential integrity we keep a non-identifying internal reference so other users'
          records (e.g. tickets they opened) remain intact — this is pseudonymized data, not a full
          re-identifiable profile. Records we are legally required to keep, in particular invoice
          and transaction data (7 years for tax law), are retained for that period and then purged.
          If you have an active Premium subscription, please cancel it before requesting deletion,
          since billing must be wound down first — this is a permitted limitation under Article
          17(3)(b) and (e) GDPR.
        </p>
        <p>
          You also have the right to lodge a complaint with the supervisory authority in the
          EU member state of your habitual residence, place of work, or the place of the alleged
          infringement. A list of supervisory authorities is available at:{" "}
          <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en"
            target="_blank" rel="noopener noreferrer"
            className="text-cs-cyan hover:underline">
            edpb.europa.eu
          </a>.
        </p>
      </S>

      <S title="8. Data Retention">
        <p>We retain personal data only as long as necessary for the stated purpose:</p>
        <ul>
          <li><strong>Account data</strong> — Until you request deletion (you can delete your account at any time from the dashboard);</li>
          <li><strong>Discord OAuth2 tokens</strong> — Encrypted at rest; automatically refreshed; expired sessions are cleaned up regularly and revoked on logout or account deletion;</li>
          <li><strong>Ticket transcripts (Free tier)</strong> — 30 days after ticket closure, then automatically purged;</li>
          <li><strong>Ticket transcripts (Premium)</strong> — Indefinitely until manually deleted or subscription lapses;</li>
          <li><strong>Application data</strong> — Until deleted by the server operator;</li>
          <li><strong>Billing records</strong> — 7 years (tax and accounting legal obligation);</li>
          <li><strong>Audit logs</strong> — 2 years (records tied to GDPR requests or abuse reports are retained longer where legally required);</li>
          <li><strong>Error logs (Sentry)</strong> — 30 days;</li>
          <li><strong>Session cookies</strong> — 7 days from last login.</li>
        </ul>
      </S>

      <S title="9. Children's Privacy">
        <p>
          The Service is not directed at children under 13. We do not knowingly collect personal
          data from children under 13. If we become aware that we have collected data from a
          child under 13 without parental consent, we will delete it promptly. If you believe
          we have collected such data, contact us at{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>.
        </p>
        <p>
          In the EU, processing of children's data for online services is lawful only where the
          child is at least 16 years of age (or such lower age as set by the member state's law,
          minimum 13), or with parental consent (Article 8 GDPR). In <strong>Bulgaria</strong>,
          where we are established, that age threshold is <strong>14</strong> (Personal Data
          Protection Act): children under 14 require parental consent.
        </p>
      </S>

      <S title="10. Automated Decision-Making and Profiling">
        <p>
          We do not use your personal data for automated decision-making that produces legal
          effects or similarly significantly affects you, as defined in Article 22 GDPR. We do
          not engage in profiling for advertising or marketing purposes.
        </p>
        <p>
          The AI auto-reply feature uses Anthropic's Claude models to generate suggested responses to
          tickets. These suggestions are informational only and are not used to make automated
          decisions about individuals.
        </p>
      </S>

      <S title="11. Data Breaches">
        <p>
          In the event of a personal data breach that is likely to result in a risk to your
          rights and freedoms, we will notify the relevant supervisory authority within 72 hours
          of becoming aware of the breach, in accordance with Article 33 GDPR. Where the breach
          is likely to result in a high risk to your rights and freedoms, we will also notify
          you directly without undue delay, in accordance with Article 34 GDPR.
        </p>
      </S>

      <S title="12. Cookies">
        <p>
          We use cookies. For full details, see our{" "}
          <a href="/cookies" className="text-cs-cyan hover:underline">Cookie Policy</a>.
          In summary, we use only one strictly necessary session cookie. We do not use advertising
          or tracking cookies.
        </p>
      </S>

      <S title="13. Changes to This Policy">
        <p>
          We may update this Privacy Policy periodically. Material changes that affect your
          rights will be communicated via the dashboard notification or Support Server at least
          14 days before taking effect. The "Last updated" date at the top of this page reflects
          the most recent revision. Continued use of the Service after the effective date
          constitutes acceptance.
        </p>
        <p>
          Where required by GDPR, we will obtain fresh consent for any material changes to
          processing based on consent.
        </p>
      </S>

      <S title="14. Contact — Data Protection Matters">
        <p>
          For any questions about this Privacy Policy, to exercise your rights, or to contact
          our Data Protection contact:
        </p>
        <ul>
          <li>Email: <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a></li>
          <li>Support: <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="text-cs-cyan hover:underline">Support Server</a></li>
        </ul>
        <p>
          We aim to respond to all data subject requests within 30 days. For complex requests,
          we may extend this by a further 2 months and will notify you accordingly.
        </p>
      </S>
    </LegalPage>
  );
}

function LegalPage({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-cs-bg text-cs-text" role="main" id="main-content">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-2">
          <a href="/" className="text-sm text-cs-muted hover:text-cs-text transition-colors">← Back to home</a>
        </div>
        <h1 className="text-3xl font-bold text-cs-text mb-2 mt-4">{title}</h1>
        <p className="text-cs-muted text-sm mb-12">Last updated: {updated}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

function S({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-cs-text mb-3 pb-1 border-b border-white/5">{title}</h2>
      <div className="text-sm text-cs-muted leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ul]:my-2 [&_ul]:text-cs-muted">
        {children}
      </div>
    </section>
  );
}
function Th({ children }) {
  return <th className="text-left py-2 px-3 text-cs-muted font-semibold border-b border-white/5">{children}</th>;
}
function Td({ children }) {
  return <td className="py-2 px-3 border-b border-white/5 align-top">{children}</td>;
}
function Tr({ children }) {
  return <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>;
}
