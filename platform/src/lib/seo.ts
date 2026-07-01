import type { Block } from "@/lib/blocks";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

// Чист текст от блоковете — за meta description (без markdown/HTML).
export function blocksToPlainText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "hero") parts.push(b.title, b.subtitle);
    else if (b.type === "heading") parts.push(b.text);
    else if (b.type === "text") parts.push(b.text);
    else if (b.type === "button") parts.push(b.label);
  }
  return parts
    .join(" ")
    .replace(/\*\*|__|[*_#>`~]/g, "") // махаме markdown маркери
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [текст](url) → текст
    .replace(/\s+/g, " ")
    .trim();
}

export function pageUrl(siteSlug: string, pageSlug: string): string {
  return pageSlug ? `${BASE}/site/${siteSlug}/${pageSlug}` : `${BASE}/site/${siteSlug}`;
}

// JSON-LD граф (WebSite + Organization + WebPage + BreadcrumbList) за AI цитиране.
export function siteJsonLd(args: {
  siteName: string;
  siteSlug: string;
  pageTitle: string;
  pageSlug: string;
}) {
  const siteUrl = `${BASE}/site/${args.siteSlug}`;
  const url = pageUrl(args.siteSlug, args.pageSlug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        url: siteUrl,
        name: args.siteName,
        inLanguage: "bg",
        publisher: { "@id": `${siteUrl}#org` },
      },
      {
        "@type": "Organization",
        "@id": `${siteUrl}#org`,
        name: args.siteName,
        url: siteUrl,
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: args.pageTitle,
        isPartOf: { "@id": `${siteUrl}#website` },
        inLanguage: "bg",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: args.siteName, item: siteUrl },
          ...(args.pageSlug
            ? [{ "@type": "ListItem", position: 2, name: args.pageTitle, item: url }]
            : []),
        ],
      },
    ],
  };
}
