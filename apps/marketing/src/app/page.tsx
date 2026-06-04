import Link from "next/link";
import { SITE } from "../lib/site";
import { GAME_CONTENT } from "../content/games";
import { SITE_FAQ } from "../content/faq";
import { JsonLd } from "../components/JsonLd";
import { breadcrumbLd, siteFaqLd } from "../lib/jsonld";
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
  HOLDEM: "♦",
  EIGHTBALL: "🎱",
  NINEBALL: "⑨",
  SNOOKER: "🔴",
};

const FEATURES = [
  {
    icon: "🃏",
    title: "22 истински игри",
    text: "Белот с обяви, Сантасе, Шах, Табла, Холдем, билярд и снукър — пълни правила, не опростени.",
  },
  { icon: "⚡", title: "Реално време", text: "Мигновен мултиплейър със server-authoritative логика — без лаг, без измами." },
  {
    icon: "🎯",
    title: "Реалистична физика",
    text: "Билярдът и снукърът ползват детерминирана 2D физика с прицелване и анимация на удара.",
  },
  { icon: "🤖", title: "Умни ботове", text: "Няма съперник? Влизаш веднага срещу бот, който се цели и вкарва — и продължаваш да играеш." },
  { icon: "🏆", title: "Класации и сезони", text: "ELO рейтинг за всяка игра, дневни мисии, сезони и постижения." },
  { icon: "🛡️", title: "Честна игра", text: "Без „плати, за да печелиш“. Игрите със залог са само с виртуални чипове." },
];

const STEPS = [
  { n: 1, title: "Влез за секунди", text: "С имейл, Google или Facebook — без дълги формуляри." },
  { n: 2, title: "Избери игра", text: "22 заглавия, всяко с матчмейкинг по ниво." },
  { n: 3, title: "Играй и се изкачвай", text: "Печели чипове, нива и място в класацията." },
];

export default function Home() {
  return (
    <>
      <JsonLd data={[breadcrumbLd([{ name: "Начало", url: `${SITE.url}/` }]), siteFaqLd(SITE_FAQ)]} />

      {/* HERO */}
      <section className="lp-hero">
        <span className="lp-mote" style={{ left: "18%", top: "30%" }} />
        <span className="lp-mote" style={{ left: "76%", top: "22%", animationDelay: "1.5s" }} />
        <span className="lp-mote" style={{ left: "60%", top: "55%", animationDelay: "3s" }} />
        <span className="lp-mote" style={{ left: "30%", top: "60%", animationDelay: "4.5s" }} />

        <span className="lp-eyebrow">Премиум клуб за игри</span>
        <h1 className="lp-title">{SITE.name}</h1>
        <p className="lp-sub">{SITE.tagline}</p>
        <p className="lp-lead">
          22 класически игри на карти, маса, кий спортове и настолни в реално време. Белот, Сантасе, Шах, Табла,
          билярд и снукър — срещу приятели и ботове, безплатно, направо в браузъра.
        </p>
        <div className="lp-cta-row">
          <a className="cta cta-lg" href={SITE.playUrl}>
            Играй сега
          </a>
          <Link className="cta-ghost" href="/games/">
            Разгледай игрите
          </Link>
        </div>

        <div className="lp-fan" aria-hidden>
          {FAN.map((c, i) => (
            <span
              key={i}
              className={`lp-fan-card ${c.c}`}
              style={{ transform: `rotate(${c.rot}deg) translateY(${Math.abs(c.rot) * 0.4}px)` }}
            >
              {c.r}
              {c.s}
            </span>
          ))}
        </div>
      </section>

      {/* STATS */}
      <div className="lp-stats">
        <div className="lp-stat">
          <div className="lp-stat-num">22</div>
          <div className="lp-stat-label">игри</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-num">3</div>
          <div className="lp-stat-label">езика</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-num">24/7</div>
          <div className="lp-stat-label">маси отворени</div>
        </div>
        <div className="lp-stat">
          <div className="lp-stat-num">0 лв.</div>
          <div className="lp-stat-label">за да започнеш</div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="lp-section">
        <h2>Защо АСО</h2>
        <p className="lp-section-sub">Класиката, която обичаш — с качеството, което заслужава.</p>
        <div className="lp-features">
          {FEATURES.map((f) => (
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
        <h2>Как се започва</h2>
        <p className="lp-section-sub">Три стъпки до първата ти ръка.</p>
        <div className="lp-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="lp-step">
              <div className="lp-step-num">{s.n}</div>
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
        <h2>Игрите</h2>
        <p className="lp-section-sub">Всяка с пълни правила и собствена премиум маса.</p>
        <div className="lp-games">
          {GAME_CONTENT.map((g) => (
            <Link key={g.key} href={`/games/${g.slug}/`} className="lp-game">
              <div className="lp-game-glyph" aria-hidden>
                {GAME_GLYPH[g.key] ?? "♠"}
              </div>
              <h3>{g.title}</h3>
              <p className="muted">
                {g.players} · {g.durationMin} мин
              </p>
            </Link>
          ))}
        </div>
        <div className="lp-games-more">
          <Link className="cta-ghost" href="/games/">
            Виж всички игри
          </Link>
        </div>
      </section>

      {/* FAQ (AEO) */}
      <section className="lp-section lp-section--alt">
        <h2>Често задавани въпроси</h2>
        <p className="lp-section-sub">Бързи отговори, преди да седнеш на масата.</p>
        <div className="lp-faq">
          {SITE_FAQ.slice(0, 6).map((f) => (
            <details key={f.question} className="lp-faq-item">
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
        <div className="lp-games-more">
          <Link className="cta-ghost" href="/faq/">
            Всички въпроси
          </Link>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final">
        <h2>Масата те чака.</h2>
        <div className="lp-trust">
          <span>Безплатно за старт</span>
          <span>Без хазарт за реални пари</span>
          <span>Играй на всяко устройство</span>
        </div>
        <a className="cta cta-lg" href={SITE.playUrl}>
          Влез и играй
        </a>
      </section>
    </>
  );
}
