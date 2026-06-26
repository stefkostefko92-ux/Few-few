"use client";

import Link from "next/link";
import { SITE } from "../lib/site";
import { SITE_FAQ } from "../content/faq";
import { JsonLd } from "../components/JsonLd";
import { breadcrumbLd, siteFaqLd } from "../lib/jsonld";
import { useLocale, useT } from "../i18n/I18nProvider";
import { localizedGames, localizedSiteFaq } from "../i18n/content";
import "./landing.css";

const FAN = [
  { r: "A", s: "♠", c: "black", rot: -16 },
  { r: "K", s: "♥", c: "red", rot: -8 },
  { r: "Q", s: "♦", c: "red", rot: 0 },
  { r: "J", s: "♣", c: "black", rot: 8 },
  { r: "10", s: "♠", c: "black", rot: 16 },
];

/** Per-game glyph for the showcase cards — gives each title its own identity. */
const GAME_GLYPH: Record<string, string> = {
  BELOTE: "♠",
  SANTASE: "♥",
  CHESS: "♞",
  BACKGAMMON: "⚅",
  SVARA: "♣",
  EIGHTBALL: "🎱",
  NINEBALL: "⑨",
  SNOOKER: "🔴",
  WAR: "⚔",
  GOFISH: "🐟",
  KENT: "♤",
  DRAUGHTS: "⛀",
  LUDO: "🎲",
  RUMMY: "🃏",
  DOMINO: "🁫",
  BRIDGE: "♢",
  BATTLESHIP: "⚓",
  DICE: "⚄",
  BINGO: "🔵",
  WORDS: "✍",
};

export default function Home() {
  const t = useT();
  const locale = useLocale();
  const games = localizedGames(locale);

  return (
    <>
      {/* JSON-LD stays in the canonical BG source of truth (SEO). */}
      <JsonLd data={[breadcrumbLd([{ name: "Начало", url: `${SITE.url}/` }]), siteFaqLd(SITE_FAQ)]} />

      {/* HERO */}
      <section className="lp-hero">
        <span className="lp-mote" style={{ left: "18%", top: "30%" }} />
        <span className="lp-mote" style={{ left: "76%", top: "22%", animationDelay: "1.5s" }} />
        <span className="lp-mote" style={{ left: "60%", top: "55%", animationDelay: "3s" }} />
        <span className="lp-mote" style={{ left: "30%", top: "60%", animationDelay: "4.5s" }} />

        <span className="lp-eyebrow">{t.home.eyebrow}</span>
        <h1 className="lp-title">{SITE.name}</h1>
        <p className="lp-sub">{SITE.tagline}</p>
        <p className="lp-lead">{t.home.lead}</p>
        <div className="lp-cta-row">
          <a className="cta cta-lg" href={SITE.playUrl}>
            {t.home.playNow}
          </a>
          <Link className="cta-ghost" href="/games/">
            {t.home.browseGames}
          </Link>
        </div>

        <div className="lp-fan" aria-hidden>
          {FAN.map((c, i) => (
            <span
              key={i}
              className={`lp-fan-card ${c.c}`}
              style={{ transform: `rotate(${c.rot}deg) translateY(${Math.abs(c.rot) * 0.4}px)` }}
            >
              <span className="lp-fan-idx lp-fan-idx--tl">
                <b>{c.r}</b>
                <i>{c.s}</i>
              </span>
              <span className="lp-fan-pip">{c.s}</span>
              <span className="lp-fan-idx lp-fan-idx--br">
                <b>{c.r}</b>
                <i>{c.s}</i>
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* STATS */}
      <div className="lp-stats">
        <div className="lp-stat">
          <div className="lp-stat-num">21</div>
          <div className="lp-stat-label">{t.home.stats.games}</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-num">3</div>
          <div className="lp-stat-label">{t.home.stats.languages}</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-num">24/7</div>
          <div className="lp-stat-label">{t.home.stats.tablesOpen}</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-num">{t.home.statValues.toStart}</div>
          <div className="lp-stat-label">{t.home.stats.toStart}</div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="lp-section">
        <h2>{t.home.features.heading}</h2>
        <p className="lp-section-sub">{t.home.features.sub}</p>
        <div className="lp-features">
          {t.home.features.items.map((f) => (
            <div key={f.title} className="lp-feature">
              <div className="lp-feature-icon" aria-hidden>
                {f.icon}
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="lp-section lp-section--alt">
        <h2>{t.home.steps.heading}</h2>
        <p className="lp-section-sub">{t.home.steps.sub}</p>
        <div className="lp-steps">
          {t.home.steps.items.map((s, i) => (
            <div key={s.title} className="lp-step">
              <div className="lp-step-num">{i + 1}</div>
              <h3 style={{ color: "var(--ink-100)" }}>{s.title}</h3>
              <p className="muted" style={{ marginTop: ".4rem" }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* GAMES */}
      <section className="lp-section">
        <h2>{t.home.games.heading}</h2>
        <p className="lp-section-sub">{t.home.games.sub}</p>
        <div className="lp-games">
          {games.slice(0, 12).map((g) => (
            <Link key={g.key} href={`/games/${g.slug}/`} className="lp-game">
              <div className="lp-game-glyph" aria-hidden>
                {GAME_GLYPH[g.key] ?? "♠"}
              </div>
              <h3>{g.title}</h3>
              <p className="muted">
                {g.players} · {g.durationMin} {t.home.games.minutesShort}
              </p>
            </Link>
          ))}
        </div>
        <div className="lp-games-more">
          <Link className="cta-ghost" href="/games/">
            {t.home.games.viewAll}
          </Link>
        </div>
      </section>

      {/* FAQ (AEO) */}
      <section className="lp-section lp-section--alt">
        <h2>{t.home.faq.heading}</h2>
        <p className="lp-section-sub">{t.home.faq.sub}</p>
        <div className="lp-faq">
          {localizedSiteFaq(locale)
            .slice(0, 6)
            .map((f) => (
              <details key={f.question} className="lp-faq-item">
                <summary>{f.question}</summary>
                <p>{f.answer}</p>
              </details>
            ))}
        </div>
        <div className="lp-games-more">
          <Link className="cta-ghost" href="/faq/">
            {t.home.faq.allQuestions}
          </Link>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final">
        <h2>{t.home.final.heading}</h2>
        <div className="lp-trust">
          {t.home.final.trust.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
        <a className="cta cta-lg" href={SITE.playUrl}>
          {t.home.final.cta}
        </a>
      </section>
    </>
  );
}
