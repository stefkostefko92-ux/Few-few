// frontend/src/components/HoneypotShowcase.jsx
// Секцията „капан за спам ботове“ (v52) на лендинга — една и съща за
// английския (Login.jsx) и за 7-те преведени (LandingLocalized.jsx); целият
// текст е в i18n/landingHoneypot.js (собствен lazy чънк с компонента).
//
// Единственият голям момент на секцията: живо демо на канала #honeypot. Спам
// бот пуска измама, медът я залива, ботът изчезва, броячът се качва с едно.
// Пуска се САМО веднъж, когато секцията влезе в екрана, и после само по бутон
// (движение в отговор на действие). При prefers-reduced-motion няма анимация:
// показва се крайното състояние, бутонът сменя сцената мигновено.
// Нищо не мига (WCAG 2.3.1): само opacity/transform/clip-path, ≥300 ms.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { HONEYPOT_COPY } from "../i18n/landingHoneypot";

// Фази на сцената: idle → typing → posted → caught → gone
const TIMELINE = [["typing", 350], ["posted", 1250], ["caught", 2300], ["gone", 3300]];
const START_COUNT = 1247;

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HoneypotShowcase({ locale = "en", href = "/features/discord-anti-spam-honeypot" }) {
  const t = HONEYPOT_COPY[locale] || HONEYPOT_COPY.en;
  const rootRef = useRef(null);
  const timers = useRef([]);
  const [phase, setPhase] = useState("gone");
  const [round, setRound] = useState(0);         // коя измама от t.scams
  const [count, setCount] = useState(START_COUNT);
  const played = useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const play = (nextRound) => {
    clear();
    setRound(nextRound);
    if (prefersReduced()) { setPhase("gone"); setCount((c) => c + 1); return; }
    setPhase("idle");
    for (const [p, at] of TIMELINE) {
      timers.current.push(setTimeout(() => {
        setPhase(p);
        if (p === "gone") setCount((c) => c + 1);
      }, at));
    }
  };

  // Един автоматичен показ, когато сцената стане видима.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !played.current) {
        played.current = true;
        play(0);
        io.disconnect();
      }
    }, { threshold: 0.45 });
    io.observe(el);
    return () => { io.disconnect(); clear(); };
  }, []);

  const scam = t.scams[round % t.scams.length];
  const busy = phase !== "gone";

  return (
    <section id="honeypot" className="hp-section relative px-6 sm:px-8 pb-24 pt-20 border-t border-cs-border/50 overflow-hidden">
      <div aria-hidden="true" className="hp-comb absolute inset-0 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
        <div data-reveal>
          <h2 className="hp-title font-display font-black text-4xl sm:text-5xl lg:text-6xl text-cs-text mb-6 text-balance leading-[0.95]">
            {t.heading}
          </h2>
          <p className="text-cs-muted text-lg mb-8 text-pretty max-w-xl">{t.sub}</p>
          <ul className="space-y-3 mb-8 max-w-xl">
            {t.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-cs-text">
                <Check className="w-5 h-5 hp-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm sm:text-base">{b}</span>
              </li>
            ))}
          </ul>
          <a href={href} className="cs-btn-secondary inline-flex items-center gap-2">
            {t.link} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>

        {/* Демото: декоративно копие на Discord канал. За четците на екран —
            кратко описание вместо сцената. */}
        <figure ref={rootRef} className="relative m-0">
          <figcaption className="sr-only">{t.demoLabel}</figcaption>
          <div aria-hidden="true" className="hp-window">
            <div className="hp-bar">
              <span className="hp-hash">#</span>
              <span className="font-bold text-cs-text">honeypot</span>
              <span className="hp-topic">{t.topic}</span>
            </div>

            <div className="hp-feed">
              {/* Предупреждението на бота — винаги отгоре */}
              <div className="hp-msg">
                <div className="hp-avatar hp-avatar-bot">S</div>
                <div className="min-w-0 flex-1">
                  <div className="hp-author">Supreme Bot <span className="hp-tag">BOT</span></div>
                  <div className="hp-embed">
                    <div className="font-bold text-cs-text mb-1">🍯 {t.warningTitle}</div>
                    <div className="text-sm text-cs-muted leading-snug">{t.warningBody}</div>
                    <div className="text-sm text-cs-text mt-2">
                      {t.caughtLabel}: <span className="hp-count" key={count}>{count.toLocaleString("en-US")}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Спам ботът */}
              <div className={`hp-stage hp-${phase}`}>
                <div className="hp-typing">
                  <span className="hp-dot" /><span className="hp-dot" /><span className="hp-dot" />
                  <span className="ml-2">{scam.user} {t.typing}</span>
                </div>
                <div className="hp-msg hp-spam">
                  <div className="hp-avatar hp-avatar-spam">{scam.user[0]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="hp-author">{scam.user}</div>
                    <div className="text-cs-text text-sm break-words">{scam.text}</div>
                  </div>
                  <svg className="hp-honey" viewBox="0 0 400 120" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="hp-honey-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#ffd27a" />
                        <stop offset="0.55" stopColor="#f2a93b" />
                        <stop offset="1" stopColor="#c97a12" />
                      </linearGradient>
                    </defs>
                    <path fill="url(#hp-honey-fill)" d="M0 0H400V70c-14 0-14 34-28 34s-14-46-30-46-12 58-30 58-14-40-30-40-14 22-30 22-16-52-34-52-14 30-30 30-14-18-30-18-16 44-34 44-14-36-30-36-16 26-34 26-12-12-24-12V0z" />
                  </svg>
                </div>
                <div className="hp-removed">
                  <span className="hp-ink font-bold">🍯 {scam.user}</span> {t.removed}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" className="cs-btn-primary" onClick={() => play(round + 1)} disabled={busy}>
              {t.button}
            </button>
            <span className="text-sm text-cs-dim">{t.note}</span>
          </div>
        </figure>
      </div>
    </section>
  );
}
