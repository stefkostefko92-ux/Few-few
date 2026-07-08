// Споделени SEO парчета. Next.js слива metadata ПЛИТКО — щом подстраница
// зададе openGraph/twitter, тя презаписва целия родителски обект. Затова
// разгъваме тази база на всяка страница, за да не се губят og:image и др.
import type { Metadata } from "next";

export const SITE_URL = "https://mastilko-bg.com";
const OG_IMG = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Мастилко — дизайн и печат: визитки, етикети, CV",
};

/** OG/Twitter база за подстраница — подай title и description. */
export function pageMeta(title: string, description: string): Partial<Metadata> {
  return {
    openGraph: {
      type: "website",
      locale: "bg_BG",
      siteName: "Мастилко",
      title,
      description,
      images: [OG_IMG],
    },
    twitter: { card: "summary_large_image", title, images: ["/og.png"] },
  };
}

/** JSON-LD за инструмент: WebApplication (част от сайта) + троха „Начало › …“. */
export function toolJsonLd(opts: {
  name: string;
  path: string;
  description: string;
  category?: string;
}) {
  const url = `${SITE_URL}${opts.path}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: opts.name,
        url,
        applicationCategory: opts.category ?? "DesignApplication",
        operatingSystem: "Web",
        inLanguage: "bg",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        description: opts.description,
        isPartOf: { "@id": `${SITE_URL}/#site` },
        publisher: { "@id": "https://carbonstealth.eu/#org" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Начало", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: opts.name, item: url },
        ],
      },
    ],
  };
}
