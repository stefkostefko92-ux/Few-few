import type { Metadata } from "next";
import { SITE } from "./site";

/** Абсолютен каноничен адрес за даден път. */
export function canonical(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${SITE.url}${path === "/" ? "" : path}`;
}

/** Изгражда метаданни за страница с разумни стойности по подразбиране. */
export function buildMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = canonical(opts.path);
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      url,
      siteName: SITE.name,
      title: opts.title,
      description: opts.description,
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}

// ── JSON-LD помощници ────────────────────────────────────────────────────────
type Json = Record<string, unknown>;

export function websiteLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    inLanguage: "bg",
    description: SITE.description,
  };
}

export function organizationLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.author,
    url: SITE.authorUrl,
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: canonical(it.path),
    })),
  };
}
