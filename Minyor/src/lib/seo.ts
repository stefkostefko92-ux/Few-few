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

// --- JSON-LD строители (за богати резултати и AI цитиране) ---

// Устойчиви идентификатори на възлите — свързват графа (Organization ↔ WebSite ↔
// страници) в ясна „карта на знанието" за търсачките/AI.
export const ORG_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;

// Спортната организация (футболен клуб).
export function sportsOrganizationLd(opts?: { sameAs?: string[] }) {
  const sameAs = (opts?.sameAs ?? []).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    "@id": ORG_ID,
    name: SITE.name,
    alternateName: SITE.shortName,
    url: SITE.url,
    description: SITE.description,
    sport: "Football",
    foundingDate: SITE.founded,
    logo: {
      "@type": "ImageObject",
      url: `${SITE.url}/icon-512.png`,
      width: 512,
      height: 512,
    },
    image: `${SITE.url}/og.png`,
    knowsLanguage: "bg",
    knowsAbout: ["Футбол", SITE.geo.city, "Областна група Кюстендил"],
    location: {
      "@type": "Place",
      name: SITE.stadium.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: SITE.stadium.address,
        addressLocality: SITE.geo.city,
        addressRegion: SITE.geo.region,
        postalCode: SITE.geo.postalCode,
        addressCountry: SITE.geo.countryCode,
      },
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

// Описва конкретна страница и я свързва с WebSite възела.
export function webPageLd(opts: {
  name: string;
  description?: string;
  path: string;
  type?: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage";
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

// Новинарска статия — за Google Top stories/Discover и AI цитиране.
export function newsArticleLd(a: {
  title: string;
  description?: string;
  url: string;
  publishedAt?: Date | null;
  updatedAt?: Date | null;
  image?: string;
}) {
  const published = (a.publishedAt ?? a.updatedAt ?? new Date()).toISOString();
  const modified = (a.updatedAt ?? a.publishedAt ?? new Date()).toISOString();
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title.slice(0, 110),
    ...(a.description ? { description: a.description } : {}),
    mainEntityOfPage: a.url,
    inLanguage: "bg",
    isAccessibleForFree: true,
    datePublished: published,
    dateModified: modified,
    image: [a.image || `${SITE.url}/og.png`],
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

// Футболен мач — SportsEvent с двата отбора.
export function matchEventLd(m: {
  opponent: string;
  isHome: boolean;
  kickoff: Date;
  competition?: string | null;
  venue?: string | null;
  url: string;
}) {
  const home = m.isHome ? SITE.name : m.opponent;
  const away = m.isHome ? m.opponent : SITE.name;
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home} – ${away}`,
    sport: "Football",
    startDate: m.kickoff.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(m.competition ? { description: m.competition } : {}),
    url: m.url,
    homeTeam: { "@type": "SportsTeam", name: home },
    awayTeam: { "@type": "SportsTeam", name: away },
    location: {
      "@type": "Place",
      name: m.venue || SITE.stadium.name,
      address: {
        "@type": "PostalAddress",
        addressLocality: SITE.geo.city,
        addressRegion: SITE.geo.region,
        addressCountry: SITE.geo.countryCode,
      },
    },
  };
}

// Спортният отбор (състав + щаб) — отговаря на въпроси „кой играе за Миньор“.
export function sportsTeamLd(opts: {
  athletes?: string[];
  coaches?: string[];
}) {
  const athletes = (opts.athletes ?? []).filter(Boolean);
  const coaches = (opts.coaches ?? []).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    "@id": `${SITE.url}/#team`,
    name: SITE.name,
    sport: "Football",
    url: `${SITE.url}/otbor`,
    memberOf: { "@id": ORG_ID },
    ...(athletes.length
      ? { athlete: athletes.map((name) => ({ "@type": "Person", name })) }
      : {}),
    ...(coaches.length
      ? { coach: coaches.map((name) => ({ "@type": "Person", name })) }
      : {}),
  };
}

// Стадионът — Place/StadiumOrArena с координати и капацитет.
export function stadiumLd() {
  return {
    "@context": "https://schema.org",
    "@type": "StadiumOrArena",
    name: SITE.stadium.name,
    maximumAttendeeCapacity: SITE.stadium.capacity,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.stadium.address,
      addressLocality: SITE.geo.city,
      addressRegion: SITE.geo.region,
      postalCode: SITE.geo.postalCode,
      addressCountry: SITE.geo.countryCode,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: SITE.geo.latitude,
      longitude: SITE.geo.longitude,
    },
  };
}

// Списък с елементи — помага на търсачки и AI да разберат категорийните
// страници като подреден списък.
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
