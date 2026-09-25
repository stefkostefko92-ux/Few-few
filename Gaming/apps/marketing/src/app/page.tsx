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
 * Начална страница в света на Рейвънхолд (стилът на игрите): зала на замък под
 * светлината на факли, истински кадри от масите вместо илюстрации, категории на
 * игрите, витрина на 3D масите и честната игра. Статичен експорт, без JS за
 * съдържанието освен филтъра по категория (прогресивно подобрение).
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

const shot = (key: string) => `/shots/${key.toLowerCase()}.webp`;

export default function Home() {
  const t = useT();
  const locale = useLocale();
  const games = localizedGames(locale);
  const [cat, setCat] = useState<Cat | "all">("all");
  const shown = cat === "all" ? games : games.filter((g) => CATEGORY[g.key] === cat);
  const cats: Array<Cat | "all"> = ["all", "cards", "board", "cue", "party"];

  return (
    <>
      {/* JSON-LD stays in the canonical BG source of truth (SEO). */}
      <JsonLd data={[breadcrumbLd([{ name: "Начало", url: `${SITE.url}/` }]), siteFaqLd(SITE_FAQ)]} />

      {/* ── HERO: залата на замъка ─────────────────────────────────────── */}
      <section className="rh-hero">
        <div className="rh-hero__wall" aria-hidden />
        <div className="rh-torch rh-torch--l" aria-hidden>
          <span className="rh-flame" />
        </div>
        <div className="rh-torch rh-torch--r" aria-hidden>
          <span className="rh-flame" />
        </div>
        <div className="rh-embers" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.9) % 7}s` }} />
          ))}
        </div>

        <div className="rh-hero__grid">
          <div className="rh-hero__copy">
            <span className="lp-eyebrow">{t.home.eyebrow}</span>
            <h1 className="rh-title">{SITE.name}</h1>
            <p className="rh-sub">{SITE.tagline}</p>
            <p className="rh-lead">{t.home.lead}</p>
            <div className="lp-cta-row rh-cta-row">
              <a className="cta cta-lg" href={SITE.playUrl}>
                {t.home.playNow}
              </a>
              <Link className="cta-ghost" href="/games/">
                {t.home.browseGames}
              </Link>
            </div>
            <ul className="rh-chips">
              {t.home.hero.chips.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="rh-stage">
            <figure className="rh-frame rh-frame--back rh-frame--l">
              <img src={shot("BELOTE")} alt={t.home.hero.shotAlts[1]} width={640} height={400} decoding="async" />
            </figure>
            <figure className="rh-frame rh-frame--back rh-frame--r">
              <img src={shot("SNOOKER")} alt={t.home.hero.shotAlts[2]} width={640} height={400} decoding="async" />
            </figure>
            <figure className="rh-frame rh-frame--front">
              <img
                src="/shots/magnat-lg.webp"
                srcSet="/shots/magnat.webp 640w, /shots/magnat-lg.webp 1200w"
                sizes="(max-width: 860px) 88vw, 560px"
                alt={t.home.hero.shotAlts[0]}
                width={1200}
                height={750}
                fetchPriority="high"
                decoding="async"
              />
              <figcaption className="rh-live">
                <span className="rh-live__dot" aria-hidden />
                {t.home.hero.badge}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── STATS: дъбова греда с месингови нитове ─────────────────────── */}
      <div className="rh-beam">
        <div className="rh-beam__inner">
          {[
            ["21", t.home.stats.games],
            ["3", t.home.stats.languages],
            ["24/7", t.home.stats.tablesOpen],
            [t.home.statValues.toStart, t.home.stats.toStart],
          ].map(([num, label]) => (
            <div key={label} className="rh-stat">
              <div className="rh-stat__num">{num}</div>
              <div className="rh-stat__label">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ИГРИТЕ: истински кадри + категории ─────────────────────────── */}
      <section className="lp-section rh-games">
        <h2>{t.home.games.heading}</h2>
        <p className="lp-section-sub">{t.home.games.sub}</p>
        <div className="rh-tabs" role="group" aria-label={t.home.games.heading}>
          {cats.map((c) => (
            <button key={c} type="button" className="rh-tab" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {t.home.cats[c]}
            </button>
          ))}
        </div>
        <ul className="rh-grid">
          {shown.map((g) => (
            <li key={g.key}>
              <Link href={`/games/${g.slug}/`} className="rh-card">
                <span className="rh-card__img">
                  <img src={shot(g.key)} alt="" width={640} height={400} loading="lazy" decoding="async" />
                </span>
                <span className="rh-card__body">
                  <span className="rh-card__cat">{t.home.cats[CATEGORY[g.key]]}</span>
                  <h3>{g.title}</h3>
                  <span className="muted">
                    {g.players} · {g.durationMin} {t.home.games.minutesShort}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="lp-games-more">
          <Link className="cta-ghost" href="/games/">
            {t.home.games.viewAll}
          </Link>
        </div>
      </section>

      {/* ── ВИТРИНА: 3D масите ─────────────────────────────────────────── */}
      <section className="rh-showcase">
        <figure className="rh-frame rh-showcase__shot">
          <img
            src="/shots/magnat-lg.webp"
            alt={t.home.showcase.shotAlt}
            width={1200}
            height={750}
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="rh-showcase__copy">
          <span className="rh-kicker">{t.home.showcase.eyebrow}</span>
          <h2>{t.home.showcase.heading}</h2>
          <p className="rh-showcase__text">{t.home.showcase.text}</p>
          <ul className="rh-points">
            {t.home.showcase.points.map((p) => (
              <li key={p.title}>
                <strong>{p.title}</strong>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── ЗАЩО АСО ───────────────────────────────────────────────────── */}
      <section className="lp-section">
        <h2>{t.home.features.heading}</h2>
        <p className="lp-section-sub">{t.home.features.sub}</p>
        <div className="rh-features">
          {t.home.features.items.map((f) => (
            <div key={f.title} className="rh-feature">
              <div className="rh-medal" aria-hidden>
                {f.icon}
              </div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── ЧЕСТНА ИГРА ────────────────────────────────────────────────── */}
      <section className="rh-fair">
        <div className="rh-fair__inner">
          <svg className="rh-shield" viewBox="0 0 64 72" aria-hidden>
            <path d="M32 3 6 12v20c0 17 11 30 26 37 15-7 26-20 26-37V12L32 3Z" />
            <path className="rh-shield__check" d="m20 36 8 8 16-17" />
          </svg>
          <div>
            <span className="rh-kicker">{t.home.fair.eyebrow}</span>
            <h2>{t.home.fair.heading}</h2>
            <p className="rh-fair__text">{t.home.fair.text}</p>
            <ul className="rh-checks">
              {t.home.fair.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── КАК СЕ ЗАПОЧВА ─────────────────────────────────────────────── */}
      <section className="lp-section">
        <h2>{t.home.steps.heading}</h2>
        <p className="lp-section-sub">{t.home.steps.sub}</p>
        <ol className="rh-steps">
          {t.home.steps.items.map((s, i) => (
            <li key={s.title} className="rh-step">
              <span className="rh-coin" aria-hidden>
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p className="muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── ВЪПРОСИ (AEO) ──────────────────────────────────────────────── */}
      <section className="lp-section">
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

      {/* ── ФИНАЛ ──────────────────────────────────────────────────────── */}
      <section className="rh-final">
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
