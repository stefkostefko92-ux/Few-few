// frontend/src/components/GameShowcase.jsx
// Секцията „Server Season“ на лендинга — една и съща за английския (Login.jsx)
// и за 7-те преведени (LandingLocalized.jsx); текстът идва отвън.
//
// Картинките са РЕАЛНИТЕ спътници от играта (frontend/public/game/companions,
// генерирани от mascot/ — нула чужда IP): фиксирани размери (нула CLS), lazy
// + async декодиране (извън LCP пътя). Единственото движение е hover увеличение,
// а index.css неутрализира всяко движение при prefers-reduced-motion.
import { Gamepad2, Check, ArrowRight } from "lucide-react";

// По един от всяка редкост + сезонен — разнообразие на цветове и форми.
export const SHOWCASE_COMPANIONS = [
  { id: "lime-blip", stage: 3, name: "Blip" },
  { id: "teal-tidebrook", stage: 2, name: "Tidebrook" },
  { id: "violet-nocturne", stage: 2, name: "Nocturne" },
  { id: "amber-solstice", stage: 3, name: "Solstice" },
  { id: "ice-borealis", stage: 3, name: "Borealis" },
  { id: "gold-midas", stage: 3, name: "Midas" },
];

export default function GameShowcase({ eyebrow = "→ Server Season", heading, sub, bullets, link, href = "/features/discord-leveling-game" }) {
  return (
    <section id="game" className="px-6 sm:px-8 pb-24 border-t border-cs-border/50 pt-20">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div data-reveal>
          <div className="cs-eyebrow mb-4 inline-flex items-center gap-2"><Gamepad2 className="w-4 h-4" aria-hidden="true" /> {eyebrow}</div>
          <h2 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-cs-text mb-4 text-balance">{heading}</h2>
          <p className="text-cs-muted mb-6 text-pretty">{sub}</p>
          <ul className="space-y-3 mb-8">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-cs-text">
                <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm sm:text-base">{b}</span>
              </li>
            ))}
          </ul>
          <a href={href} className="cs-btn-secondary inline-flex items-center gap-2">
            {link.replace(/\s*→\s*$/, "")} <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
        <ul data-reveal className="grid grid-cols-3 gap-3 sm:gap-4" aria-label="Server Season companions">
          {SHOWCASE_COMPANIONS.map((c) => (
            <li key={c.id} className="cs-card !p-3 text-center group">
              <img
                src={`/game/companions/${c.id}-${c.stage}.jpg`}
                alt={c.name}
                width={128}
                height={128}
                loading="lazy"
                decoding="async"
                className="w-full max-w-[128px] aspect-square mx-auto rounded transition-transform duration-300 group-hover:scale-105"
              />
              <div className="font-mono text-[10px] uppercase tracking-wider text-cs-dim mt-2">{c.name}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
