import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DAILY_LIMIT_CODE } from "@aso/shared";
import { Button, Panel } from "../../ui";

/**
 * Показва се вместо „Търсим съперник…“, когато сървърът откаже маса заради
 * отговорната игра: достигнат дневен лимит (до полунощ) или самоизключване
 * (до края му). Без натиск: само кога се отваря отново и пътя към настройките.
 */
export function PlayPaused({ code, until }: { code: string; until?: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const limit = code === DAILY_LIMIT_CODE;
  const date = until ? new Date(until).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16" data-testid="play-paused" data-code={code}>
      <Panel className="w-full text-center">
        <div className="mb-3 text-5xl" aria-hidden>
          {limit ? "🌙" : "⏸"}
        </div>
        <h1 className="mb-2 text-2xl text-brass-300">
          {limit ? t("playPaused.limitTitle") : t("playPaused.excludedTitle")}
        </h1>
        <p className="text-ink-300" role="status">
          {limit ? t("playPaused.limitBody", { date }) : t("playPaused.excludedBody", { date })}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={() => navigate("/account#responsible")} className="w-full">
            {t("playPaused.settings")}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
            {t("game.backToLobby")}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
