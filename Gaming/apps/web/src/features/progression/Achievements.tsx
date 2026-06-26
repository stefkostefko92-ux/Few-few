import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AchievementView } from "@aso/shared";
import { Panel } from "../../ui";
import { api } from "../../lib/api";

const TIER_RING: Record<string, string> = {
  bronze: "border-[#c08457]/50",
  silver: "border-ink-300/50",
  gold: "border-brass-300/70",
};

/** Grid of achievement badges (unlocked highlighted, locked dimmed). */
export function Achievements() {
  const { t } = useTranslation();
  const [items, setItems] = useState<AchievementView[]>([]);

  useEffect(() => {
    api.achievements().then((r) => setItems(r.achievements)).catch(() => undefined);
  }, []);

  if (items.length === 0) return null;
  const unlocked = items.filter((a) => a.unlocked).length;

  return (
    <Panel className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl text-ink-100">{t("account.achievements")}</h2>
        <span className="tnum text-sm text-ink-muted">
          {unlocked}/{items.length}
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {items.map((a) => (
          <li
            key={a.key}
            title={`${a.title} — ${a.description}`}
            className={`flex flex-col items-center gap-1 rounded-card border bg-felt-800/50 px-2 py-3 text-center transition-opacity ${
              a.unlocked ? TIER_RING[a.tier] : "border-brass-400/10 opacity-40 grayscale"
            }`}
          >
            <span className="text-2xl" aria-hidden>
              {a.unlocked ? a.icon : "🔒"}
            </span>
            <span className="text-[11px] leading-tight text-ink-200">{a.title}</span>
            {a.unlocked ? (
              <span className="text-[10px] text-brass-300">💎 {a.rewardGems}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
