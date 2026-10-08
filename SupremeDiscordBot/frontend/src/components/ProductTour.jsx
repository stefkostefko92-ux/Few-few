// frontend/src/components/ProductTour.jsx
// Обиколката „Таблото, наистина“ — снимки от текущото табло с демо данни
// (public/screens/*.webp, правят се с `npm run tour-shots`). Едно и също за
// английския и 7-те превода. Прост превключвател (aria-pressed), без анимация;
// изображенията са с фиксиран размер (нула CLS) и lazy.
import { useState } from "react";
import { EXTRAS_COPY, TOUR_KEYS } from "../i18n/landingExtras";

export default function ProductTour({ locale = "en" }) {
  const t = (EXTRAS_COPY[locale] || EXTRAS_COPY.en).tour;
  const [active, setActive] = useState(0);
  return (
    <section id="tour" className="px-6 sm:px-8 py-24">
      <div className="max-w-6xl mx-auto">
        <div data-reveal className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text leading-[1.02] tracking-tight text-balance">{t.heading}</h2>
          <p className="text-cs-muted text-lg mt-4">{t.sub}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-6" role="group" aria-label={t.heading}>
          {TOUR_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              aria-pressed={active === i}
              onClick={() => setActive(i)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cs-cyan ${
                active === i ? "bg-cs-cyan text-black" : "border border-cs-border text-cs-muted hover:text-cs-text hover:border-cs-borderHi"
              }`}
            >
              {t.labels[i]}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-cs-border overflow-hidden shadow-2xl shadow-cs-cyan/5 bg-cs-panel">
          <img
            src={`/screens/${TOUR_KEYS[active]}.webp`}
            alt={t.alts[active]}
            width="1440"
            height="900"
            loading="lazy"
            decoding="async"
            className="w-full h-auto block"
          />
        </div>
      </div>
    </section>
  );
}
