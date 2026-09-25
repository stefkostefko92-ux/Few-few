"use client";

import { useState } from "react";
import type { GameKey } from "@aso/shared";
import { LocaleLink as Link } from "../components/LocaleLink";
import { SITE } from "../lib/site";
import { SITE_FAQ } from "../content/faq";
import { JsonLd } from "../components/JsonLd";
import { breadcrumbLd, siteFaqLd } from "../lib/jsonld";
import { useLocale, useT } from "../i18n/I18nProvider";
import { localizedGames, localizedSiteFaq } from "../i18n/content";
import "./landing.css";

/**
 * Начална страница — клубът в залата на Рейвънхолд. Заглавието е наредено като
 * ъгъла на асо пика (буква + знак), игрите са списъкът на масите в клуба с кадър
 * от истинската маса, брой играчи и минути. Подравнено вляво, без плочки с
 * числа и без емоджита.
 *
 * Без пари: страницата не споменава цени, залози, чипове или хазарт. Въпросите
 * за тях живеят на /faq (и в правните страници), не тук — нито в текста, нито в
 * JSON-LD на тази страница.
 */

type Cat = "cards" | "board" | "cue" | "party";

const CATEGORY: Record<GameKey, Cat> = {
  BELOTE: "cards",
  SANTASE: "cards",
  SVARA: "cards",
  WAR: "cards",
  GOFISH: "cards",
  KENT: "cards",
  RUMMY: "cards",
  BRIDGE: "cards",
  CHESS: "board",
  BACKGAMMON: "board",
  DRAUGHTS: "board",
  LUDO: "board",
  DOMINO: "board",
  MAGNAT: "board",
  DICE: "board",
  EIGHTBALL: "cue",
  NINEBALL: "cue",
  SNOOKER: "cue",
  BATTLESHIP: "party",
  BINGO: "party",
  WORDS: "party",
};
const CATS: Cat[] = ["cards", "board", "cue", "party"];

/** Въпросите за цена и хазарт (индекси 1 и 2) не са за началната страница. */
const HOME_FAQ = [0, 3, 4, 5, 6, 7];

const shot = (key: string) => `/shots/${key.toLowerCase()}.webp`;

export default function Home() {
  const t = useT();
  const locale = useLocale();
  const games = localizedGames(locale);
  const [cat, setCat] = useState<Cat | "all">("all");
  const faq = localizedSiteFaq(locale);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([{ name: "Начало", url: `${SITE.url}/` }]),
          siteFaqLd(HOME_FAQ.map((i) => SITE_FAQ[i]!)),
        ]}
      />

      {/* ── Залата: заглавие-асо + истинската маса ──────────────────────── */}
      <section className="hall">
        <div className="hall__wall" aria-hidden />
        <div className="hall__inner">
          <div className="hall__copy">
            <h1 className="ace" aria-label={`${SITE.name} — ${SITE.tagline}`}>
              <span className="ace__index" aria-hidden>
                <span className="ace__rank">А</span>
                <span className="ace__pip">♠</span>
              </span>
              <span className="ace__word" aria-hidden>
                {SITE.name}
              </span>
            </h1>
            <p className="hall__tagline">{SITE.tagline}</p>
            <p className="hall__lead">{t.home.lead}</p>
            <div className="hall__actions">
              <a className="cta cta-lg" href={SITE.playUrl}>
                {t.home.playNow}
              </a>
              <Link className="link-arrow" href="/games/">
                {t.home.browseGames}
              </Link>
            </div>
            <p className="hall__facts">
              {t.home.facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </p>
          </div>

          <figure className="hall__table">
            <img
              src="/shots/magnat-lg.webp"
              srcSet="/shots/magnat.webp 640w, /shots/magnat-lg.webp 1200w"
              sizes="(max-width: 900px) 92vw, 640px"
              alt={t.home.hero.shotAlts[0]}
              width={1200}
              height={750}
              fetchPriority="high"
              decoding="async"
            />
            <figcaption>{t.home.showcase.shotAlt}</figcaption>
          </figure>
        </div>
      </section>

      {/* ── Масите в клуба ───────────────────────────────────────────────── */}
      <section className="roster" aria-labelledby="roster-h">
        <header className="roster__head">
          <h2 id="roster-h">{t.home.games.heading}</h2>
          <p>{t.home.games.sub}</p>
          <div className="roster__filter" role="group" aria-label={t.home.games.heading}>
            {(["all", ...CATS] as const).map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {t.home.cats[c]}
              </button>
            ))}
          </div>
        </header>

        <div className="roster__groups">
          {CATS.filter((c) => cat === "all" || cat === c).map((c) => (
            <div key={c} className="roster__group">
              <h3>{t.home.cats[c]}</h3>
              <ul>
                {games
                  .filter((g) => CATEGORY[g.key] === c)
                  .map((g) => (
                    <li key={g.key}>
                      <Link href={`/games/${g.slug}/`} className="seat">
                        <img src={shot(g.key)} alt="" width={640} height={400} loading="lazy" decoding="async" />
                        <span className="seat__name">{g.title}</span>
                        <span className="seat__meta">
                          <span>{g.players}</span>
                          <span>
                            {g.durationMin} {t.home.games.minutesShort}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Как е направено ─────────────────────────────────────────────── */}
      <section className="craft">
        <div className="craft__text">
          <h2>{t.home.showcase.heading}</h2>
          <p>{t.home.showcase.text}</p>
        </div>
        <div className="craft__shots">
          <img src={shot("BELOTE")} alt={t.home.hero.shotAlts[1]} width={640} height={400} loading="lazy" decoding="async" />
          <img src={shot("SNOOKER")} alt={t.home.hero.shotAlts[2]} width={640} height={400} loading="lazy" decoding="async" />
        </div>
      </section>

      {/* ── Защо тук ────────────────────────────────────────────────────── */}
      <section className="reasons" aria-labelledby="reasons-h">
        <h2 id="reasons-h">{t.home.features.heading}</h2>
        <dl>
          {t.home.features.items.map((f) => (
            <div key={f.title}>
              <dt>{f.title}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Сървърът е съдията ──────────────────────────────────────────── */}
      <section className="referee">
        <h2>{t.home.fair.heading}</h2>
        <p>{t.home.fair.text}</p>
        <ul>
          {t.home.fair.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      {/* ── Как се сяда на масата (истинска последователност) ───────────── */}
      <section className="steps" aria-labelledby="steps-h">
        <h2 id="steps-h">{t.home.steps.heading}</h2>
        <ol>
          {t.home.steps.items.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Въпроси (AEO) ───────────────────────────────────────────────── */}
      <section className="questions" aria-labelledby="faq-h">
        <h2 id="faq-h">{t.home.faq.heading}</h2>
        <div>
          {HOME_FAQ.map((i) => faq[i])
            .filter((f): f is NonNullable<typeof f> => Boolean(f))
            .map((f) => (
              <details key={f.question}>
                <summary>{f.question}</summary>
                <p>{f.answer}</p>
              </details>
            ))}
        </div>
        <Link className="link-arrow" href="/faq/">
          {t.home.faq.allQuestions}
        </Link>
      </section>

      {/* ── Финал ───────────────────────────────────────────────────────── */}
      <section className="last-call">
        <h2>{t.home.final.heading}</h2>
        <p>
          {t.home.final.trust.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </p>
        <a className="cta cta-lg" href={SITE.playUrl}>
          {t.home.final.cta}
        </a>
      </section>
    </>
  );
}
