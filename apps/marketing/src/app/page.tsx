import Link from "next/link";
import { SITE } from "../lib/site";
import { GAME_CONTENT } from "../content/games";
import { JsonLd } from "../components/JsonLd";
import { breadcrumbLd } from "../lib/jsonld";

export default function Home() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", url: `${SITE.url}/` }])} />

      <section className="container" style={{ padding: "5rem 1.25rem 3rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "3.5rem" }}>{SITE.name}</h1>
        <p style={{ fontSize: "1.25rem", color: "var(--ink-300)", marginTop: "0.75rem" }}>
          {SITE.tagline}
        </p>
        <p style={{ maxWidth: 620, margin: "1.25rem auto", color: "var(--ink-300)" }}>
          18 класически игри на карти и маса в реално време — Белот, Сантасе, Шах, Табла и още.
          Играй срещу приятели и ботове, безплатно, направо в браузъра.
        </p>
        <a className="cta" href={SITE.playUrl} style={{ fontSize: "1.1rem" }}>
          Играй сега
        </a>
      </section>

      <section className="container" style={{ padding: "1rem 1.25rem 4rem" }}>
        <h2 style={{ marginBottom: "1.25rem" }}>Популярни игри</h2>
        <div className="grid">
          {GAME_CONTENT.map((g) => (
            <Link key={g.key} href={`/games/${g.slug}/`} className="panel" style={{ display: "block" }}>
              <h3 style={{ fontSize: "1.25rem" }}>{g.title}</h3>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                {g.players} · {g.durationMin} мин
              </p>
              <p style={{ color: "var(--ink-300)", marginTop: "0.5rem", fontSize: "0.95rem" }}>
                {g.summary}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
