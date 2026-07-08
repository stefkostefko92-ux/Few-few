// Споделени SEO парчета. Next.js слива metadata ПЛИТКО — щом подстраница
// зададе openGraph/twitter, тя презаписва целия родителски обект. Затова
// разгъваме тази база на всяка страница, за да не се губят og:image и др.
import type { Metadata } from "next";
import { SITE_URL, ID } from "@/lib/site";

export { SITE_URL };
const OG_IMG = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Мастилко — дизайн и печат: визитки, етикети, CV",
};

/**
 * OG/Twitter база за подстраница — подай title, description и пътя. Next слива
 * metadata ПЛИТКО, затова тук подаваме и `url`, иначе og:url от layout се губи.
 */
export function pageMeta(title: string, description: string, path?: string): Partial<Metadata> {
  return {
    openGraph: {
      type: "website",
      locale: "bg_BG",
      siteName: "Мастилко",
      title,
      description,
      ...(path ? { url: `${SITE_URL}${path}` } : {}),
      images: [OG_IMG],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

/**
 * JSON-LD за инструмент: WebApplication (част от сайта) + троха „Начало › …“,
 * по желание HowTo (стъпки) и FAQPage (въпроси) — за AEO (богати отговори в
 * търсачки и цитиране от AI асистенти).
 */
export function toolJsonLd(opts: {
  name: string;
  path: string;
  description: string;
  category?: string;
  howTo?: { name: string; steps: string[] };
  faq?: Array<{ q: string; a: string }>;
}) {
  const url = `${SITE_URL}${opts.path}`;
  const graph: Record<string, unknown>[] = [
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
      isPartOf: { "@id": ID.site },
      publisher: { "@id": ID.org },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Начало", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: opts.name, item: url },
      ],
    },
  ];

  if (opts.howTo) {
    graph.push({
      "@type": "HowTo",
      name: opts.howTo.name,
      inLanguage: "bg",
      totalTime: "PT3M",
      step: opts.howTo.steps.map((text, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        text,
      })),
    });
  }

  if (opts.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: opts.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
