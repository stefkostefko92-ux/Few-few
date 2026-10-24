import { loadSite } from "@/lib/content";
import { t, type Locale } from "@/lib/i18n";
import { safeHref, safeImage } from "@/lib/cms";
import { buildNav } from "@/lib/nav";
import type { LegalKind } from "@/lib/legal";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default async function LegalPage({ locale, kind }: { locale: Locale; kind: LegalKind }) {
  const site = await loadSite(locale);
  const tt = (k: string) => t(locale, k, site.ui);
  const settings = site.get("settings");
  const about = site.get("about");
  // Editable in the admin; falls back to the built-in text in legal.ts.
  const doc = site.get(`legal_${kind}`);
  const logo = safeImage(settings.logo, "/assets/img/brand/logo.webp");
  const nav = buildNav(locale, site.ui, site.sections);

  return (
    <>
      <a className="skip-link" href="#main">{tt("skip")}</a>
      <SiteHeader locale={locale} brandName={settings.brandName} brandSub={settings.brandSub} logo={logo} nav={nav} />

      <main id="main" className="legal">
        <div className="wrap legal__grid">
          <header className="legal__head">
            <h1>{doc.title}</h1>
            <p className="lead">{doc.intro}</p>
            {doc.updated && <p className="legal__updated">{tt("updated")}: {doc.updated}</p>}
          </header>

          <div className="legal__body">
            {doc.sections.map((s, i) => (
              <section key={i}>
                <h2>{s.h}</h2>
                {s.p.filter(Boolean).map((para, j) => <p key={j}>{para}</p>)}
                {s.list.filter(Boolean).length > 0 && (
                  <ul className="stitch-list">
                    {s.list.filter(Boolean).map((li, j) => <li key={j}>{li}</li>)}
                  </ul>
                )}
              </section>
            ))}
            <a className="textlink" href={`/${locale}`}>{tt("backHome")}</a>
          </div>
        </div>
      </main>

      <SiteFooter
        locale={locale}
        ui={site.ui}
        logo={logo}
        brandName={settings.brandName}
        description={about.lead || ""}
        phone={settings.phone}
        phoneHref={settings.phoneHref}
        email={settings.email}
        address={settings.address}
        facebookUrl={safeHref(settings.facebookUrl)}
        nav={nav}
      />
    </>
  );
}
