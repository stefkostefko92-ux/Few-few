import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { rulesForGame, type GameKey } from "@aso/shared";
import { Modal } from "../../ui";

/** Fired by the "?" button in the scene header (SceneHeader) to open the rules. */
export const OPEN_RULES_EVENT = "aso:open-rules";

/**
 * In-game rules helper: an accessible overlay with the game's objective,
 * how-to steps and tips (from the shared GAME_RULES). Opens automatically the
 * first time a player enters a given game, then on demand via the "?" in the
 * scene header — the "seen" flag is stored per game in localStorage.
 *
 * The trigger lives in the header (not a floating button): inside the stage a
 * fixed element is re-anchored by the entrance transform and stretched by the
 * stage's full-width children rule, and outside it would cover the app bar.
 */
export function GameHelp({ game }: { game: GameKey }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rules = rulesForGame(game);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_RULES_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_RULES_EVENT, onOpen);
  }, []);

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

/** The "?" trigger shown in every scene header. */
export function RulesButton() {
  const { t } = useTranslation();
  const label = t("rules.open", { defaultValue: "Правила" });
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_RULES_EVENT))}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-brass-300/50 bg-felt-900/80 text-base font-bold text-brass-300 shadow-lift transition hover:border-brass-300 hover:bg-felt-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-300"
    >
      ?
    </button>
  );
}
