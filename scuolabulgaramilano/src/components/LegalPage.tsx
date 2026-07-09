import { getOne } from "@/lib/content";
import { t, type Locale } from "@/lib/i18n";
import { LEGAL, LEGAL_UPDATED, type LegalKind } from "@/lib/legal";
import type { Settings } from "@/lib/content";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default async function LegalPage({ locale, kind }: { locale: Locale; kind: LegalKind }) {
  const settings = (await getOne(locale, "settings")) as unknown as Settings;
  const about = (await getOne(locale, "about")) as { lead?: string };
  const doc = LEGAL[kind][locale];

  const nav = [
    { id: "chi-siamo", label: t(locale, "nav.about") },
    { id: "scuola", label: t(locale, "nav.school") },
    { id: "corsi", label: t(locale, "nav.courses") },
    { id: "danza", label: t(locale, "nav.dance") },
    { id: "facebook", label: t(locale, "nav.facebook") },
    { id: "contatti", label: t(locale, "nav.contact") },
  ];

  return (
    <>
      <SiteHeader locale={locale} brandName={settings.brandName} brandSub={settings.brandSub} nav={nav} />

      <main id="main" className="section legal">
        <div className="container">
          <div className="legal__head">
            <span className="eyebrow">{t(locale, "legal.heading")}</span>
            <h1>{doc.title}</h1>
            <p className="lead">{doc.intro}</p>
            <p className="updated">{t(locale, "updated")}: {LEGAL_UPDATED}</p>
          </div>

          <div className="legal__body">
            {doc.sections.map((s, i) => (
              <section key={i}>
                <h2>{s.h}</h2>
                {s.p?.map((para, j) => <p key={j}>{para}</p>)}
                {s.list && (
                  <ul className="legal-list">
                    {s.list.map((li, j) => <li key={j}>{li}</li>)}
                  </ul>
                )}
              </section>
            ))}
            <a className="legal__back" href={`/${locale}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5m6-6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {t(locale, "backHome")}
            </a>
          </div>
        </div>
      </main>

      <SiteFooter
        locale={locale}
        brandName={settings.brandName}
        description={about.lead || ""}
        phone={settings.phone}
        phoneHref={settings.phoneHref}
        email={settings.email}
        address={settings.address}
        facebookUrl={settings.facebookUrl}
        nav={nav}
      />
    </>
  );
}
