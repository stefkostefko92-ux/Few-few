import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyUpdate, canInstall, isUpdateReady, promptInstall, subscribePwa } from "../pwa/pwa";

/**
 * Global PWA affordances (mounted once in App):
 *   • an update toast when a newer app version is waiting, and
 *   • an "install app" pill when the browser offers installation.
 * Both are no-ops until the service worker signals the corresponding state, so
 * nothing renders on a normal load.
 */
export function PwaManager() {
  const { t } = useTranslation();
  const [state, setState] = useState({ update: isUpdateReady(), install: canInstall() });

  useEffect(() => subscribePwa(() => setState({ update: isUpdateReady(), install: canInstall() })), []);

  return (
    <>
      {state.install ? (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="fixed bottom-6 left-4 z-[65] flex items-center gap-2 rounded-card border border-brass-300/50 bg-felt-900/95 px-4 py-2 text-sm font-medium text-ink-100 shadow-lift backdrop-blur transition hover:border-brass-300"
        >
          <span aria-hidden="true">📲</span>
          {t("pwa.install", { defaultValue: "Инсталирай приложението" })}
        </button>
      ) : null}

      {state.update ? (
        <div
          className="fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-card border border-brass-300/40 bg-felt-900/95 px-4 py-2 text-sm text-ink-100 shadow-lift backdrop-blur">
            <span>{t("pwa.updateReady", { defaultValue: "Налична е нова версия." })}</span>
            <button
              type="button"
              onClick={applyUpdate}
              className="rounded-full border border-brass-300 px-3 py-1 font-semibold text-brass-300 transition hover:bg-brass-300 hover:text-felt-900"
            >
              {t("pwa.update", { defaultValue: "Обнови" })}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
