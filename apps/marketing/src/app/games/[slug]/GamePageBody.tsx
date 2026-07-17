"use client";

import { LocaleLink as Link } from "../../../components/LocaleLink";
import { SITE } from "../../../lib/site";
import { getGameContent } from "../../../content/games";
import { useLocale, useT } from "../../../i18n/I18nProvider";
import { localizeGame } from "../../../i18n/content";

export function GamePageBody({ slug }: { slug: string }) {
  const t = useT();
  const locale = useLocale();
  const base = getGameContent(slug);
  if (!base) return null;
  const game = localizeGame(base, locale);

  return (
    <article className="container" style={{ padding: "3rem 1.25rem", maxWidth: 760 }}>
      <h1>{game.title}</h1>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        {game.players} {t.games.playersShort} · {game.durationMin} {t.games.minutesShort}
      </p>
      <p style={{ color: "var(--ink-300)", marginTop: "1rem" }}>{game.intro}</p>

      {game.betting ? (
        <p className="panel" style={{ marginTop: "1.5rem", borderColor: "rgba(217,178,95,.4)" }}>
          {t.games.bettingNote}
        </p>
      ) : null}

      <a className="cta" href={SITE.playUrl} style={{ marginTop: "1.5rem" }}>
        {t.games.play} {game.title}
      </a>

      <h2 style={{ marginTop: "2.5rem" }}>
        {t.games.howToPlay} {game.title}
      </h2>
      <ol style={{ marginTop: "1rem", paddingLeft: "1.25rem", color: "var(--ink-300)" }}>
        {game.howTo.map((step) => (
          <li key={step.name} style={{ marginBottom: "0.75rem" }}>
            <strong style={{ color: "var(--ink-100)" }}>{step.name}.</strong> {step.text}
          </li>
        ))}
      </ol>

      <h2 style={{ marginTop: "2.5rem" }}>{t.games.faqHeading}</h2>
      <div style={{ marginTop: "1rem" }}>
        {game.faq.map((f) => (
          <div key={f.question} style={{ marginBottom: "1.25rem" }}>
            <h3 style={{ fontSize: "1.05rem", color: "var(--ink-100)" }}>{f.question}</h3>
            <p style={{ color: "var(--ink-300)", marginTop: "0.25rem" }}>{f.answer}</p>
          </div>
        ))}
      </div>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/games/">{t.games.backToAll}</Link>
      </p>
    </article>
  );
}
