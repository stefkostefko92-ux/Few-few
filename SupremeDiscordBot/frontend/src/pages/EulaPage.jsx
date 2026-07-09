// frontend/src/pages/EulaPage.jsx
// End User License Agreement — Supreme Bot Discord SaaS Platform
// Covers: SaaS access, bot deployment in Discord, data processing,
// premium features, white-label, API usage, and enforcement.

import Seo from "../components/Seo";

export default function EulaPage() {
  const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
  const EMAIL   = import.meta.env.VITE_CONTACT_EMAIL || "legal@carbonstealth.eu";
  const SUPPORT = import.meta.env.VITE_SUPPORT_URL   || "https://discord.gg/support";
  const COUNTRY = import.meta.env.VITE_COMPANY_COUNTRY || "Bulgaria";

  return (
    <LegalPage title="End User License Agreement (EULA)" updated="27 June 2026">
      <Seo
        title="End User License Agreement — Supreme Bot"
        description="End User License Agreement for Supreme Bot: SaaS access, bot deployment, premium features, white-label terms, and API usage."
        path="/eula"
      />

      <div className="bg-cs-cyan/10 border border-cs-cyan/20 rounded-lg p-4 mb-8 text-sm text-cs-text">
        <strong className="text-cs-text">Important:</strong> This End User License Agreement ("EULA")
        governs your right to access and use the {COMPANY} software platform. Please read it carefully.
        By authenticating via Discord OAuth2, subscribing to any plan, or using any feature of the
        Service, you agree to be legally bound by this EULA. If you do not agree, you must not use
        the Service.
      </div>

      <S title="1. Definitions">
        <p>For the purposes of this EULA, the following terms have the meanings set out below:</p>
        <ul>
          <li><strong className="text-cs-text">"Agreement"</strong> means this End User License Agreement, together with the Terms of Service, Privacy Policy, and Cookie Policy, all of which are incorporated herein by reference.</li>
          <li><strong className="text-cs-text">"Licensor"</strong> means <strong>{COMPANY}</strong>, registered in {COUNTRY}.</li>
          <li><strong className="text-cs-text">"Licensee"</strong> or <strong>"you"</strong> means the individual or legal entity accessing the Service, including in the capacity of a Discord server administrator.</li>
          <li><strong className="text-cs-text">"Service"</strong> means the {COMPANY} software-as-a-service platform, including the web dashboard, Discord bot, backend API, all associated software, documentation, and content.</li>
          <li><strong className="text-cs-text">"Software"</strong> means the underlying proprietary code, algorithms, database schemas, and infrastructure constituting the Service.</li>
          <li><strong className="text-cs-text">"Discord Server"</strong> means any Discord guild to which you have connected the Service's bot.</li>
          <li><strong className="text-cs-text">"End Users"</strong> means the members of your Discord Server(s) who interact with the bot, including by submitting tickets or applications.</li>
          <li><strong className="text-cs-text">"User Content"</strong> means all data, messages, form answers, configurations, and other content created by you or your End Users through the Service.</li>
          <li><strong className="text-cs-text">"Premium Features"</strong> means features accessible only to Licensees with an active Premium subscription, as described in Section 7.</li>
          <li><strong className="text-cs-text">"Subscription Term"</strong> means the period during which you have an active, paid Premium subscription.</li>
          <li><strong className="text-cs-text">"Free Tier"</strong> means the no-cost access to the Service subject to the limitations described in Section 6.</li>
          <li><strong className="text-cs-text">"White-label Bot"</strong> means the White-label-tier (or Agency-tier) feature permitting a Licensee to operate the bot under a custom Discord application token, name, and avatar.</li>
          <li><strong className="text-cs-text">"API"</strong> means the application programming interface exposed by the backend service at port 3000.</li>
          <li><strong className="text-cs-text">"Effective Date"</strong> means the date on which you first authenticate via Discord OAuth2 or begin using the Service, whichever is earlier.</li>
        </ul>
      </S>

      <S title="2. Grant of License">
        <p>
          Subject to your compliance with this Agreement and payment of applicable fees,
          the Licensor grants you a <strong>limited, non-exclusive, non-transferable,
          non-sublicensable, revocable licence</strong> to:
        </p>
        <ul>
          <li>Access and use the Service through the web dashboard for the purpose of managing your Discord Server(s);</li>
          <li>Invite and operate the Service's Discord bot within your Discord Server(s);</li>
          <li>Access Premium Features during an active Subscription Term;</li>
          <li>Store User Content within the Service subject to the retention limits applicable to your plan.</li>
        </ul>
        <p>
          This licence is granted solely for your personal or internal business use and does
          not permit commercial redistribution, resale, or white-labelling of the Service
          itself except as expressly set out in Section 8.
        </p>
        <p>
          <strong className="text-cs-text">No ownership transfer.</strong> The licence granted
          hereunder does not constitute a sale or transfer of any intellectual property rights in
          the Software. The Licensor retains all rights not expressly granted.
        </p>
      </S>

      <S title="3. Licence Restrictions">
        <p>You must not, and must not permit any third party to:</p>
        <ul>
          <li>Copy, modify, adapt, translate, reverse-engineer, disassemble, decompile, or attempt to derive the source code of any part of the Software;</li>
          <li>Create derivative works based on the Software or any part thereof;</li>
          <li>Sublicense, sell, resell, transfer, assign, or otherwise dispose of your rights under this Agreement without prior written consent;</li>
          <li>Use the Service to build a competing product or service;</li>
          <li>Use the Service to provide managed services to third parties without the Licensor's written consent;</li>
          <li>Remove, alter, or obscure any copyright, trademark, or other proprietary notices from the Software or its documentation;</li>
          <li>Access the Software by any means other than the interfaces expressly provided (including by scraping, crawling, or automated tools not approved by the Licensor);</li>
          <li>Circumvent or attempt to circumvent any access controls, authentication mechanisms, rate limits, or usage restrictions;</li>
          <li>Use the Service in any manner that violates Discord's Terms of Service, Community Guidelines, or Developer Policy;</li>
          <li>Use the Service to engage in any illegal activity or to facilitate illegal activity by third parties;</li>
          <li>Introduce malware, viruses, Trojan horses, worms, or any other malicious or destructive code into the Service;</li>
          <li>Interfere with or disrupt the integrity or performance of the Service or any related infrastructure;</li>
          <li>Access any component of the Service that you are not authorised to access, including the administrative interface, other users' data, or server-side infrastructure;</li>
          <li>Attempt to probe, scan, or test the vulnerability of the Service without prior written authorisation from the Licensor;</li>
          <li>Use the Service to process data on behalf of third parties as a data processor without entering into a Data Processing Agreement with the Licensor.</li>
        </ul>
      </S>

      <S title="4. Intellectual Property">
        <p>
          <strong className="text-cs-text">4.1 Ownership of Software.</strong>{" "}
          The Service, including all Software, code, algorithms, designs, databases, user interface
          elements, documentation, and all updates and modifications thereto, is and shall remain the
          exclusive intellectual property of the Licensor. The Service is protected by copyright,
          trade secret, and other applicable intellectual property laws.
        </p>
        <p>
          <strong className="text-cs-text">4.2 Trademarks.</strong>{" "}
          "{COMPANY}", the {COMPANY} logo, and all related names, logos, product and service names,
          designs, and slogans are trademarks of the Licensor. You must not use such marks without
          the prior written permission of the Licensor.
        </p>
        <p>
          <strong className="text-cs-text">4.3 User Content Licence.</strong>{" "}
          You retain all right, title, and interest in User Content. By using the Service, you grant
          the Licensor a worldwide, royalty-free, non-exclusive licence to host, store, process,
          display, and transmit User Content solely to the extent necessary to provide the Service.
          This licence terminates upon deletion of the User Content or termination of your account,
          subject to any legal retention obligations.
        </p>
        <p>
          <strong className="text-cs-text">4.4 Feedback.</strong>{" "}
          If you submit suggestions, ideas, enhancement requests, recommendations, or other
          feedback about the Service ("Feedback"), you grant the Licensor a perpetual, irrevocable,
          royalty-free, worldwide licence to use, incorporate, and exploit such Feedback in any
          manner without any obligation to you.
        </p>
        <p>
          <strong className="text-cs-text">4.5 Third-Party Components.</strong>{" "}
          The Service incorporates certain open-source and third-party components, each of which is
          subject to its own licence terms. These licences do not affect your rights under this
          EULA, but you acknowledge that the Licensor has no control over such third-party software.
        </p>
      </S>

      <S title="5. Acceptable Use Policy">
        <p>
          You are responsible for all activity conducted through your account and Discord Server(s).
          You agree to use the Service only for lawful purposes and in accordance with this Agreement.
        </p>
        <p>
          <strong className="text-cs-text">5.1 Prohibited Content.</strong>{" "}
          You must not use the Service to store, transmit, or facilitate:
        </p>
        <ul>
          <li>Content that infringes or misappropriates any third party's intellectual property rights;</li>
          <li>Content that is defamatory, harassing, abusive, threatening, or discriminatory;</li>
          <li>Content that promotes violence, self-harm, or illegal activities;</li>
          <li>Child sexual abuse material or any content that sexually exploits or harms minors;</li>
          <li>Unsolicited commercial communications (spam);</li>
          <li>Content that constitutes illegal surveillance or stalking.</li>
        </ul>
        <p>
          <strong className="text-cs-text">5.2 Security.</strong>{" "}
          You are responsible for maintaining the security of your Discord account credentials and
          any custom bot token you store in the Service. You must notify the Licensor immediately
          upon becoming aware of any unauthorised access to your account or any security vulnerability
          in the Service.
        </p>
        <p>
          <strong className="text-cs-text">5.3 Responsibility for End Users.</strong>{" "}
          If you operate a Discord Server with the Service, you are responsible for ensuring that
          your End Users comply with this Acceptable Use Policy. You must take prompt action to
          remove any content that violates this policy and to prevent repeat violations.
        </p>
        <p>
          <strong className="text-cs-text">5.4 Enforcement.</strong>{" "}
          The Licensor reserves the right, but has no obligation, to monitor your use of the
          Service for compliance with this policy. The Licensor may, at its sole discretion,
          remove User Content and/or suspend or terminate access for violations.
        </p>
      </S>

      <S title="6. Free Tier — Scope and Limitations">
        <p>
          The Free Tier grants access to the Service at no charge, subject to the following
          limitations, which the Licensor may modify with reasonable prior notice:
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Feature</Th>
                <Th>Free Tier Limit</Th>
              </tr>
            </thead>
            <tbody className="text-cs-muted">
              <Tr><Td>Ticket panels</Td><Td>1 panel</Td></Tr>
              <Tr><Td>Forms</Td><Td>Up to 2 forms</Td></Tr>
              <Tr><Td>Questions per form</Td><Td>Up to 5 questions</Td></Tr>
              <Tr><Td>Verification panels</Td><Td>1 panel</Td></Tr>
              <Tr><Td>Ticket transcript retention</Td><Td>30 days after ticket closure (then automatically deleted)</Td></Tr>
              <Tr><Td>AI auto-replies</Td><Td>Not available</Td></Tr>
              <Tr><Td>Round-Robin assignment</Td><Td>Not available</Td></Tr>
              <Tr><Td>White-label bot</Td><Td>Not available</Td></Tr>
              <Tr><Td>CSV / PDF export</Td><Td>Not available</Td></Tr>
              <Tr><Td>Slash commands</Td><Td>Core commands only</Td></Tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          <strong className="text-cs-text">No SLA on Free Tier.</strong> The Licensor makes no
          service level commitments for Free Tier users. The Service may be modified, suspended,
          or discontinued for Free Tier users with 14 days' prior notice.
        </p>
      </S>

      <S title="7. Paid Subscriptions — Rights and Restrictions">
        <p>
          <strong className="text-cs-text">7.1 Paid Tiers.</strong>{" "}
          The Service offers the following paid tiers (prices in EUR, VAT included where
          applicable; annual billing available at approximately two months' discount):
        </p>
        <ul>
          <li>
            <strong className="text-cs-text">Premium</strong> (€9.99/server/month or €99/year) —
            in addition to all Free Tier features with the applicable limits removed: up to 50
            panels, forms, and questions per form; HTML ticket transcripts retained indefinitely
            (no 30-day deletion); PDF export of individual ticket transcripts; CSV export of all
            tickets and applications; AI auto-replies on new tickets; Round-Robin automatic
            ticket assignment; webhook integrations and the public REST API.
          </li>
          <li>
            <strong className="text-cs-text">White-label</strong> (€19.99/server/month or
            €199/year) — everything in Premium plus the White-label Bot (custom token, name,
            avatar — subject to Section 8).
          </li>
          <li>
            <strong className="text-cs-text">Agency 5 / Agency 10</strong> (€39.99/month or
            €399/year for up to 5 servers; €79.99/month or €799/year for up to 10 servers) —
            one subscription granting the White-label tier to the covered servers, assigned and
            removed by the subscription owner up to the seat limit.
          </li>
        </ul>
        <p>
          <strong className="text-cs-text">7.2 Subscription Term and Renewal.</strong>{" "}
          Premium and White-label subscriptions are billed per Discord server; Agency
          subscriptions are billed per account and cover multiple servers. Billing is monthly or
          annual, as selected at checkout. Subscriptions auto-renew at the end of each billing
          period unless cancelled. The Licensor uses Stripe, Inc. as its payment processor;
          subscriptions may alternatively be purchased through Discord's own Premium App checkout,
          in which case Discord Inc. acts as merchant of record for that purchase.
        </p>
        <p>
          <strong className="text-cs-text">7.3 Free Trial.</strong>{" "}
          New Premium subscriptions may begin with a 14-day free trial period. During the trial,
          all Premium Features are accessible. No charge is made during the trial. If the trial
          is not cancelled before it ends, the charge for the selected billing period (monthly or annual) commences automatically.
        </p>
        <p>
          <strong className="text-cs-text">7.4 Price Changes.</strong>{" "}
          The Licensor may change the subscription price with at least 30 days' notice. Your
          continued use of the Premium subscription after the effective date of a price change
          constitutes acceptance of the new price.
        </p>
        <p>
          <strong className="text-cs-text">7.5 Downgrade.</strong>{" "}
          Upon cancellation or expiry of a Premium subscription, your Discord server reverts to
          the Free Tier. Premium-only User Content (e.g., transcripts retained beyond 30 days)
          will be subject to the Free Tier retention policy, meaning transcripts older than 30 days
          will be deleted during the next scheduled cleanup cycle.
        </p>
        <p>
          <strong className="text-cs-text">7.6 Refunds.</strong>{" "}
          Refunds are governed by the Refund Policy in the Terms of Service. Premium subscriptions
          carry a 7-day money-back guarantee for first-time purchases only.
        </p>
        <p>
          <strong className="text-cs-text">7.7 Payment Failure.</strong>{" "}
          If a payment fails, the Licensor's payment processor will retry according to its standard
          schedule. If payment cannot be collected after the retry period, the subscription will be
          downgraded to the Free Tier without further notice.
        </p>
      </S>

      <S title="8. White-Label Bot — Special Terms">
        <p>
          The White-label Bot feature permits Licensees on the White-label or Agency tier to operate the Service's bot
          functionality under a custom Discord application. The following special terms apply:
        </p>
        <p>
          <strong className="text-cs-text">8.1 Your Discord Application.</strong>{" "}
          You must create and register your own Discord Application at{" "}
          <a href="https://discord.com/developers" target="_blank" rel="noopener noreferrer"
            className="text-cs-cyan hover:underline">discord.com/developers</a>{" "}
          and supply your bot token to the Service. Your Discord Application is subject to
          Discord's Developer Terms of Service, which you are solely responsible for complying with.
        </p>
        <p>
          <strong className="text-cs-text">8.2 Token Security.</strong>{" "}
          Your custom bot token is encrypted at rest using AES-256-GCM before storage in the
          Service's database. The Licensor takes reasonable measures to protect your token, but
          you remain responsible for the security of your Discord Application and for rotating
          the token if you believe it has been compromised.
        </p>
        <p>
          <strong className="text-cs-text">8.3 Underlying Software.</strong>{" "}
          The White-label Bot is powered by the Licensor's Software running on the Licensor's
          infrastructure. You are purchasing a customised interface, not a separate software licence
          or a copy of the underlying code. All restrictions in Section 3 continue to apply.
        </p>
        <p>
          <strong className="text-cs-text">8.4 Termination.</strong>{" "}
          Upon termination of your White-label or Agency subscription, the White-label Bot will be automatically
          shut down. The Licensor will destroy any stored copy of your bot token within 30 days.
        </p>
        <p>
          <strong className="text-cs-text">8.5 Discord Compliance.</strong>{" "}
          You are solely responsible for ensuring that your White-label Bot and its usage comply
          with Discord's Terms of Service, Monetization Policy, and Developer Policy. The Licensor
          accepts no responsibility for any action taken by Discord against your application.
        </p>
      </S>

      <S title="9. AI Auto-Reply Feature — Special Terms">
        <p>
          <strong className="text-cs-text">9.1 Anthropic Processing.</strong>{" "}
          When the AI auto-reply feature is enabled, newly submitted ticket messages are sent to
          Anthropic PBC ("Anthropic") for processing via their API. By enabling this feature, you
          acknowledge and consent to this data transfer. Anthropic processes data subject to their
          API Data Usage Policies and a Standard Contractual Clause arrangement.
        </p>
        <p>
          <strong className="text-cs-text">9.2 Operator Responsibility.</strong>{" "}
          If you enable AI auto-replies, you must inform your Discord Server members that their
          initial ticket messages may be processed by an AI service. You are responsible for
          compliance with any applicable consumer protection, data protection, or AI transparency
          laws in your jurisdiction.
        </p>
        <p>
          <strong className="text-cs-text">9.3 No Guarantee of Accuracy.</strong>{" "}
          AI-generated responses are produced by a language model and may be inaccurate, incomplete,
          or inappropriate. The Licensor provides no warranty regarding the accuracy, quality, or
          suitability of AI-generated content. You should configure the feature with an appropriate
          system prompt and monitor outputs.
        </p>
        <p>
          <strong className="text-cs-text">9.4 Disable at Any Time.</strong>{" "}
          You may disable AI auto-replies at any time from the Settings page. Disabling the feature
          immediately prevents future ticket messages from being sent to Anthropic.
        </p>
      </S>

      <S title="10. Data, Privacy, and Security">
        <p>
          <strong className="text-cs-text">10.1 Controller/Processor Relationship.</strong>{" "}
          In respect of data submitted by your End Users (ticket messages, application form answers,
          Discord user IDs), you act as the data controller and the Licensor acts as data processor.
          The Licensor will process such data only on your behalf and in accordance with a Data
          Processing Agreement (DPA) available upon request.
        </p>
        <p>
          <strong className="text-cs-text">10.2 Your Obligations as Controller.</strong>{" "}
          You are responsible for: (a) establishing and communicating a lawful basis for processing
          End User data under GDPR Article 6; (b) providing End Users with appropriate privacy
          notices; (c) handling data subject requests from End Users; and (d) ensuring you have
          authority to deploy the bot and collect the data it processes.
        </p>
        <p>
          <strong className="text-cs-text">10.3 Security Measures.</strong>{" "}
          The Licensor implements the following technical and organisational security measures:
        </p>
        <ul>
          <li>AES-256-GCM encryption for sensitive fields (bot tokens) at rest;</li>
          <li>TLS 1.2+ encryption of all data in transit;</li>
          <li>Rate limiting on all API endpoints (global, authentication, and bot-specific);</li>
          <li>HTTP security headers (helmet.js: X-Frame-Options, X-Content-Type-Options, CSP);</li>
          <li>Session cookies with HttpOnly, Secure, and SameSite=Lax attributes;</li>
          <li>Discord OAuth2 token auto-refresh to avoid session expiry;</li>
          <li>Audit logging of all administrative actions;</li>
          <li>Optional error monitoring via Sentry with configurable data scrubbing.</li>
        </ul>
        <p>
          <strong className="text-cs-text">10.4 Breach Notification.</strong>{" "}
          In the event of a personal data breach affecting End User data for which you are the
          controller, the Licensor will notify you within 72 hours of becoming aware, as required
          by GDPR Article 33.
        </p>
        <p>
          <strong className="text-cs-text">10.5 Data Retention and Deletion.</strong>{" "}
          Retention periods are described in the Privacy Policy. You may request deletion of
          your account and associated User Content by contacting{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>.
          Financial records are retained for 7 years as required by law.
        </p>
      </S>

      <S title="11. Third-Party Services and Integrations">
        <p>
          The Service integrates with the following third-party services. Your use of the Service
          constitutes acknowledgement that these third parties process data in connection with the
          Service:
        </p>
        <ul>
          <li>
            <strong className="text-cs-text">Discord, Inc.</strong> — Authentication (OAuth2),
            bot operation, message delivery. Subject to Discord's Terms of Service and Privacy Policy.
            The Licensor is an independent operator and not affiliated with Discord.
          </li>
          <li>
            <strong className="text-cs-text">Stripe, Inc.</strong> — Payment processing.
            The Licensor does not store payment card data. Stripe is PCI DSS Level 1 certified.
          </li>
          <li>
            <strong className="text-cs-text">Anthropic, L.L.C.</strong> — AI auto-reply generation
            (Premium, opt-in only). Subject to Anthropic's Usage Policies and API Terms.
          </li>
          <li>
            <strong className="text-cs-text">Sentry (Functional Software, Inc.)</strong> — Error
            monitoring (optional, requires SENTRY_DSN configuration). Subject to Sentry's Privacy Policy.
          </li>
        </ul>
        <p>
          The Licensor is not responsible for the availability, accuracy, or legality of any
          third-party service. Changes to third-party services may affect the functionality of the Service.
        </p>
      </S>

      <S title="12. Service Availability and Support">
        <p>
          <strong className="text-cs-text">12.1 Uptime.</strong>{" "}
          The Licensor will use commercially reasonable efforts to maintain the Service's availability.
          No specific uptime guarantee (SLA) is offered under the Free Tier. Premium subscribers
          may negotiate an SLA by contacting support.
        </p>
        <p>
          <strong className="text-cs-text">12.2 Maintenance.</strong>{" "}
          The Licensor may take the Service offline for scheduled maintenance. Where possible,
          maintenance windows will be announced via the Support Server in advance.
        </p>
        <p>
          <strong className="text-cs-text">12.3 Support.</strong>{" "}
          Community support is available via the{" "}
          <a href={SUPPORT} target="_blank" rel="noopener noreferrer"
            className="text-cs-cyan hover:underline">Support Server</a>.
          Email support is available at{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>.
          Response times are provided on a best-effort basis and are not guaranteed.
        </p>
        <p>
          <strong className="text-cs-text">12.4 Updates.</strong>{" "}
          The Licensor may update, modify, or add to the Service at any time. Updates may include
          changes to features, APIs, or infrastructure. The Licensor will provide reasonable notice
          of material changes that adversely affect existing functionality.
        </p>
      </S>

      <S title="13. Disclaimer of Warranties">
        <p>
          TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED "AS IS"
          AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
          NOT LIMITED TO:
        </p>
        <ul>
          <li>WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT;</li>
          <li>ANY WARRANTY THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE;</li>
          <li>ANY WARRANTY THAT DEFECTS WILL BE CORRECTED;</li>
          <li>ANY WARRANTY REGARDING THE ACCURACY OR RELIABILITY OF ANY CONTENT, INCLUDING AI-GENERATED CONTENT;</li>
          <li>ANY WARRANTY REGARDING THIRD-PARTY SERVICES INTEGRATED WITH THE SERVICE.</li>
        </ul>
        <p>
          NOTHING IN THIS AGREEMENT EXCLUDES OR LIMITS ANY NON-EXCLUDABLE STATUTORY GUARANTEES
          THAT APPLY UNDER THE LAWS OF YOUR JURISDICTION.
        </p>
      </S>

      <S title="14. Limitation of Liability">
        <p>
          <strong className="text-cs-text">14.1 Exclusion of Indirect Damages.</strong>{" "}
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE LICENSOR SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS
          OF PROFITS, REVENUE, DATA, GOODWILL, BUSINESS OPPORTUNITIES, OR ANTICIPATED SAVINGS,
          EVEN IF THE LICENSOR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>
        <p>
          <strong className="text-cs-text">14.2 Cap on Liability.</strong>{" "}
          THE LICENSOR'S TOTAL CUMULATIVE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR
          RELATING TO THIS AGREEMENT SHALL NOT EXCEED THE GREATER OF: (a) THE TOTAL FEES YOU
          PAID TO THE LICENSOR IN THE 12 MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO
          THE CLAIM, OR (b) EUR 50.
        </p>
        <p>
          <strong className="text-cs-text">14.3 Exceptions.</strong>{" "}
          Nothing in this EULA excludes or limits the Licensor's liability for:
        </p>
        <ul>
          <li>Death or personal injury caused by the Licensor's negligence;</li>
          <li>Fraud or fraudulent misrepresentation;</li>
          <li>Any liability that cannot be excluded under applicable law.</li>
        </ul>
        <p>
          <strong className="text-cs-text">14.4 Essential Basis.</strong>{" "}
          You acknowledge that the limitations in this Section 14 reflect a reasonable allocation
          of risk and form an essential basis of the bargain between you and the Licensor. Without
          these limitations, the Licensor would not be able to offer the Service at the current price.
        </p>
      </S>

      <S title="15. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless the Licensor and its officers,
          directors, employees, contractors, and agents from and against any and all claims,
          liabilities, damages, losses, costs, and expenses (including reasonable legal and
          professional fees) arising out of or in connection with:
        </p>
        <ul>
          <li>Your use or misuse of the Service;</li>
          <li>Your breach of any representation, warranty, or obligation under this Agreement;</li>
          <li>Your violation of any applicable law or regulation;</li>
          <li>Your violation of any third party's rights, including Discord's Terms of Service;</li>
          <li>Any User Content submitted through your account;</li>
          <li>Any claim by an End User arising from your operation of the Service within your Discord Server;</li>
          <li>Your operation of the White-label Bot or AI auto-reply features.</li>
        </ul>
        <p>
          The Licensor reserves the right to assume exclusive control of the defence of any matter
          subject to indemnification by you, at your expense. You agree to cooperate fully in the
          defence of any such matter.
        </p>
      </S>

      <S title="16. Term and Termination">
        <p>
          <strong className="text-cs-text">16.1 Term.</strong>{" "}
          This Agreement is effective from the Effective Date and continues until terminated in
          accordance with this Section.
        </p>
        <p>
          <strong className="text-cs-text">16.2 Termination by You.</strong>{" "}
          You may terminate this Agreement at any time by ceasing to use the Service. To request
          deletion of your account and associated data, contact{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>.
          If you have an active Premium subscription, cancellation takes effect at the end of the
          current billing period.
        </p>
        <p>
          <strong className="text-cs-text">16.3 Termination by Licensor.</strong>{" "}
          The Licensor may suspend or terminate your access to the Service immediately and without
          prior notice if:
        </p>
        <ul>
          <li>You breach any provision of this Agreement;</li>
          <li>The Licensor is required to do so by law or a court order;</li>
          <li>You engage in conduct that poses a security risk to the Service or other users;</li>
          <li>Your Discord account is suspended or terminated by Discord;</li>
          <li>The Licensor discontinues the Service.</li>
        </ul>
        <p>
          <strong className="text-cs-text">16.4 Effects of Termination.</strong>{" "}
          Upon termination: (a) all licences granted hereunder cease immediately; (b) you must
          cease all use of the Service; (c) any outstanding payment obligations remain due;
          (d) User Content will be retained for 30 days following termination then deleted,
          unless a shorter period is required by law; (e) financial records are retained
          for 7 years.
        </p>
        <p>
          <strong className="text-cs-text">16.5 Survival.</strong>{" "}
          Sections 3, 4, 5, 9.3, 10, 13, 14, 15, 16.4, 17, 18, and 19 survive termination
          of this Agreement.
        </p>
      </S>

      <S title="17. Export Controls">
        <p>
          The Software may be subject to export control laws and regulations. You agree to
          comply with all applicable export and re-export control laws and regulations, including
          EU dual-use regulations and applicable US Export Administration Regulations.
          You represent and warrant that you are not located in a country subject to a government
          embargo and are not listed on any government list of prohibited or restricted parties.
        </p>
      </S>

      <S title="18. Governing Law and Dispute Resolution">
        <p>
          <strong className="text-cs-text">18.1 Governing Law.</strong>{" "}
          This Agreement is governed by and construed in accordance with the laws of {COUNTRY},
          without regard to its conflict-of-laws provisions. The UN Convention on Contracts for
          the International Sale of Goods does not apply.
        </p>
        <p>
          <strong className="text-cs-text">18.2 Informal Resolution.</strong>{" "}
          Before initiating formal legal proceedings, you agree to contact the Licensor at{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>{" "}
          and attempt to resolve any dispute informally for at least 30 days.
        </p>
        <p>
          <strong className="text-cs-text">18.3 Jurisdiction.</strong>{" "}
          If informal resolution fails, disputes shall be subject to the exclusive jurisdiction
          of the courts of {COUNTRY}. Nothing in this section prevents either party from seeking
          emergency injunctive relief from any competent court.
        </p>
        <p>
          <strong className="text-cs-text">18.4 EU Consumer Rights.</strong>{" "}
          If you are a consumer in the EU, you may refer disputes to an alternative dispute
          resolution (ADR) body. The European Commission's Online Dispute Resolution platform
          was discontinued on 20 July 2025, so it is no longer available. Consumers in Bulgaria
          may contact the conciliation commissions of the Commission for Consumer Protection
          (КЗП), and consumers elsewhere in the EU may use the European Consumer Centres Network
          (ECC-Net) at{" "}
          <a href="https://www.eccnet.eu/" target="_blank" rel="noopener noreferrer"
            className="text-cs-cyan hover:underline">eccnet.eu</a>.
          EU consumer law rights are not affected by this Agreement.
        </p>
      </S>

      <S title="19. General Provisions">
        <p>
          <strong className="text-cs-text">19.1 Entire Agreement.</strong>{" "}
          This EULA, together with the Terms of Service, Privacy Policy, and Cookie Policy,
          constitutes the entire agreement between you and the Licensor regarding the Service
          and supersedes all prior and contemporaneous agreements, representations, and
          understandings.
        </p>
        <p>
          <strong className="text-cs-text">19.2 Amendments.</strong>{" "}
          The Licensor may amend this EULA at any time. Material changes will be notified
          via the dashboard or Support Server at least 14 days before taking effect. Continued
          use of the Service after the effective date constitutes acceptance.
        </p>
        <p>
          <strong className="text-cs-text">19.3 Severability.</strong>{" "}
          If any provision of this Agreement is found invalid, illegal, or unenforceable,
          the remaining provisions shall continue in full force and effect. The invalid provision
          shall be replaced with a valid provision that most closely achieves the original intent.
        </p>
        <p>
          <strong className="text-cs-text">19.4 Waiver.</strong>{" "}
          No waiver by the Licensor of any breach of this Agreement shall be deemed a waiver
          of any subsequent breach. Failure to enforce any right under this Agreement does not
          constitute a waiver of that right.
        </p>
        <p>
          <strong className="text-cs-text">19.5 Assignment.</strong>{" "}
          You may not assign, transfer, or sublicense your rights under this Agreement without
          the Licensor's prior written consent. The Licensor may assign this Agreement in
          connection with a merger, acquisition, or sale of all or substantially all of its assets.
        </p>
        <p>
          <strong className="text-cs-text">19.6 Force Majeure.</strong>{" "}
          The Licensor shall not be liable for any delay or failure to perform resulting from causes
          beyond its reasonable control, including acts of God, war, terrorism, labour disputes,
          government actions, Discord platform outages, or internet infrastructure failures.
        </p>
        <p>
          <strong className="text-cs-text">19.7 No Agency.</strong>{" "}
          Nothing in this Agreement creates a partnership, joint venture, agency, franchise, or
          employment relationship between you and the Licensor.
        </p>
        <p>
          <strong className="text-cs-text">19.8 Notices.</strong>{" "}
          All notices under this Agreement shall be in writing. Notices to the Licensor shall be
          sent to{" "}
          <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a>.
          The Licensor may send notices to you via the dashboard notification system, email
          registered with Stripe, or the Support Server.
        </p>
        <p>
          <strong className="text-cs-text">19.9 Language.</strong>{" "}
          This Agreement is drafted in English. In the event of any conflict between the English
          version and any translated version, the English version shall prevail.
        </p>
      </S>

      <S title="20. Contact">
        <p>
          For any questions about this EULA, or to report a violation, contact the Licensor:
        </p>
        <ul>
          <li>Email: <a href={`mailto:${EMAIL}`} className="text-cs-cyan hover:underline">{EMAIL}</a></li>
          <li>Support Server: <a href={SUPPORT} target="_blank" rel="noopener noreferrer" className="text-cs-cyan hover:underline">{SUPPORT}</a></li>
        </ul>
        <p className="mt-4 text-xs text-cs-muted">
          This EULA was last reviewed by the Licensor's legal team on 27 June 2026.
          It covers the {COMPANY} platform as deployed with Node.js, React, Discord.js v14,
          PostgreSQL, Redis, Stripe, and Anthropic integrations.
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
