import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "../../../../lib/site";
import { alternatesFor } from "../../../../lib/seo";
import { getDict } from "../../../../i18n/dictionaries";
import { localeHref, type Locale } from "../../../../i18n/locales";
import { GAME_CONTENT, getGameContent } from "../../../../content/games";
import { localizeGame } from "../../../../i18n/content";
import { JsonLd } from "../../../../components/JsonLd";
import { breadcrumbLd, faqLd, howToLd, videoGameLd } from "../../../../lib/jsonld";
import { GamePageBody } from "../../../games/[slug]/GamePageBody";

/** One page per game, per locale (parent segment supplies the locale). */
export function generateStaticParams(): Array<{ slug: string }> {
  return GAME_CONTENT.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const base = getGameContent(slug);
  if (!base) return {};
  const t = getDict(locale as Locale);
  const game = localizeGame(base, locale as Locale);
  return {
    title: `${game.title} — ${t.games.metaTitleSuffix}`,
    description: game.summary,
    alternates: alternatesFor(locale as Locale, `/games/${game.slug}/`),
    openGraph: {
      title: `${game.title} — ${SITE.name}`,
      description: game.summary,
      url: `${SITE.url}${localeHref(locale as Locale, `/games/${game.slug}/`)}`,
      type: "article",
      // Reuse the canonical (BG) per-game share card — the visual is language-neutral.
      images: [`${SITE.url}/games/${game.slug}/opengraph-image`],
    },
  };
}

export default async function LocaleGamePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const base = getGameContent(slug);
  if (!base) notFound();
  const t = getDict(locale as Locale);
  const game = localizeGame(base, locale as Locale);
  const url = (p: string) => `${SITE.url}${localeHref(locale as Locale, p)}`;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: t.breadcrumbs.home, url: url("/") },
            { name: t.breadcrumbs.games, url: url("/games/") },
            { name: game.title, url: url(`/games/${game.slug}/`) },
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
