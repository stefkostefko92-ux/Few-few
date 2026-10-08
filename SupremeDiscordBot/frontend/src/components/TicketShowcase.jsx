// frontend/src/components/TicketShowcase.jsx
// Живо демо на тикет системата (основното, което продуктът прави): член отваря
// тикет от панела → AI отговаря първи (отбелязано като AI) → екипът поема →
// отговор → затваряне с оценка. Отляво линия на времето светва стъпка по
// стъпка. Пуска се веднъж при показ и после по бутон; при
// prefers-reduced-motion се показва крайното състояние. Само opacity/transform.
// Текстът е в i18n/landingTicket.js (собствен lazy чънк заедно с компонента).
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Sparkles, Star } from "lucide-react";
import { TICKET_COPY } from "../i18n/landingTicket";

const STEP_MS = 900;
const LAST = 6; // 0 панел · 1 отворен · 2 член · 3 AI · 4 поет · 5 екип · 6 затворен
const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function TicketShowcase({ locale = "en", href = "/features/discord-ticket-system" }) {
  const t = TICKET_COPY[locale] || TICKET_COPY.en;
  const [phase, setPhase] = useState(LAST);
  const rootRef = useRef(null);
  const timers = useRef([]);
  const played = useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const play = () => {
    clear();
    if (prefersReduced()) { setPhase(LAST); return; }
    setPhase(0);
    for (let p = 1; p <= LAST; p++) timers.current.push(setTimeout(() => setPhase(p), p * STEP_MS));
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !played.current) { played.current = true; play(); io.disconnect(); }
    }, { threshold: 0.45 });
    io.observe(el);
    return () => { io.disconnect(); clear(); };
  }, []);

  // Стъпките отляво ↔ фазите на канала.
  const steps = [[1, t.steps[0]], [3, t.steps[1]], [4, t.steps[2]], [5, t.steps[3]], [6, t.steps[4]]];
  const show = (n) => `tk-item ${phase >= n ? "tk-on" : ""}`;

  return (
    <section id="demo" className="relative px-6 sm:px-8 py-24 overflow-hidden">
      <div className="relative max-w-6xl mx-auto">
        <div data-reveal className="max-w-3xl mb-12">
          <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text leading-[1.02] tracking-tight text-balance">{t.heading}</h2>
          <p className="text-cs-muted text-lg mt-4 text-pretty max-w-2xl">{t.sub}</p>
        </div>

        <figure ref={rootRef} className="m-0 grid lg:grid-cols-[14rem_1fr] gap-6 lg:gap-10 items-start">
          <figcaption className="sr-only">{t.demoLabel}</figcaption>

          {/* Линията на времето */}
          <ol aria-hidden="true" className="tk-rail order-2 lg:order-1 flex lg:flex-col gap-3 lg:gap-0 overflow-x-auto lg:overflow-visible">
            {steps.map(([at, label], i) => (
              <li key={label} className={`tk-step ${phase >= at ? "tk-step-on" : ""}`}>
                <span className="tk-dot">{phase >= at ? <Check className="w-3.5 h-3.5" /> : i + 1}</span>
                <span className="tk-label">{label}</span>
                {i === 1 && <span className="tk-time">{phase >= at ? t.firstReply : ""}</span>}
              </li>
            ))}
          </ol>

          {/* Каналът на тикета */}
          <div aria-hidden="true" className="tk-window order-1 lg:order-2">
            <div className="tk-bar">
              <span className="text-cs-cyan font-black text-lg leading-none">#</span>
              <span className="font-bold text-cs-text">{phase >= 1 ? t.channel : "support"}</span>
              {phase >= 6 && <span className="ml-auto text-xs font-semibold text-cs-muted">{t.closedTag}</span>}
            </div>
            <div className="tk-feed">
              <div className={`tk-panel ${phase >= 1 ? "tk-dim" : ""}`}>
                <div className="font-bold text-cs-text">🎫 {t.panelTitle}</div>
                <div className="text-sm text-cs-muted mt-1">{t.panelBody}</div>
                <span className={`tk-btn ${phase === 0 ? "tk-btn-press" : ""}`}>{t.openBtn}</span>
              </div>
              <div className={show(2)}>
                <Msg avatar="m" name="maya_k" text={t.userMsg} />
              </div>
              <div className={show(3)}>
                <Msg avatar="S" bot name="Supreme Bot" tag={<span className="tk-ai"><Sparkles className="w-3 h-3" aria-hidden="true" /> {t.aiLabel}</span>} text={t.aiMsg} />
              </div>
              <div className={`${show(4)} tk-system`}>{t.claimed}</div>
              <div className={show(5)}>
                <Msg avatar="k" staff name="kai.dev" text={t.staffMsg} />
              </div>
              <div className={`${show(6)} tk-closed`}>
                <span>{t.closed}</span>
                <span className="tk-stars" aria-label="5/5">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-4 h-4" fill="currentColor" aria-hidden="true" />)}
                </span>
              </div>
            </div>
          </div>
        </figure>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="button" className="cs-btn-primary" onClick={play} disabled={phase > 0 && phase < LAST}>{t.button}</button>
          <a href={href} className="cs-btn-secondary inline-flex items-center gap-2">
            {t.link} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Msg({ avatar, name, text, tag = null, bot = false, staff = false }) {
  return (
    <div className="flex gap-3 items-start">
      <span className={`tk-avatar ${bot ? "tk-avatar-bot" : staff ? "tk-avatar-staff" : ""}`}>{avatar}</span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-cs-text">{name} {tag}</div>
        <div className="text-sm text-cs-text/90 leading-relaxed">{text}</div>
      </div>
    </div>
  );
}
