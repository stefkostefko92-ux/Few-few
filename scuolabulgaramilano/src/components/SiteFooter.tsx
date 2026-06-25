import { t, type Locale } from "@/lib/i18n";

type NavItem = { id: string; label: string };

export default function SiteFooter({
  locale,
  brandName,
  description,
  phone,
  phoneHref,
  email,
  address,
  facebookUrl,
  nav,
}: {
  locale: Locale;
  brandName: string;
  description: string;
  phone: string;
  phoneHref: string;
  email: string;
  address: string;
  facebookUrl: string;
  nav: NavItem[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="ribbon ribbon--lg" role="presentation" aria-hidden="true" style={{ marginBottom: "clamp(2rem,5vw,3.5rem)" }} />
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <img src="/assets/img/brand/logo.webp" alt={brandName} />
            <p>{description}</p>
          </div>
          <div>
            <h4>{t(locale, "nav.about")}</h4>
            <ul>
              {nav.slice(0, 4).map((n) => (
                <li key={n.id}><a href={`/${locale}#${n.id}`}>{n.label}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>{t(locale, "nav.contact")}</h4>
            <ul>
              <li><a href={`tel:${phoneHref}`}>{phone}</a></li>
              <li><a href={`mailto:${email}`}>{email}</a></li>
              <li><a href={facebookUrl} target="_blank" rel="noopener">Facebook</a></li>
            </ul>
          </div>
          <div>
            <h4>{t(locale, "legal.heading")}</h4>
            <ul>
              <li><a href={`/${locale}/privacy`}>{t(locale, "legal.privacy")}</a></li>
              <li><a href={`/${locale}/cookie`}>{t(locale, "legal.cookie")}</a></li>
              <li><a href={`/${locale}/termini`}>{t(locale, "legal.terms")}</a></li>
            </ul>
            <h4 style={{ marginTop: "1.4rem" }}>{t(locale, "addr")}</h4>
            <ul><li>{address}</li></ul>
          </div>
        </div>

        <div className="footer__bottom">
          <span>© {year} Centro linguistico e culturale Qui Bulgaria. {t(locale, "rights")}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
            <span className="footer__flag" aria-hidden="true"><i style={{ background: "#fff" }} /><i style={{ background: "#00966e" }} /><i style={{ background: "#d62612" }} /></span>
            {t(locale, "credit")} <a href="https://carbonstealth.eu" target="_blank" rel="noopener" style={{ color: "var(--lime-400)", fontWeight: 600 }}>Carbon Stealth VCC</a>
          </span>
        </div>
        <p className="footer__credit-photo">
          {t(locale, "photoCredit")}{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Bulgarian_Rosa_damascena.JPG" target="_blank" rel="noopener noreferrer">Edal Anton Lefterov</a>,{" "}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a> · Wikimedia Commons.
        </p>
      </div>
    </footer>
  );
}
