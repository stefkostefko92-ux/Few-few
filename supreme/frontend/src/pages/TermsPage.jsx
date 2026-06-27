// frontend/src/pages/TermsPage.jsx
import Seo from "../components/Seo";

export default function TermsPage() {
  const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/support";
  const COMPANY    = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
  const EMAIL      = import.meta.env.VITE_CONTACT_EMAIL || "legal@carbonstealth.eu";
  const COUNTRY    = import.meta.env.VITE_COMPANY_COUNTRY || "Bulgaria";

  return (
    <LegalPage title="Terms of Service" updated="1 January 2025">
      <Seo
        title="Terms of Service — Supreme Bot"
        description="Terms of Service for Supreme Bot, the multi-tenant Discord bot SaaS platform by Carbon Stealth VCC."
        path="/terms"
      />
      <S title="1. Parties and Scope">
        <p>
          These Terms of Service ("Terms") constitute a legally binding agreement between{" "}
          <strong>{COMPANY}</strong> ("we", "us", "our"), a company registered in{" "}
          {COUNTRY}, and you ("User", "you"), the individual or legal entity accessing or
          using the Supreme Bot platform ("Service").
        </p>
        <p>
          By authenticating via Discord OAuth2 or by accessing any part of the Service, you
          confirm that you have read, understood, and agree to be bound by these Terms. If you
          are acting on behalf of an organisation, you represent that you have authority to bind
          that organisation.
        </p>
        <p>
          If you do not agree to these Terms, you must immediately cease using the Service.
        </p>
      </S>

      <S title="2. Eligibility">
        <p>You may use the Service only if:</p>
        <ul>
          <li>You are at least 13 years of age, or such higher minimum age as required by Discord's Terms of Service or the law of your jurisdiction;</li>
          <li>You are not prohibited from using the Service under applicable law;</li>
          <li>You have not previously been suspended or removed from the Service; and</li>
          <li>Your use complies with all applicable laws and regulations, including Discord's Terms of Service and Community Guidelines.</li>
        </ul>
        <p>
          Users in the European Economic Area (EEA) under the age of 16 (or such lower age as
          permitted by their member state under Article 8 of the GDPR) must have parental or
          guardian consent to use the Service.
        </p>
      </S>

      <S title="3. Description of Service">
        <p>
          Supreme Bot is a Software-as-a-Service (SaaS) platform that provides Discord server
          administrators with tools to manage support tickets, application forms, moderation
          workflows, and related bot automations. The Service is provided "as is" and consists of:
        </p>
        <ul>
          <li>A web dashboard for configuration and management;</li>
          <li>A Discord bot that operates within your Discord server(s);</li>
          <li>An API backend processing requests and storing data.</li>
        </ul>
        <p>
          The Free Tier and Premium Tier features are described on the{" "}
          <a href="/pricing" className="text-discord-400 hover:underline">Pricing page</a>.
          Feature availability may change with reasonable prior notice.
        </p>
      </S>

      <S title="4. Account and Authentication">
        <p>
          Access to the Service is granted exclusively via Discord OAuth2 authentication. You are
          responsible for:
        </p>
        <ul>
          <li>Maintaining the security and confidentiality of your Discord account;</li>
          <li>All activities that occur under your account or Discord identity;</li>
          <li>Notifying us immediately if you become aware of any unauthorised use.</li>
        </ul>
        <p>
          We are not liable for any loss or damage resulting from your failure to protect your
          Discord credentials. Each Discord account may only be associated with one Supreme Bot account.
        </p>
      </S>

      <S title="5. Subscriptions and Billing">
        <p><strong>5.1 Free Tier.</strong> The Service is available without charge subject to the
        feature limitations described on the Pricing page. No credit card is required for the Free Tier.</p>

        <p><strong>5.2 Premium Subscription.</strong> Premium features are available via a recurring
        monthly subscription. By subscribing, you:</p>
        <ul>
          <li>Authorise us and our payment processor (Stripe, Inc.) to charge your designated payment method on a recurring monthly basis;</li>
          <li>Acknowledge that billing will continue until you cancel;</li>
          <li>Accept that prices may change with at least 30 days' prior notice.</li>
        </ul>

        <p><strong>5.3 Free Trial.</strong> New Premium subscriptions may include a 14-day free
        trial. You will not be charged during the trial period. If you cancel before the trial
        ends, you will not be charged. If you do not cancel, your subscription will automatically
        convert to a paid subscription at the end of the trial period and your payment method
        will be charged.</p>

        <p><strong>5.4 Cancellation.</strong> You may cancel your subscription at any time via
        the Billing Portal accessible from the Premium page. Cancellation takes effect at the
        end of the current billing period. You retain Premium access until that date. We do not
        offer pro-rated refunds for partial billing periods unless required by applicable law.</p>

        <p><strong>5.5 Payment Failures.</strong> If a payment fails, we will attempt to collect
        payment according to Stripe's retry schedule. If payment cannot be collected, your
        subscription will be downgraded to the Free Tier and Premium features will become
        unavailable. Data is retained for 30 days following downgrade to allow resubscription.</p>

        <p><strong>5.6 Taxes.</strong> Prices may be subject to applicable taxes (including VAT
        for EU residents). You are responsible for all applicable taxes. Where required by law,
        we will add VAT to your invoice.</p>
      </S>

      <S title="6. Refund Policy">
        <p>
          We offer a <strong>7-day money-back guarantee</strong> for your first subscription
          payment. To request a refund, contact us via the Support Server within 7 calendar days
          of the first successful charge. Refunds are processed to the original payment method
          within 5–10 business days.
        </p>
        <p>
          Refunds are not available for: subsequent billing periods, trials that have converted
          to paid subscriptions where more than 7 days have elapsed, or accounts terminated for
          violations of these Terms.
        </p>
        <p>
          EU/EEA consumers have statutory withdrawal rights under Directive 2011/83/EU. By
          accessing Premium features immediately after purchase, you expressly acknowledge that
          the 14-day statutory withdrawal right does not apply once the digital service has
          begun, in accordance with Article 16(m) of that Directive.
        </p>
      </S>

      <S title="7. Acceptable Use">
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate any applicable local, national, or international law or regulation;</li>
          <li>Violate Discord's Terms of Service or Community Guidelines;</li>
          <li>Harass, abuse, threaten, or discriminate against any person;</li>
          <li>Distribute spam, phishing content, malware, or other harmful code;</li>
          <li>Collect or harvest personal data of other users without their consent;</li>
          <li>Attempt to gain unauthorised access to any part of the Service, other accounts, or infrastructure;</li>
          <li>Use the Service to process or store data for which you do not have legal authority;</li>
          <li>Circumvent technical measures, including rate limits or access controls;</li>
          <li>Resell, sublicense, or commercially exploit the Service without our written consent;</li>
          <li>Use the Service in any manner that could overload, damage, or impair its operation.</li>
        </ul>
        <p>
          We reserve the right to investigate suspected violations and to suspend or terminate
          access at our sole discretion.
        </p>
      </S>

      <S title="8. Data Controller and Data Processing">
        <p>
          As the operator of the Service, we act as a <strong>data controller</strong> for the
          personal data of dashboard users (server administrators). For data entered into your
          Discord server via the bot (e.g., ticket messages, application answers submitted by
          your server members), you act as the data controller and we act as a{" "}
          <strong>data processor</strong> on your behalf.
        </p>
        <p>
          By using the Service, you agree to our{" "}
          <a href="/privacy" className="text-discord-400 hover:underline">Privacy Policy</a>{" "}
          and{" "}
          <a href="/cookies" className="text-discord-400 hover:underline">Cookie Policy</a>.
          If you are a data controller processing data of EU/EEA data subjects via our Service,
          you are responsible for ensuring you have a lawful basis for that processing and for
          complying with the GDPR. Upon request, we will provide a Data Processing Agreement (DPA).
        </p>
      </S>

      <S title="9. Intellectual Property">
        <p>
          The Service, including its software, design, text, graphics, and all other content
          (excluding User Content), is owned by or licensed to us and is protected by copyright,
          trade mark, and other intellectual property laws.
        </p>
        <p>
          We grant you a limited, non-exclusive, non-transferable, revocable licence to access
          and use the Service solely for its intended purpose and subject to these Terms.
        </p>
        <p>
          <strong>User Content.</strong> You retain all rights to data you upload, create, or
          configure within the Service ("User Content"). By using the Service, you grant us a
          limited licence to store, process, and display User Content solely as necessary to
          provide the Service.
        </p>
      </S>

      <S title="10. Availability and Modifications">
        <p>
          We strive for high availability but do not guarantee uninterrupted, error-free access.
          The Service is provided on an <em>"as is"</em> and <em>"as available"</em> basis.
        </p>
        <p>
          We may modify, suspend, or discontinue any part of the Service at any time. For
          material changes that adversely affect Free Tier users, we will provide at least
          14 days' notice. For Premium subscribers, we will provide at least 30 days' notice
          of material service changes.
        </p>
        <p>
          Planned maintenance windows will be communicated via the Support Server where practicable.
        </p>
      </S>

      <S title="11. Disclaimer of Warranties">
        <p>
          To the fullest extent permitted by applicable law, the Service is provided without
          warranties of any kind, express or implied, including but not limited to warranties
          of merchantability, fitness for a particular purpose, and non-infringement.
        </p>
        <p>
          We do not warrant that the Service will be uninterrupted, secure, or free of errors,
          that defects will be corrected, or that the Service or the servers are free of viruses
          or harmful components.
        </p>
        <p>
          Nothing in these Terms limits any non-excludable statutory guarantees that apply
          in your jurisdiction.
        </p>
      </S>

      <S title="12. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, we shall not be liable to you for:
        </p>
        <ul>
          <li>Any indirect, incidental, special, consequential, or punitive damages;</li>
          <li>Loss of profits, revenue, data, goodwill, or business opportunities;</li>
          <li>Damages arising from unauthorised access to or alteration of your data;</li>
          <li>Conduct of third parties, including Discord.</li>
        </ul>
        <p>
          Our total cumulative liability to you for all claims arising out of or relating to the
          Service shall not exceed the greater of: (a) the total amount you paid us in the
          12 months immediately preceding the event giving rise to the claim, or (b) EUR 50.
        </p>
        <p>
          Nothing in these Terms excludes or limits our liability for: death or personal injury
          caused by negligence; fraud or fraudulent misrepresentation; or any other liability
          that cannot be excluded or limited under applicable law.
        </p>
      </S>

      <S title="13. Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless us and our officers, directors,
          employees, and agents from and against any claims, liabilities, damages, losses, and
          expenses (including reasonable legal fees) arising out of or in any way connected with:
          (a) your use of the Service; (b) your violation of these Terms; (c) your violation of
          any third-party rights; or (d) any content you submit or transmit through the Service.
        </p>
      </S>

      <S title="14. Termination">
        <p>
          <strong>By you:</strong> You may stop using the Service at any time. To delete your
          account data, contact us via the Support Server.
        </p>
        <p>
          <strong>By us:</strong> We may suspend or terminate your access immediately and without
          prior notice if: (a) you breach these Terms; (b) we are required to do so by law; or
          (c) we reasonably believe continued access poses a risk to the Service, other users,
          or third parties.
        </p>
        <p>
          Upon termination, your licence to use the Service ceases immediately. Sections 9, 11,
          12, 13, and 15 survive termination.
        </p>
      </S>

      <S title="15. Governing Law and Dispute Resolution">
        <p>
          These Terms are governed by and construed in accordance with the laws of {COUNTRY},
          without regard to its conflict of law provisions.
        </p>
        <p>
          Any dispute arising out of or in connection with these Terms shall first be attempted
          to be resolved amicably by contacting us. If resolution cannot be reached within
          30 days, disputes shall be subject to the exclusive jurisdiction of the courts of{" "}
          {COUNTRY}.
        </p>
        <p>
          If you are a consumer in the EU, you may also use alternative dispute resolution (ADR).
          The European Commission's Online Dispute Resolution (ODR) platform was discontinued on
          20 July 2025 and is no longer available. Consumers in Bulgaria may contact the
          conciliation commissions of the Commission for Consumer Protection (КЗП); consumers
          elsewhere in the EU may use the European Consumer Centres Network (ECC-Net) at{" "}
          <a href="https://www.eccnet.eu/" target="_blank" rel="noopener noreferrer"
            className="text-discord-400 hover:underline">
            eccnet.eu
          </a>.
        </p>
      </S>

      <S title="16. Changes to These Terms">
        <p>
          We may update these Terms at any time. We will notify you of material changes by
          posting a notice on the dashboard or via the Support Server at least 14 days before
          the changes take effect. Continued use after that date constitutes acceptance of the
          revised Terms.
        </p>
        <p>
          If you do not agree to the revised Terms, you must cease using the Service before
          the effective date.
        </p>
      </S>

      <S title="17. Miscellaneous">
        <p>
          <strong>Entire Agreement.</strong> These Terms, together with the Privacy Policy and
          Cookie Policy, constitute the entire agreement between you and us regarding the Service.
        </p>
        <p>
          <strong>Severability.</strong> If any provision is found invalid or unenforceable,
          the remaining provisions continue in full force and effect.
        </p>
        <p>
          <strong>No Waiver.</strong> Our failure to enforce any right or provision does not
          constitute a waiver of that right.
        </p>
        <p>
          <strong>Assignment.</strong> You may not assign or transfer these Terms without our
          prior written consent. We may assign our rights and obligations without restriction.
        </p>
      </S>

      <S title="18. Contact">
        <p>
          For questions, complaints, or requests regarding these Terms, contact us at{" "}
          <a href={`mailto:${EMAIL}`} className="text-discord-400 hover:underline">{EMAIL}</a>{" "}
          or via our{" "}
          <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer"
            className="text-discord-400 hover:underline">Support Server</a>.
        </p>
      </S>
    </LegalPage>
  );
}

function LegalPage({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-dark-300 text-gray-300" role="main" id="main-content">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-2">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-300 transition-colors">← Back to home</a>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 mt-4">{title}</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: {updated}</p>
        <div className="space-y-0">{children}</div>
      </div>
    </div>
  );
}

function S({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-white mb-3 mt-6">{title}</h2>
      <div className="text-sm text-gray-400 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ul]:my-2 [&_ul]:text-gray-400">
        {children}
      </div>
    </section>
  );
}
