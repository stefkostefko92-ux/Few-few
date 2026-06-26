import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/site";
import { GAME_CONTENT, getGameContent } from "../../../content/games";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, faqLd, howToLd, videoGameLd } from "../../../lib/jsonld";
import { GamePageBody } from "./GamePageBody";

interface Params {
  params: Promise<{ slug: string }>;
}

/** SSG: prerender one page per game (§15). */
export function generateStaticParams(): Array<{ slug: string }> {
  return GAME_CONTENT.map((g) => ({ slug: g.slug }));
}

// Metadata + JSON-LD stay in the canonical BG source of truth (SEO).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameContent(slug);
  if (!game) return {};
  return {
    title: `${game.title} — правила и онлайн игра`,
    description: game.summary,
    alternates: { canonical: `/games/${game.slug}/` },
    openGraph: {
      title: `${game.title} — ${SITE.name}`,
      description: game.summary,
      url: `${SITE.url}/games/${game.slug}/`,
      type: "article",
    },
  };
}

export default async function GamePage({ params }: Params) {
  const { slug } = await params;
  const game = getGameContent(slug);
  if (!game) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Начало", url: `${SITE.url}/` },
            { name: "Игри", url: `${SITE.url}/games/` },
            { name: game.title, url: `${SITE.url}/games/${game.slug}/` },
          ]),
          videoGameLd(game),
          howToLd(game),
          faqLd(game),
        ]}
      />
      <GamePageBody slug={slug} />
    </>
  );
}
