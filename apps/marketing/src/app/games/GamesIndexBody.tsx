"use client";

import Link from "next/link";
import { useLocale, useT } from "../../i18n/I18nProvider";
import { localizedGames } from "../../i18n/content";

export function GamesIndexBody() {
  const t = useT();
  const locale = useLocale();
  const games = localizedGames(locale);
  return (
    <section className="container" style={{ padding: "3rem 1.25rem" }}>
      <h1>{t.games.indexTitle}</h1>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        {t.games.indexLead}
      </p>
      <div className="grid" style={{ marginTop: "2rem" }}>
        {games.map((g) => (
          <Link key={g.key} href={`/games/${g.slug}/`} className="panel" style={{ display: "block" }}>
            <h2 style={{ fontSize: "1.25rem" }}>{g.title}</h2>
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              {g.players} · {g.durationMin} {t.games.minutesShort}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
