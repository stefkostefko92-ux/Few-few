import type { Block } from "@/lib/blocks";
import { PLATFORM_APEX } from "@/lib/domains";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

// Каноничният публичен адрес на сайта, ако има зададен хост: потвърден собствен
// домейн или наш поддомейн. Ако още няма хост → null (тогава /site/<slug> е
// единственият публичен адрес). Ползва се, за да сочи canonical към хоста и да
// НЕ индексираме дублиращия /site/<slug> път, когато сайтът си има домейн.
export function publicSiteOrigin(site: {
  subdomain: string | null;
  customDomain: string | null;
  domainVerified: boolean;
}): string | null {
  if (site.customDomain && site.domainVerified) return `https://${site.customDomain}`;
  if (site.subdomain) return `https://${site.subdomain}.${PLATFORM_APEX}`;
  return null;
}

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

// Безопасна сериализация за вграждане в <script type="application/ld+json">.
// JSON.stringify НЕ екранира „<“, затова стойност със „</script>“ (напр. име на
// сайт или заглавие на страница от потребител) би затворила тага и останалото би
// се изпълнило като HTML → stored XSS. Екранираме < > & като \uXXXX (валиден JSON).
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

// JSON-LD граф (WebSite + Organization + WebPage + BreadcrumbList) за AI цитиране.
// `origin` е каноничният хост на сайта (поддомейн/домейн); ако липсва, ползваме
// платформения /site/<slug> адрес. `locale` задава inLanguage (по подразбиране bg).
export function siteJsonLd(args: {
  siteName: string;
  siteSlug: string;
  pageTitle: string;
  pageSlug: string;
  origin?: string | null;
  locale?: "bg" | "en" | "it";
}) {
  const lang = args.locale ?? "bg";
  const siteUrl = args.origin ?? `${BASE}/site/${args.siteSlug}`;
  const url = args.origin
    ? args.pageSlug
      ? `${args.origin}/${args.pageSlug}`
      : `${args.origin}/`
    : pageUrl(args.siteSlug, args.pageSlug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        url: siteUrl,
        name: args.siteName,
        inLanguage: lang,
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
        inLanguage: lang,
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
