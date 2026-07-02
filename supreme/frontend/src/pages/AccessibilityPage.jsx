// frontend/src/pages/AccessibilityPage.jsx
// Accessibility Statement — required by the EU European Accessibility Act
// (Directive 2019/882, in force 28 June 2025) and EN 301 549 / WCAG 2.1 AA.
import Seo from "../components/Seo";

export default function AccessibilityPage() {
  const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
  const EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "legal@carbonstealth.eu";

  return (
    <div className="min-h-screen bg-cs-bg text-cs-text" role="main" id="main-content">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-2">
          <a href="/" className="text-sm text-cs-muted hover:text-cs-text transition-colors">← Back to home</a>
        </div>
        <h1 className="text-3xl font-bold text-cs-text mb-2 mt-4">Accessibility Statement</h1>
        <p className="text-cs-muted text-sm mb-12">Last updated: 23 June 2026</p>

        <Seo
          title="Accessibility Statement — Supreme Bot"
          description="Accessibility Statement for Supreme Bot: our commitment to WCAG 2.1 AA / EN 301 549 conformance, known limitations, and how to report accessibility issues."
          path="/accessibility"
        />

        <div className="space-y-8">
          <Section title="Our commitment">
            <p>
              {COMPANY} is committed to making Supreme Bot accessible to the widest
              possible audience, regardless of ability or technology. We conform to the{" "}
              <strong>Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong> and
              the European standard <strong>EN 301 549 (V3.2.1)</strong> as required by the European
              Accessibility Act (Directive 2019/882), and we are progressively adopting the
              newer <strong>WCAG 2.2 Level AA</strong> success criteria.
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
            <p>
              Despite our efforts, the following non-conformances are known. We are working
              to resolve them, and each is referenced to the WCAG success criterion it affects:
            </p>
            <ul>
              <li>
                Some analytics charts and complex data tables do not yet expose full text
                alternatives or programmatic relationships (WCAG <strong>1.1.1 Non-text Content</strong>,{" "}
                <strong>1.3.1 Info and Relationships</strong>).
              </li>
              <li>
                A small number of legacy dialogs are still being migrated to our fully accessible
                dialog pattern, so focus management may be imperfect in those views
                (WCAG <strong>2.4.3 Focus Order</strong>, <strong>4.1.2 Name, Role, Value</strong>).
              </li>
              <li>
                Some third-party embedded content (e.g. Discord widgets) is outside our direct
                control and may not fully meet AA.
              </li>
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
              If you are not satisfied with our response, you may contact the relevant national
              enforcement body for the European Accessibility Act. In Bulgaria this is the
              Commission for Consumer Protection (Комисия за защита на потребителите); in other
              EU member states, your national market-surveillance authority for the Act.
            </p>
          </Section>

          <Section title="Preparation of this statement">
            <p>
              This statement was prepared on 23 June 2026 and last reviewed on 27 June 2026.
              It is reviewed when the service changes materially and at least annually. The
              assessment was carried out by {COMPANY} through internal self-evaluation using a
              combination of <strong>automated testing</strong> (axe-core across all public
              routes, returning zero violations on the marketing and legal pages),{" "}
              <strong>manual keyboard-only navigation</strong>, and <strong>screen-reader
              checks</strong>, evaluated against WCAG 2.1 Level AA (with WCAG 2.2 AA criteria
              progressively included).
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
      <h2 className="text-base font-semibold text-cs-text mb-3">{title}</h2>
      <div className="text-sm text-cs-muted leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ul]:my-2">
        {children}
      </div>
    </section>
  );
}
