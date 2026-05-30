import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "../../../lib/site";
import { GAME_CONTENT, getGameContent } from "../../../content/games";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, faqLd, howToLd, videoGameLd } from "../../../lib/jsonld";

interface Params {
  params: Promise<{ slug: string }>;
}

/** SSG: prerender one page per game (§15). */
export function generateStaticParams(): Array<{ slug: string }> {
  return GAME_CONTENT.map((g) => ({ slug: g.slug }));
}

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

      <article className="container" style={{ padding: "3rem 1.25rem", maxWidth: 760 }}>
        <h1>{game.title}</h1>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          {game.players} играчи · {game.durationMin} мин
        </p>
        <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>{game.intro}</p>

        {game.betting ? (
          <p className="panel" style={{ marginTop: "1.5rem", borderColor: "rgba(217,178,95,.4)" }}>
            ⚠️ Социална игра с виртуални чипове — не е хазарт за реални пари. Чиповете не се
            обменят и не се изплащат.
          </p>
        ) : null}

        <a className="cta" href={SITE.playUrl} style={{ marginTop: "1.5rem" }}>
          Играй {game.title}
        </a>

        <h2 style={{ marginTop: "2.5rem" }}>Как се играе {game.title}</h2>
        <ol style={{ marginTop: "1rem", paddingLeft: "1.25rem", color: "var(--ink-300)" }}>
          {game.howTo.map((step) => (
            <li key={step.name} style={{ marginBottom: "0.75rem" }}>
              <strong style={{ color: "var(--ink-100)" }}>{step.name}.</strong> {step.text}
            </li>
          ))}
        </ol>

        <h2 style={{ marginTop: "2.5rem" }}>Често задавани въпроси</h2>
        <div style={{ marginTop: "1rem" }}>
          {game.faq.map((f) => (
            <div key={f.question} style={{ marginBottom: "1.25rem" }}>
              <h3 style={{ fontSize: "1.05rem", color: "var(--ink-100)" }}>{f.question}</h3>
              <p style={{ color: "var(--ink-300)", marginTop: "0.25rem" }}>{f.answer}</p>
            </div>
          ))}
        </div>

        <p style={{ marginTop: "2rem" }}>
          <Link href="/games/">← Всички игри</Link>
        </p>
      </article>
    </>
  );
}
