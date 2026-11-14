// frontend/src/components/ServerCrest.jsx
// Тарифата и състоянието на сървъра под заглавието „Преглед“ (по-рано — голям герб).
//
// ЗАЩО: заглавието беше име + иконка + значка „Premium“. Вярно, но не казваше на
// платещия клиент какво точно е купил, нито го караше да се почувства, че държи
// нещо сериозно. Гербът показва ТАРИФАТА поименно, състоянието на бота и (при
// agency) заетите места — данни, които и без това са в отговора.
//
// Дисциплина:
//   • Числата идват от `getServerTier` през /api/servers/:id — НЕ се измислят и
//     НЕ се дублира логика за резолюция на плана в клиента.
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

// Чиповете под заглавието „Преглед“ (концепцията, 10.10.2026): името на
// сървъра вече е в горната лента, затова големият герб отстъпи на един ред:
// тарифа, бот, места при agency и „платено до“.
export default function ServerMeta({ server, botOnline }) {
  const { t } = useT();
  if (!server) return null;

  const plan = server.plan || (server.isPremium ? "premium" : "free");
  const accent = TIER_ACCENT[plan] || TIER_ACCENT.free;
  const TierIcon = accent.icon;

  // Гратис след отмяна: платено е до дата, но планът в базата е „free“.
  const graceUntil = server.accessUntil ? new Date(server.accessUntil) : null;
  const graceActive = !!(graceUntil && graceUntil > new Date());

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Тарифата — иконка + ТЕКСТ, никога само цвят. */}
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium text-cs-text"
        style={{ borderColor: accent.rail, background: accent.glow }}
      >
        <TierIcon className="w-3.5 h-3.5" aria-hidden="true" />
        {t(`crest.plan.${plan}`)}
      </span>

      {/* Състояние на бота — точка + дума, не само точка. */}
      <span className="inline-flex items-center gap-1.5 text-xs text-cs-muted">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: botOnline ? "rgba(74,222,128,1)" : "rgba(170,170,170,0.7)" }}
          aria-hidden="true"
        />
        {botOnline ? t("crest.botOnline") : t("crest.botOffline")}
      </span>

      {/* Agency: заети места от общо — истинското число, не украса. */}
      {server.agencyCovered && server.agencySeatsUsed != null && server.agencySeatLimit != null && (
        <span className="inline-flex items-center gap-1.5 text-xs text-cs-muted">
          <ServerIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {t("crest.seats", { used: server.agencySeatsUsed, limit: server.agencySeatLimit })}
        </span>
      )}

      {/* Отменен, но платен до края — казваме докога, вместо да мълчим. */}
      {graceActive && (
        <span className="inline-flex items-center gap-1.5 text-xs text-warning">
          {t("crest.paidUntil", { date: graceUntil.toLocaleDateString() })}
        </span>
      )}
    </div>
  );
}
