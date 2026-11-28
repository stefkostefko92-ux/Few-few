// frontend/src/components/game/RunNowCard.jsx
// „Пусни сега“ от таблото — като /spawn и /trivia в Discord (паритет, 28.11.2026).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import DiscordChannelSelect from "../DiscordPicker";
import { startTriviaNow, spawnCompanionNow } from "../../api";
import { useT } from "../../contexts/I18nContext";
import { useToast } from "../../contexts/ToastContext";

const KNOWN = new Set(["GAME_DISABLED", "ROUND_OPEN", "SPAWN_ACTIVE", "BOT_ACTION_FAILED"]);

/** @param {{serverId:string, kind:"spawn"|"trivia", isPremium:boolean}} p */
export default function RunNowCard({ serverId, kind, isPremium }) {
  const { t } = useT();
  const toast = useToast();
  const [channelId, setChannelId] = useState("");
  const [source, setSource] = useState("BANK");
  const run = useMutation({
    mutationFn: () => (kind === "trivia" ? startTriviaNow(serverId, channelId, source) : spawnCompanionNow(serverId, channelId)),
    onSuccess: () => toast.success(t(kind === "trivia" ? "game.runNow.triviaStarted" : "game.runNow.spawned")),
    onError: (e) => {
      const code = e?.response?.data?.code;
      toast.error(KNOWN.has(code) ? t(`game.runNow.error.${code}`) : t("game.saveFailed"));
    },
  });
  const id = `run-now-${kind}`;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-56">
        <label className="cs-label" htmlFor={id}>{t(kind === "trivia" ? "game.runNow.triviaLabel" : "game.runNow.spawnLabel")}</label>
        <DiscordChannelSelect id={id} kind="text" ariaLabel={t("game.runNow.channel")} value={channelId} onChange={(v) => setChannelId(v || "")} />
      </div>
      {kind === "trivia" && (
        <div>
          <label className="cs-label" htmlFor="run-now-source">{t("game.runNow.source")}</label>
          <select id="run-now-source" className="cs-select" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="BANK">{t("game.runNow.sourceBank")}</option>
            <option value="KB" disabled={!isPremium}>{t("game.runNow.sourceKb")}{isPremium ? "" : " · Premium"}</option>
          </select>
        </div>
      )}
      <button type="button" className="cs-btn-secondary" disabled={!channelId || run.isPending} onClick={() => run.mutate()}>
        {t(kind === "trivia" ? "game.runNow.triviaButton" : "game.runNow.spawnButton")}
      </button>
    </div>
  );
}
