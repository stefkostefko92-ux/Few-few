// frontend/src/components/BaitShowcase.jsx
// Секцията „канал-стръв за спам ботове“ (v52) на лендинга — една и съща за
// английския (Login.jsx) и за 7-те преведени (LandingLocalized.jsx); целият
// текст е в i18n/landingBait.js (собствен lazy чънк с компонента).
//
// Единственият голям момент на секцията: живо демо на канала #bait. Спам бот
// пуска измама, отгоре пада въдица, кукичката я закача и я издърпва нагоре
// извън канала; плувката в лентата потъва; броячът се качва с едно.
// Пуска се САМО веднъж, когато секцията влезе в екрана, и после само по бутон
// (движение в отговор на действие). При prefers-reduced-motion няма анимация:
// показва се крайното състояние, бутонът сменя сцената мигновено.
// Нищо не мига (WCAG 2.3.1): само opacity/transform, ≥300 ms.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { BAIT_COPY } from "../i18n/landingBait";

// Фази на сцената: idle → typing → posted → hooked → gone
const TIMELINE = [["typing", 350], ["posted", 1250], ["hooked", 2250], ["gone", 3150]];
const START_COUNT = 1247;

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function BaitShowcase({ locale = "en", href = "/features/discord-anti-spam-bait-channel" }) {
  const t = BAIT_COPY[locale] || BAIT_COPY.en;
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
    <section id="bait" className="bt-section relative px-6 sm:px-8 pb-24 pt-20 border-t border-cs-border/50 overflow-hidden">
      <div aria-hidden="true" className="bt-water absolute inset-0 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
        <div data-reveal>
          <h2 className="bt-title font-display font-black text-4xl sm:text-5xl lg:text-6xl text-cs-text mb-6 text-balance leading-[0.95]">
            {t.heading}
          </h2>
          <p className="text-cs-muted text-lg mb-8 text-pretty max-w-xl">{t.sub}</p>
          <ul className="space-y-3 mb-8 max-w-xl">
            {t.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-cs-text">
                <Check className="w-5 h-5 bt-ink flex-shrink-0 mt-0.5" aria-hidden="true" />
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
          <div aria-hidden="true" className={`bt-window bt-is-${phase}`}>
            <div className="bt-bar">
              <span className="bt-hash">#</span>
              <span className="font-bold text-cs-text">bait</span>
              <span className="bt-topic">{t.topic}</span>
              {/* Плувката: потъва, когато някой захапе */}
              <span className="bt-bobber">
                <svg viewBox="0 0 24 40" width="16" height="27">
                  <line x1="12" y1="0" x2="12" y2="8" className="bt-bobber-line" />
                  <path d="M12 8c5 0 8 5 8 11H4c0-6 3-11 8-11z" fill="#e5483b" />
                  <path d="M4 19h16c0 6-3 11-8 11s-8-5-8-11z" fill="#f4f1ea" />
                  <line x1="12" y1="30" x2="12" y2="38" className="bt-bobber-line" />
                </svg>
                <span className="bt-ripple" />
              </span>
            </div>

            <div className="bt-feed">
              {/* Предупреждението на бота — винаги отгоре */}
              <div className="bt-msg">
                <div className="bt-avatar bt-avatar-bot">S</div>
                <div className="min-w-0 flex-1">
                  <div className="bt-author">Supreme Bot <span className="bt-tag">BOT</span></div>
                  <div className="bt-embed">
                    <div className="font-bold text-cs-text mb-1">🎣 {t.warningTitle}</div>
                    <div className="text-sm text-cs-muted leading-snug">{t.warningBody}</div>
                    <div className="text-sm text-cs-text mt-2">
                      {t.caughtLabel}: <span className="bt-count" key={count}>{count.toLocaleString("en-US")}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Спам ботът — и въдицата, която го вади */}
              <div className="bt-stage">
                <div className="bt-typing">
                  <span className="bt-dot" /><span className="bt-dot" /><span className="bt-dot" />
                  <span className="ml-2">{scam.user} {t.typing}</span>
                </div>
                <div className="bt-catch">
                  <div className="bt-msg bt-spam">
                    <div className="bt-avatar bt-avatar-spam">{scam.user[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="bt-author">{scam.user}</div>
                      <div className="text-cs-text text-sm break-words">{scam.text}</div>
                    </div>
                  </div>
                  <div className="bt-rig">
                    <span className="bt-line" />
                    <svg className="bt-hook" viewBox="0 0 40 84" width="36" height="76">
                      {/* примамката — оранжева капка на влакното */}
                      <path className="bt-lure" d="M32 2c5 6 7 11 7 15a7 7 0 0 1-14 0c0-4 2-9 7-15z" />
                      <circle cx="32" cy="27" r="3.5" fill="none" strokeWidth="3" />
                      <path d="M32 31v32a12 12 0 0 1-24 0" fill="none" strokeWidth="3.5" strokeLinecap="round" />
                      <path d="M8 63l-5-8" fill="none" strokeWidth="3.5" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <div className="bt-removed">
                  <span className="bt-ink font-bold">🎣 {scam.user}</span> {t.removed}
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
