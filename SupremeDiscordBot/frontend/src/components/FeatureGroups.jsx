// frontend/src/components/FeatureGroups.jsx
// Функциите на лендинга — решетката на одобрената концепция (10.10.2026):
// икона в лайм квадрат, заглавие и описание, без кутия около всяка функция.
// Групите по задача (поддръжка → общност → защита → автоматизация) определят
// реда. Едно оформление за английския и 7-те превода; данните са
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

// Решетката на одобрената концепция (10.10.2026): три колони, икона в лайм
// квадрат, заглавие и описание — без кутии около всяка функция. Групите
// остават РЕДЪТ (поддръжка → общност → защита → автоматизация) и гаранцията,
// че всяка функция е на страницата точно веднъж (landing.test.js).
// `aside` (картата към живото демо) заема горния десен ъгъл на три реда, а
// функциите обикалят около нея — точно както в концепцията.
export default function FeatureGroups({ features, ui, aside = null }) {
  const byKey = Object.fromEntries(features.map((f) => [f.key, f]));
  const ordered = FEATURE_GROUPS.flatMap(([, keys]) => keys).map((k) => byKey[k]).filter(Boolean);
  return (
    <ul data-reveal className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-9">
      {aside && (
        <li className="sm:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-3 order-last lg:order-none">
          {aside}
        </li>
      )}
      {ordered.map((f) => {
        const Icon = FEATURE_ICONS[f.key] || Sparkles;
        return (
          <li key={f.key} className="flex gap-4">
            <span className="cs-icon-tile !w-10 !h-10">
              <Icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-cs-text text-base font-bold leading-snug">
                {f.title}
                {FREE_FEATURES.has(f.key) && (
                  <span className="ml-2 align-middle text-xs font-semibold text-success">{ui.free}</span>
                )}
              </h3>
              <p className="text-sm text-cs-muted leading-relaxed mt-1">{f.desc}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
