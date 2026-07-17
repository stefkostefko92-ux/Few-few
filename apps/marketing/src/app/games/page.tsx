import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { GAME_CONTENT } from "../../content/games";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd, gameListLd } from "../../lib/jsonld";
import { GamesIndexBody } from "./GamesIndexBody";
import { alternatesFor } from "../../lib/seo";

// Metadata + JSON-LD stay in the canonical BG source of truth (SEO).
export const metadata: Metadata = {
  title: "Всички игри",
  description: "Разгледай всички игри на карти и маса в АСО — правила, брой играчи и продължителност.",
  alternates: alternatesFor("bg", "/games/"),
};

export default function GamesIndex() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Начало", url: `${SITE.url}/` },
            { name: "Игри", url: `${SITE.url}/games/` },
          ]),
          gameListLd(GAME_CONTENT),
        ]}
      />
      <GamesIndexBody />
    </>
  );
}
