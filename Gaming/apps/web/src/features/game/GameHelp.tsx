import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { rulesForGame, type GameKey } from "@aso/shared";
import { Modal } from "../../ui";

/**
 * In-game rules helper. A floating "?" opens an accessible overlay with the
 * game's objective, how-to steps and tips (from the shared GAME_RULES). Opens
 * automatically the first time a player enters a given game, then only on
 * demand — the "seen" flag is stored per game in localStorage.
 */
export function GameHelp({ game }: { game: GameKey }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rules = rulesForGame(game);

  useEffect(() => {
    const key = `aso_rules_seen_${game}`;
    try {
      if (!localStorage.getItem(key)) {
        setOpen(true);
        localStorage.setItem(key, "1");
      }
    } catch {
      /* storage blocked — just skip the auto-open */
    }
  }, [game]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("rules.open", { defaultValue: "Правила" })}
        title={t("rules.open", { defaultValue: "Правила" })}
        className="fixed right-4 top-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full border border-brass-300/50 bg-felt-900/90 text-lg font-bold text-brass-300 shadow-lift backdrop-blur transition hover:border-brass-300 hover:bg-felt-900"
      >
        ?
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("rules.title", { defaultValue: "Как се играе" })}>
        <div className="space-y-4 text-ink-100">
          <p className="text-base">{rules.objective}</p>

          <div>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brass-300">
              {t("rules.steps", { defaultValue: "Стъпки" })}
            </h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300">
              {rules.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>

          {rules.tips && rules.tips.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-brass-300">
                {t("rules.tips", { defaultValue: "Съвети" })}
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-300">
                {rules.tips.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
