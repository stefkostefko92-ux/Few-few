// frontend/src/pages/AccessibilityPage.jsx
// Accessibility Statement — required by the EU European Accessibility Act
// (Directive 2019/882, in force 28 June 2025) and EN 301 549 / WCAG 2.1 AA.
import Seo from "../components/Seo";

export default function AccessibilityPage() {
  const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
  const EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "legal@carbonstealth.eu";

  return (
    <div className="min-h-screen bg-dark-300 text-gray-300" role="main" id="main-content">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-2">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-300 transition-colors">← Back to home</a>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 mt-4">Accessibility Statement</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: 23 June 2026</p>

        <Seo
          title="Accessibility Statement — Supreme Bot"
          description="Accessibility Statement for Supreme Bot: our commitment to WCAG 2.1 AA / EN 301 549 conformance, known limitations, and how to report accessibility issues."
          path="/accessibility"
        />

        <div className="space-y-8">
          <Section title="Our commitment">
            <p>
              {COMPANY} is committed to making Supreme Bot accessible to the widest
              possible audience, regardless of ability or technology. We aim to
              conform to the <strong>Web Content Accessibility Guidelines (WCAG) 2.1
              Level AA</strong> and the European standard <strong>EN 301 549</strong>,
              as required by the European Accessibility Act (Directive 2019/882).
            </p>
          </Section>

          <Section title="Conformance status">
            <p>
              Supreme Bot is <strong>partially conformant</strong> with WCAG 2.1 Level
              AA. "Partially conformant" means that some parts of the content do not
              yet fully meet the standard; we are actively remediating the remaining
              items. The dashboard, marketing site, and legal pages are tested with
              keyboard-only navigation, screen readers, and automated tooling.
            </p>
          </Section>

          <Section title="Measures we take">
            <ul>
              <li>Accessibility is included in our design and development review process.</li>
              <li>Colour contrast targets WCAG AA ratios across the dark theme.</li>
              <li>Interactive elements are keyboard operable with visible focus indicators.</li>
              <li>Motion respects the operating-system "reduce motion" preference.</li>
              <li>Pages provide semantic landmarks, headings, and form labels.</li>
            </ul>
          </Section>

          <Section title="Known limitations">
            <p>Despite our efforts, some limitations may remain. We are working to resolve:</p>
            <ul>
              <li>Some complex data tables and charts may not yet expose full text alternatives.</li>
              <li>A small number of legacy dialogs are being migrated to a fully accessible pattern.</li>
            </ul>
            <p>If you encounter a barrier not listed here, please tell us — see below.</p>
          </Section>

          <Section title="Feedback and contact">
            <p>
              We welcome your feedback on the accessibility of Supreme Bot. If you
              experience difficulty accessing any part of the service, contact us and
              we will work with you to provide the information or service you need:
            </p>
            <ul>
              <li>Email: <a className="text-cs-cyan underline" href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
              <li>We aim to respond within <strong>5 business days</strong>.</li>
            </ul>
            <p>
              If you are not satisfied with our response, you may contact the relevant
              national enforcement body for the European Accessibility Act in your
              EU member state.
            </p>
          </Section>

          <Section title="Preparation of this statement">
            <p>
              This statement was prepared on 23 June 2026. It is reviewed when the
              service changes materially and at least annually. The assessment was
              carried out by {COMPANY} through internal self-evaluation combined with
              automated and manual testing.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      <div className="text-sm text-gray-400 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ul]:my-2">
        {children}
      </div>
    </section>
  );
}
