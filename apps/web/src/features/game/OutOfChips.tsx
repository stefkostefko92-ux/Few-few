import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, Panel } from "../../ui";
import { useStoreModal } from "../../lib/store";

/**
 * Shown instead of a betting table when the player can't cover the buy-in.
 * Keeps them out of a chip game they can't fund and offers a top-up — a clean,
 * non-coercive monetization surface (chips are also earnable for free).
 */
export function OutOfChips({ minBuyIn, chips }: { minBuyIn: number; chips: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openStore = useStoreModal((s) => s.openStore);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
      <Panel className="w-full text-center">
        <div className="mb-3 text-5xl" aria-hidden>
          🪙
        </div>
        <h1 className="mb-2 text-2xl text-brass-300">{t("outOfChips.title")}</h1>
        <p className="text-ink-300">
          {t("outOfChips.body", { min: minBuyIn.toLocaleString("bg-BG"), chips: chips.toLocaleString("bg-BG") })}
        </p>
        <p className="mt-2 text-xs text-ink-muted">{t("outOfChips.free")}</p>

        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={() => openStore("chips")} className="w-full">
            {t("outOfChips.topUp")}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/")} className="w-full">
            {t("game.backToLobby")}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
