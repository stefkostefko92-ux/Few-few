import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export function canonical(path = "/"): string {
  return `${SITE.url}${path === "/" ? "" : path}`;
}

// Базови метаданни, наследявани и допълвани от всяка страница.
export function buildMetadata(opts: {
  title?: string;
  description?: string;
  path?: string;
  type?: "website" | "article";
  noindex?: boolean;
  images?: string[];
}): Metadata {
  const title = opts.title;
  const description = opts.description ?? SITE.description;
  const url = canonical(opts.path ?? "/");
  const rawImages = opts.images?.length ? opts.images : [`${SITE.url}/og.png`];
  const images = rawImages.map((u) => ({
    url: u,
    width: 1200,
    height: 630,
    alt: title ?? SITE.name,
  }));

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: opts.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: opts.type ?? "website",
      url,
      siteName: SITE.name,
      title: title ? `${title} · ${SITE.name}` : SITE.name,
      description,
      locale: SITE.locale,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: title ? `${title} · ${SITE.name}` : SITE.name,
      description,
      images: rawImages,
    },
  };
}

// --- JSON-LD строители (за AEO / богати резултати) ---

export const ORG_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;

export function organizationLd(opts?: { sameAs?: string[] }) {
  const sameAs = (opts?.sameAs ?? []).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE.name,
    alternateName: SITE.shortName,
    url: SITE.url,
    description: SITE.description,
    slogan: SITE.slogan,
    logo: {
      "@type": "ImageObject",
      url: `${SITE.url}/icon-512.png`,
      width: 512,
      height: 512,
    },
    image: `${SITE.url}/og.png`,
    knowsLanguage: "bg",
    areaServed: [
      { "@type": "AdministrativeArea", name: `Община ${SITE.geo.city}` },
      { "@type": "City", name: SITE.geo.city },
    ],
    address: {
      "@type": "PostalAddress",
      addressLocality: SITE.geo.city,
      addressRegion: SITE.geo.region,
      postalCode: SITE.geo.postalCode,
      addressCountry: SITE.geo.countryCode,
    },
    ...(sameAs.length ? { sameAs } : {}),
    ...(SITE.contact.email || SITE.contact.phone
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            ...(SITE.contact.email ? { email: SITE.contact.email } : {}),
            ...(SITE.contact.phone ? { telephone: SITE.contact.phone } : {}),
            contactType: "customer support",
            areaServed: SITE.geo.countryCode,
            availableLanguage: ["Bulgarian"],
          },
        }
      : {}),
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE.name,
    alternateName: SITE.shortName,
    url: SITE.url,
    description: SITE.description,
    inLanguage: "bg",
    publisher: { "@id": ORG_ID },
  };
}

export function webPageLd(opts: {
  name: string;
  description?: string;
  path: string;
  type?: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "FAQPage";
  lastReviewed?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${canonical(opts.path)}#webpage`,
    url: canonical(opts.path),
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    inLanguage: "bg",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    ...(opts.lastReviewed ? { lastReviewed: opts.lastReviewed } : {}),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".prose-content"],
    },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
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

export function itemListLd(
  items: { name: string; path: string }[],
  name?: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(name ? { name } : {}),
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: canonical(it.path),
    })),
  };
}

export function localBusinessLd(b: {
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  url?: string;
  website?: string;
  lat?: number | null;
  lng?: number | null;
  hours?: string;
  schemaType?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": b.schemaType || "LocalBusiness",
    name: b.name,
    ...(b.description ? { description: b.description } : {}),
    ...(b.website ? { url: b.website } : b.url ? { url: b.url } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: b.address || undefined,
      addressLocality: SITE.geo.city,
      addressRegion: SITE.geo.region,
      postalCode: SITE.geo.postalCode,
      addressCountry: SITE.geo.countryCode,
    },
    ...(b.lat && b.lng
      ? { geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } }
      : {}),
    ...(b.hours ? { openingHours: b.hours } : {}),
  };
}
