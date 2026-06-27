// frontend/src/pages/CookiesPage.jsx
import Seo from "../components/Seo";

export default function CookiesPage() {
  const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || "https://discord.gg/support";
  const COMPANY    = import.meta.env.VITE_COMPANY_NAME || "Carbon Stealth VCC";
  const EMAIL      = import.meta.env.VITE_CONTACT_EMAIL || "legal@carbonstealth.eu";

  return (
    <LegalPage title="Cookie Policy" updated="1 January 2025">
      <Seo
        title="Cookie Policy — Supreme Bot"
        description="Cookie Policy for Supreme Bot: a single strictly-necessary session cookie, no advertising or tracking cookies."
        path="/cookies"
      />

      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-8 text-sm text-gray-300">
        <strong className="text-white">Short version:</strong> We use exactly <strong>one cookie</strong>,
        which is strictly necessary for login to work. We do not use advertising cookies, tracking
        cookies, or analytics cookies. We show a consent banner and remember your choice in your
        browser's local storage (a single strictly-necessary entry) so we don't ask again.
      </div>

      <S title="1. What Is a Cookie?">
        <p>
          A cookie is a small text file placed on your device by a website when you visit it.
          Cookies allow websites to recognise your device, maintain your login state, and
          remember your preferences. Cookies are governed by the EU ePrivacy Directive
          (2002/58/EC, as amended by 2009/136/EC) and, where personal data is involved,
          also by the GDPR.
        </p>
      </S>

      <S title="2. Cookies We Use">
        <p>
          {COMPANY} uses <strong>one first-party cookie</strong>. We do not use any third-party
          cookies, advertising cookies, analytics cookies, or tracking pixels.
        </p>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Provider</Th>
                <Th>Purpose</Th>
                <Th>Duration</Th>
                <Th>Legal basis</Th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              <Tr>
                <Td><code className="bg-dark-100 px-1 rounded">sid</code></Td>
                <Td>Strictly necessary, HTTP-only, Secure</Td>
                <Td>{COMPANY} (first-party)</Td>
                <Td>
                  Maintains your authenticated session. Contains only an opaque session
                  identifier — no personal data is stored in the cookie itself. Without this
                  cookie, you cannot remain logged in between page loads.
                </Td>
                <Td>7 days from last login (sliding)</Td>
                <Td>
                  Art. 6(1)(b) GDPR — necessary for contract performance (providing the
                  authenticated service). No consent required under ePrivacy Directive
                  Recital 25 (strictly necessary exemption).
                </Td>
              </Tr>
            </tbody>
          </table>
        </div>

        <p className="mt-4">
          <strong>Cookie attributes applied:</strong>
        </p>
        <ul>
          <li><strong>HttpOnly</strong> — The cookie cannot be accessed by JavaScript, protecting against XSS attacks;</li>
          <li><strong>Secure</strong> — The cookie is only transmitted over HTTPS connections;</li>
          <li><strong>SameSite=Strict</strong> (production) — The cookie is not sent with cross-site requests, mitigating CSRF attacks;</li>
          <li><strong>Path=/</strong> — The cookie is scoped to the entire domain.</li>
        </ul>
      </S>

      <S title="3. Cookie Consent Banner">
        <p>
          Under the EU ePrivacy Directive (Recital 25), cookies that are <em>strictly necessary</em>{" "}
          for a service explicitly requested by the user are exempt from the consent requirement.
          Our session cookie falls within this exemption because you explicitly request to log in,
          the cookie is essential for login to work, it contains no personal data in itself, and it
          is never used for tracking, profiling, or advertising.
        </p>
        <p>
          Even though our single session cookie is exempt, we still display a{" "}
          <strong>cookie consent banner</strong> on first visit. The banner lets you accept or
          reject any future non-essential categories (analytics and marketing, both currently
          unused and switched off by default). Essential cookies cannot be switched off because
          the service cannot function without them. Both "Accept all" and "Reject non-essential"
          are offered with equal prominence — there is no pre-ticked box and no cookie wall.
        </p>
        <p>
          Your choice is stored in your browser's <strong>local storage</strong> under the key{" "}
          <code className="bg-dark-100 px-1 rounded text-xs">supreme-bot-cookie-consent</code> so
          that we do not ask again on every visit. This entry is itself strictly necessary (it
          records your consent decision), stays on your device, is never transmitted to our
          servers, and reappears if we materially change this policy.
        </p>
      </S>

      <S title="4. Third-Party Scripts and Resources">
        <p>
          The Service does not load any third-party JavaScript analytics (e.g., Google Analytics,
          Meta Pixel, Hotjar). The following external resources are loaded by the Service:
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <Th>Resource</Th>
                <Th>Provider</Th>
                <Th>Purpose</Th>
                <Th>Cookies set?</Th>
              </tr>
            </thead>
            <tbody className="text-gray-400">
              <Tr>
                <Td>Discord CDN (avatar images)</Td>
                <Td>Discord, Inc.</Td>
                <Td>Serve user and server avatar images</Td>
                <Td>No</Td>
              </Tr>
              <Tr>
                <Td>Sentry SDK (optional)</Td>
                <Td>Functional Software, Inc.</Td>
                <Td>Error reporting (if SENTRY_DSN is configured)</Td>
                <Td>No cookies; uses session storage only</Td>
              </Tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          Discord CDN requests are made by your browser when loading avatar images. These
          requests are subject to Discord's Privacy Policy. However, no cookies are set by
          the CDN for this purpose.
        </p>
      </S>

      <S title="5. Local and Session Storage (Not Cookies)">
        <p>
          In addition to cookies, modern browsers provide other local storage mechanisms.
          We may use browser <strong>session storage</strong> (not cookies) solely for
          temporary UI state (e.g., which tab is active in the dashboard). Session storage
          data is deleted automatically when you close the browser tab. It contains no
          personal data and is never transmitted to our servers.
        </p>
        <p>
          We use <strong>localStorage</strong> (persistent browser storage) for exactly one
          strictly-necessary purpose: the key{" "}
          <code className="bg-dark-100 px-1 rounded text-xs">supreme-bot-cookie-consent</code>{" "}
          described in section 3, which records your cookie-consent choice so the banner is not
          shown on every visit. It stores only your consent decision, a version number, and a
          timestamp — no personal data — and is never sent to our servers. We do not use
          localStorage for analytics, advertising, or tracking.
        </p>
      </S>

      <S title="6. How to Control and Delete Cookies">
        <p>
          You can control cookies through your browser settings. Note that deleting the
          session cookie (<code className="bg-dark-100 px-1 rounded text-xs">sid</code>) will
          log you out of the Service.
        </p>
        <p>Browser cookie management guides:</p>
        <ul>
          <li>
            <a href="https://support.google.com/chrome/answer/95647" target="_blank"
              rel="noopener noreferrer" className="text-discord-400 hover:underline">
              Google Chrome
            </a>
          </li>
          <li>
            <a href="https://support.mozilla.org/kb/enhanced-tracking-protection-firefox-desktop"
              target="_blank" rel="noopener noreferrer" className="text-discord-400 hover:underline">
              Mozilla Firefox
            </a>
          </li>
          <li>
            <a href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac"
              target="_blank" rel="noopener noreferrer" className="text-discord-400 hover:underline">
              Safari (macOS)
            </a>
          </li>
          <li>
            <a href="https://support.microsoft.com/en-us/windows/delete-and-manage-cookies"
              target="_blank" rel="noopener noreferrer" className="text-discord-400 hover:underline">
              Microsoft Edge
            </a>
          </li>
        </ul>
        <p>
          Disabling cookies entirely will prevent you from logging in to the Service, as the
          session cookie is required for authentication.
        </p>
      </S>

      <S title="7. Do Not Track (DNT)">
        <p>
          Some browsers send a "Do Not Track" (DNT) signal. Because we do not track users
          across websites and do not use advertising cookies, our behaviour does not change
          based on DNT signals. We do not track you regardless.
        </p>
      </S>

      <S title="8. Changes to This Cookie Policy">
        <p>
          We may update this Cookie Policy if we introduce new technologies or change how we
          use existing ones. If we add any non-essential cookies, we will update this policy
          and, where required, obtain your consent before placing them. The "Last updated"
          date reflects the most recent revision.
        </p>
      </S>

      <S title="9. Contact">
        <p>
          For questions about our use of cookies, contact us at{" "}
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
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-2">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-300 transition-colors">← Back to home</a>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2 mt-4">{title}</h1>
        <p className="text-gray-400 text-sm mb-12">Last updated: {updated}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

function S({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-white mb-3 pb-1 border-b border-white/5">{title}</h2>
      <div className="text-sm text-gray-400 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1 [&_ul]:my-2 [&_ul]:text-gray-400">
        {children}
      </div>
    </section>
  );
}
function Th({ children }) {
  return <th className="text-left py-2 px-3 text-gray-400 font-semibold border-b border-white/5">{children}</th>;
}
function Td({ children }) {
  return <td className="py-2 px-3 border-b border-white/5 align-top">{children}</td>;
}
function Tr({ children }) {
  return <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>;
}
