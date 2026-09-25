import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BOT_DIFFICULTIES, type BotDifficulty } from "@aso/shared";
import { cn } from "../../ui";
import { getBotDifficulty, setBotDifficulty } from "../../lib/botDifficulty";

/**
 * Lets the player choose how strong the AI opponents play (EASY / NORMAL /
 * HARD). Stored locally and applied to the next match's bot-filled seats.
 */
export function BotDifficultyPicker() {
  const { t } = useTranslation();
  const [value, setValue] = useState<BotDifficulty>(getBotDifficulty());

  const choose = (d: BotDifficulty) => {
    setValue(d);
    setBotDifficulty(d);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-300">{t("difficulty.label", { defaultValue: "Трудност на ботовете" })}</span>
      <div role="group" aria-label={t("difficulty.label", { defaultValue: "Трудност на ботовете" })} className="inline-flex gap-1">
        {BOT_DIFFICULTIES.map((d) => {
          const active = d === value;
          return (
            <button
              key={d}
              type="button"
              onClick={() => choose(d)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition",
                active
                  ? "border-brass-300 bg-brass-300 font-semibold text-felt-900"
                  : "border-brass-300/40 text-brass-300 hover:border-brass-300",
              )}
            >
              {t(`difficulty.${d.toLowerCase()}`, {
                defaultValue: d === "EASY" ? "Лесно" : d === "HARD" ? "Трудно" : "Нормално",
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
