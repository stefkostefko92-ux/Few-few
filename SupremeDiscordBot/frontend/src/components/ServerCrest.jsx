// frontend/src/components/ServerCrest.jsx
// Гербът на командния екран — първото, което човек вижда при отваряне на сървър.
//
// ЗАЩО: заглавието беше име + иконка + значка „Premium“. Вярно, но не казваше на
// платещия клиент какво точно е купил, нито го караше да се почувства, че държи
// нещо сериозно. Гербът показва ТАРИФАТА поименно, състоянието на бота и (при
// agency) заетите места — данни, които и без това са в отговора.
//
// Дисциплина:
//   • Числата идват от `getServerTier` през /api/servers/:id — НЕ се измислят и
//     НЕ се дублира логика за резолюция на плана в клиента.
//   • Движението живее само в `prefers-reduced-motion: no-preference` (виж
//     `.crest-*` в index.css); всичко ≥3s, нула ефекти >3×/s (WCAG 2.3.1).
//   • Тарифата НЕ се предава само с цвят — винаги с текст и иконка (WCAG 1.4.1).
//   • Всеки видим низ минава през `t()` (гейтван паритет на 8 локала).
import { Crown, Star, Bot, Server as ServerIcon, CircleDot } from "lucide-react";
import { useT } from "../contexts/I18nContext";

// Акцентът на всяка тарифа. Стойностите са СЪЩИТЕ токени като в tailwind.config
// (cs-cyan / cs-gold) — държим ги тук като CSS променливи, защото се подават
// инлайн на градиента и на ръба, което Tailwind класовете не покриват.
const TIER_ACCENT = {
  free:       { rail: "rgba(170, 170, 170, 0.55)", icon: CircleDot, glow: "rgba(170,170,170,0.10)" },
  premium:    { rail: "rgba(143, 230, 0, 0.85)",   icon: Star,      glow: "rgba(143,230,0,0.14)" },
  whitelabel: { rail: "rgba(240, 194, 76, 0.85)",  icon: Bot,       glow: "rgba(240,194,76,0.14)" },
  agency5:    { rail: "rgba(240, 194, 76, 0.95)",  icon: Crown,     glow: "rgba(240,194,76,0.18)" },
  agency10:   { rail: "rgba(240, 194, 76, 1)",     icon: Crown,     glow: "rgba(240,194,76,0.22)" },
};

export default function ServerCrest({ server, botOnline }) {
  const { t } = useT();
  if (!server) return null;

  const plan = server.plan || (server.isPremium ? "premium" : "free");
  const accent = TIER_ACCENT[plan] || TIER_ACCENT.free;
  const TierIcon = accent.icon;

  // Гратис след отмяна: платено е до дата, но планът в базата е „free“.
  const graceUntil = server.accessUntil ? new Date(server.accessUntil) : null;
  const graceActive = !!(graceUntil && graceUntil > new Date());

  return (
    <section
      className="crest px-6 py-5 mb-6"
      style={{ "--crest-line": accent.rail }}
      aria-labelledby="crest-name"
    >
      <div className="crest-aura" aria-hidden="true" style={{ background: `radial-gradient(38% 48% at 18% 30%, ${accent.glow}, transparent 70%)` }} />
      <div className="crest-grid" aria-hidden="true" />
      <div className="crest-rail" aria-hidden="true" style={{ background: accent.rail, boxShadow: `0 0 18px ${accent.rail}` }} />

      <div className="relative flex flex-wrap items-center gap-5">
        {server.icon ? (
          <img src={server.icon} alt="" className="w-16 h-16 rounded-2xl border border-cs-border flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-cs-cyanGlow border border-cs-cyan/30 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl font-bold text-cs-cyan">{server.name?.[0]}</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 id="crest-name" className="cs-heading font-display font-bold text-cs-text text-2xl md:text-3xl truncate">
            {server.name}
          </h1>

          <div className="flex items-center gap-3 flex-wrap mt-2">
            {/* Тарифата — иконка + ТЕКСТ, никога само цвят. */}
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono uppercase tracking-[0.14em] text-cs-text"
              style={{ borderColor: accent.rail }}
            >
              <TierIcon className="w-3.5 h-3.5" aria-hidden="true" />
              {t(`crest.plan.${plan}`)}
            </span>

            {/* Състояние на бота — точка + дума, не само точка. */}
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-cs-muted">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: botOnline ? "rgba(74,222,128,1)" : "rgba(170,170,170,0.7)" }}
                aria-hidden="true"
              />
              {botOnline ? t("crest.botOnline") : t("crest.botOffline")}
            </span>

            {/* Agency: заети места от общо — истинското число, не украса. */}
            {server.agencyCovered && server.agencySeatsUsed != null && server.agencySeatLimit != null && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-cs-muted">
                <ServerIcon className="w-3.5 h-3.5" aria-hidden="true" />
                {t("crest.seats", { used: server.agencySeatsUsed, limit: server.agencySeatLimit })}
              </span>
            )}

            {/* Отменен, но платен до края — казваме докога, вместо да мълчим. */}
            {graceActive && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-warning">
                {t("crest.paidUntil", { date: graceUntil.toLocaleDateString() })}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
