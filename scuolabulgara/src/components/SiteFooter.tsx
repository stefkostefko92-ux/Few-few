import { t, type Dict, type Locale } from "@/lib/i18n";
import CookieSettingsLink from "./CookieSettingsLink";
import { StitchBand } from "./Stitch";

type NavItem = { id: string; label: string };

export default function SiteFooter({
  locale,
  ui,
  logo,
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
  ui: Dict;
  logo: string;
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
      <StitchBand id="footer" />
      <div className="wrap footer__grid">
        <div className="footer__brand">
          <img src={logo} alt={brandName} width={92} height={80} />
          <p>{description}</p>
        </div>
        <div>
          <h2>{t(locale, "footer.site", ui)}</h2>
          <ul>
            {nav.map((n) => (
              <li key={n.id}><a href={`/${locale}#${n.id}`}>{n.label}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <h2>{t(locale, "nav.contact", ui)}</h2>
          <ul>
            <li><a href={`tel:${phoneHref}`}>{phone}</a></li>
            <li><a href={`mailto:${email}`}>{email}</a></li>
            {facebookUrl !== "#" && <li><a href={facebookUrl} target="_blank" rel="noopener noreferrer">{t(locale, "nav.facebook", ui)}</a></li>}
            <li>{address}</li>
          </ul>
        </div>
        <div>
          <h2>{t(locale, "legal.heading", ui)}</h2>
          <ul>
            <li><a href={`/${locale}/privacy`}>{t(locale, "legal.privacy", ui)}</a></li>
            <li><a href={`/${locale}/cookie`}>{t(locale, "legal.cookie", ui)}</a></li>
            <li><a href={`/${locale}/termini`}>{t(locale, "legal.terms", ui)}</a></li>
            <CookieSettingsLink locale={locale} />
          </ul>
        </div>
      </div>

      <div className="wrap footer__bottom">
        <p>© {year} {brandName}. {t(locale, "rights", ui)}</p>
        <p className="footer__credit">
          <span className="footer__flag" aria-hidden="true"><i /><i /><i /></span>
          {t(locale, "credit") /* agency attribution — deliberately not editable */}{" "}
          <a href="https://carbonstealth.eu" target="_blank" rel="noopener noreferrer">Carbon Stealth VCC</a>
        </p>
        <p className="footer__photo">
          {t(locale, "photoCredit") /* CC BY-SA requires it — deliberately not editable */}{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Bulgarian_Rosa_damascena.JPG" target="_blank" rel="noopener noreferrer">Edal Anton Lefterov</a>,{" "}
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>, Wikimedia Commons.
        </p>
      </div>
    </footer>
  );
}
