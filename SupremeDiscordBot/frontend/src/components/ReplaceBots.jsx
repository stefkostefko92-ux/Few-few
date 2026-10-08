// frontend/src/components/ReplaceBots.jsx
// „Заменете ги. Всичките.“ — осемте отделни бота, които Supreme замества
// (заглавието на hero-то казва „Осем бота“, тук са същите осем). Категории, не
// чужди марки и цени: те се менят и не са сверени (одит 24.09.2026); сравненията
// със сверени източници са в /compare/*. Английски + 7 превода.
import { EXTRAS_COPY } from "../i18n/landingExtras";

export default function ReplaceBots({ locale = "en" }) {
  const t = (EXTRAS_COPY[locale] || EXTRAS_COPY.en).replace;
  return (
    <section className="px-6 sm:px-8 py-24 bg-cs-surface/40 border-y border-cs-border/40">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_1.3fr] gap-12 items-center">
        <div data-reveal>
          <h2 className="font-display font-black text-4xl sm:text-5xl text-cs-text leading-[1.02] tracking-tight text-balance">{t.heading}</h2>
          <p className="text-cs-muted mt-6 line-through decoration-danger/70">{t.strike}</p>
          <p className="text-cs-cyan font-bold text-xl mt-2">{t.tagline}</p>
        </div>
        <ul data-reveal className="grid grid-cols-2 gap-3">
          {t.items.map(([name, what]) => (
            <li key={name} className="rounded-lg border border-cs-border/70 px-4 py-3">
              <div className="text-sm font-bold text-cs-text line-through decoration-danger/70">{name}</div>
              <div className="text-xs text-cs-muted mt-0.5">{what}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
