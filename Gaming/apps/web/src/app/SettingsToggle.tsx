import { useTranslation } from "react-i18next";
import { cn } from "../ui";
import { useSettings } from "../lib/settings";

/** Compact accessibility/comfort toggles: mute audio + reduced motion (§6, §3.5). */
export function SettingsToggle() {
  const { t } = useTranslation();
  const muted = useSettings((s) => s.muted);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const setMuted = useSettings((s) => s.setMuted);
  const setReducedMotion = useSettings((s) => s.setReducedMotion);

  const btn = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors duration-fast",
      active
        ? "border-brass-400/40 bg-brass-400/15 text-brass-300"
        : "border-brass-400/15 text-ink-muted hover:text-ink-100",
    );

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
        aria-label={t("a11y.toggleSound")}
        title={t("a11y.toggleSound")}
        className={btn(!muted)}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button
        type="button"
        onClick={() => setReducedMotion(!reducedMotion)}
        aria-pressed={reducedMotion}
        aria-label={t("a11y.toggleMotion")}
        title={t("a11y.toggleMotion")}
        className={btn(reducedMotion)}
      >
        {reducedMotion ? "🛑" : "✨"}
      </button>
    </div>
  );
}
