import type { Metadata } from "next";
import { SITE } from "../../../lib/site";
import { alternatesFor } from "../../../lib/seo";
import { getDict } from "../../../i18n/dictionaries";
import type { Locale } from "../../../i18n/locales";
import { localizedGames } from "../../../i18n/content";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, gameListLd } from "../../../lib/jsonld";
import { GamesIndexBody } from "../../games/GamesIndexBody";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return {
    title: t.games.indexTitle,
    description: t.games.indexLead,
    alternates: alternatesFor(locale as Locale, "/games/"),
  };
}

export default async function LocaleGamesIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: t.breadcrumbs.home, url: `${SITE.url}/${locale}/` },
            { name: t.breadcrumbs.games, url: `${SITE.url}/${locale}/games/` },
          ]),
          gameListLd(localizedGames(locale as Locale)),
        ]}
      />
      <GamesIndexBody />
    </>
  );
}
