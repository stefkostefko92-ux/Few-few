// frontend/src/components/FeatureGroups.jsx
// Функциите на лендинга, групирани по задача (Поддръжка · Общност · Защита ·
// Автоматизация), вместо 16 еднакви карти в решетка. Всяка група: заглавие и
// едно изречение отляво, функциите като списък отдясно — без кутии, с линия
// между групите. Едно оформление за английския и 7-те превода; данните са
// `{ key, title, desc }` (i18n/landing.js → features, Login.jsx → EN_FEATURES).
import {
  Ticket, FileText, ShieldCheck, BarChart3, Gift, Pin, CalendarClock, Webhook, Sparkles,
  SmilePlus, ScrollText, UserPlus, BookOpen, ClipboardList, Gamepad2, Fish,
} from "lucide-react";

export const FEATURE_ICONS = {
  ticket: Ticket,
  forms: FileText,
  reactionRoles: SmilePlus,
  verification: ShieldCheck,
  polls: BarChart3,
  giveaways: Gift,
  sticky: Pin,
  scheduled: CalendarClock,
  webhooks: Webhook,
  ai: Sparkles,
  activityLog: ScrollText,
  welcomer: UserPlus,
  knowledgeBase: BookOpen,
  canned: ClipboardList,
  game: Gamepad2,
  bait: Fish,
};

// Ред вътре в групата = ред на важност.
export const FEATURE_GROUPS = [
  ["support", ["ticket", "forms", "canned", "knowledgeBase", "ai"]],
  ["community", ["reactionRoles", "giveaways", "polls", "welcomer", "game"]],
  ["safety", ["verification", "bait", "activityLog"]],
  ["automation", ["sticky", "scheduled", "webhooks"]],
];

// Без Premium на всеки сървър (lib/premium.js — PREMIUM_FEATURES няма гейт за тях).
export const FREE_FEATURES = new Set(["ticket", "forms", "reactionRoles", "verification", "polls", "giveaways", "activityLog", "welcomer", "game", "bait"]);

export default function FeatureGroups({ features, ui }) {
  const byKey = Object.fromEntries(features.map((f) => [f.key, f]));
  return (
    <div className="divide-y divide-cs-border/60">
      {FEATURE_GROUPS.map(([groupKey, keys], gi) => {
        const items = keys.map((k) => byKey[k]).filter(Boolean);
        if (!items.length) return null;
        const g = ui.groups[groupKey];
        return (
          <div key={groupKey} data-reveal className="grid lg:grid-cols-[minmax(0,17rem)_1fr] gap-8 lg:gap-14 py-12 first:pt-0">
            <div>
              <h3 className="font-display font-black text-2xl sm:text-3xl text-cs-text leading-tight">{g.title}</h3>
              <p className="text-cs-muted mt-3 text-pretty">{g.blurb}</p>
            </div>
            <ul className={`grid gap-x-10 gap-y-8 ${gi === 0 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
              {items.map((f) => {
                const Icon = FEATURE_ICONS[f.key] || Sparkles;
                return (
                  <li key={f.key} className="flex gap-4">
                    <span className="flex-none w-10 h-10 rounded-lg grid place-items-center bg-cs-cyan/10 text-cs-cyan">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-cs-text font-bold leading-snug">
                        {f.title}
                        {FREE_FEATURES.has(f.key) && (
                          <span className="ml-2 align-middle text-xs font-semibold text-success">{ui.free}</span>
                        )}
                      </h4>
                      <p className="text-sm text-cs-muted leading-relaxed mt-1">{f.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
