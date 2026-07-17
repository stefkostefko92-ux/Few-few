import type { GameContent } from "../content/games";
import { SITE } from "./site";

/**
 * JSON-LD builders (§15). Each public page emits Organization + WebSite +
 * BreadcrumbList; per-game pages add VideoGame, FAQPage and HowTo. Returned as
 * plain objects to be serialized into a <script type="application/ld+json">.
 */

type Json = Record<string, unknown>;

export function organizationLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    logo: `${SITE.url}/logo-mark.png`,
    sameAs: [SITE.org.url],
    parentOrganization: {
      "@type": "Organization",
      name: SITE.org.legalName,
      url: SITE.org.url,
    },
  };
}

export function websiteLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    inLanguage: SITE.locales,
    publisher: { "@type": "Organization", name: SITE.org.legalName, url: SITE.org.url },
  };
}

/**
 * The portal itself as a free, browser-based game application. Complements the
 * per-game VideoGame nodes with a single top-level app entity — helps search
 * and answer engines model "АСО" as a playable product, not just a website.
 */
export function webAppLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    applicationCategory: "GameApplication",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript. Modern browser.",
    inLanguage: SITE.locales,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    publisher: { "@type": "Organization", name: SITE.org.legalName, url: SITE.org.url },
  };
}

/** ItemList of all games for the /games index (rich-result eligible). */
export function gameListLd(games: GameContent[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Игри в АСО",
    numberOfItems: games.length,
    itemListElement: games.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE.url}/games/${g.slug}/`,
      name: g.title,
    })),
  };
}

/** Site-wide FAQ (AEO / answer engines). */
export function siteFaqLd(items: Array<{ question: string; answer: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function breadcrumbLd(items: Array<{ name: string; url: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function videoGameLd(game: GameContent): Json {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    url: `${SITE.url}/games/${game.slug}/`,
    description: game.summary,
    inLanguage: SITE.locales,
    genre: game.betting ? "Social card game" : "Card & board game",
    numberOfPlayers: game.players,
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any (web browser)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    publisher: { "@type": "Organization", name: SITE.org.legalName, url: SITE.org.url },
  };
}

export function faqLd(game: GameContent): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: game.faq.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function howToLd(game: GameContent): Json {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Как се играе ${game.title}`,
    step: game.howTo.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}
