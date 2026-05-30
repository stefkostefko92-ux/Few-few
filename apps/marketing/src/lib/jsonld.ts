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
    inLanguage: SITE.locales,
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
