import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { AchievementView, GameKey } from "@aso/shared";
import { Panel } from "../../ui";
import { api } from "../../lib/api";
import { gameTitle } from "../lobby/games";

const TIER_RING: Record<string, string> = {
  bronze: "border-[#c08457]/50",
  silver: "border-ink-300/50",
  gold: "border-brass-300/70",
};

/**
 * Localizes an achievement's server-provided (Bulgarian) title/description.
 * The per-game "win a match" badges (`win_<game>`) share one template keyed off
 * the localized game name; everything else has a dedicated `achv.<key>` entry.
 * Falls back to the API text when a translation is missing.
 */
function localizeAchievement(t: TFunction, a: AchievementView): { title: string; description: string } {
  const perGame = /^win_([a-z]+)$/.exec(a.key);
  if (perGame?.[1]) {
    const game = gameTitle(t, perGame[1].toUpperCase() as GameKey);
    return {
      title: t("achv.winGame.title", { game, defaultValue: a.title }),
      description: t("achv.winGame.description", { game, defaultValue: a.description }),
    };
  }
  return {
    title: t(`achv.${a.key}.title`, { defaultValue: a.title }),
    description: t(`achv.${a.key}.description`, { defaultValue: a.description }),
  };
}

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
        {items.map((a) => {
          const { title, description } = localizeAchievement(t, a);
          return (
          <li
            key={a.key}
            title={`${title} — ${description}`}
            className={`flex flex-col items-center gap-1 rounded-card border bg-felt-800/50 px-2 py-3 text-center transition-opacity ${
              a.unlocked ? TIER_RING[a.tier] : "border-brass-400/10 opacity-40 grayscale"
            }`}
          >
            <span className="text-2xl" aria-hidden>
              {a.unlocked ? a.icon : "🔒"}
            </span>
            <span className="text-[11px] leading-tight text-ink-200">{title}</span>
            {a.unlocked ? (
              <span className="text-[10px] text-brass-300">💎 {a.rewardGems}</span>
            ) : null}
          </li>
          );
        })}
      </ul>
    </Panel>
  );
}
