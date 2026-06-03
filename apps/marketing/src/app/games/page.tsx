import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "../../lib/site";
import { GAME_CONTENT } from "../../content/games";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd, gameListLd } from "../../lib/jsonld";

export const metadata: Metadata = {
  title: "Всички игри",
  description: "Разгледай всички игри на карти и маса в АСО — правила, брой играчи и продължителност.",
  alternates: { canonical: "/games/" },
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
      <section className="container" style={{ padding: "3rem 1.25rem" }}>
        <h1>Игри</h1>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Научи правилата на всяка игра, после играй безплатно в браузъра.
        </p>
        <div className="grid" style={{ marginTop: "2rem" }}>
          {GAME_CONTENT.map((g) => (
            <Link key={g.key} href={`/games/${g.slug}/`} className="panel" style={{ display: "block" }}>
              <h2 style={{ fontSize: "1.25rem" }}>{g.title}</h2>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                {g.players} · {g.durationMin} мин
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
