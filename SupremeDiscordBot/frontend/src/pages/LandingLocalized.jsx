// frontend/src/pages/LandingLocalized.jsx
// /bg, /de, /es, /fr, /it, /nl, /pl — преведеният лендинг. От редизайна
// (25.09.2026) оформлението е общо с английския (site/Landing.jsx); тук остават
// SEO главата на езика и JSON-LD (WebPage + FAQPage) от превода.
import { useMemo } from "react";
import Seo, { SITE, landingPath } from "../components/Seo";
import Landing from "../site/Landing";
import { LANDING_TRANSLATIONS } from "../i18n/landing";
import { SITE_STRINGS } from "../i18n/siteStrings";

export default function LandingLocalized({ locale }) {
  const t = LANDING_TRANSLATIONS[locale];

  const jsonLd = useMemo(() => t && ({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${SITE}${landingPath(locale)}#webpage`,
        url: `${SITE}${landingPath(locale)}`,
        name: t.title,
        description: t.description,
        inLanguage: locale,
        isPartOf: { "@id": `${SITE}/#website` },
        about: { "@id": `${SITE}/#software` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}${landingPath(locale)}#faq`,
        inLanguage: locale,
        mainEntity: t.faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  }), [locale]);

  if (!t) return null;

  return (
    <>
      <Seo title={t.title} description={t.description} path={landingPath(locale)} lang={locale} hreflang jsonLd={jsonLd} />
      <Landing t={t} s={SITE_STRINGS[locale]} locale={locale} home={landingPath(locale)} />
    </>
  );
}
