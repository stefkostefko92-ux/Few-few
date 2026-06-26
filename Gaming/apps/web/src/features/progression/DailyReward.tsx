import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Panel } from "../../ui";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

/** Daily-login claim card shown on the lobby (§12). */
export function DailyReward() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);
  const [state, setState] = useState<{ streak: number; claimedToday: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<{ chips: number; gems: number } | null>(null);

  // Lazily discover state by attempting a claim is wrong (it would grant); instead
  // we surface the button and let the server decide (idempotent per day).
  useEffect(() => {
    setState({ streak: 0, claimedToday: false });
  }, []);

  async function claim() {
    setBusy(true);
    try {
      const res = await api.claimDaily();
      setState({ streak: res.streak, claimedToday: true });
      if (res.claimed) {
        setReward({ chips: res.chips, gems: res.gems });
        // Refresh wallet from /me so the header updates.
        const me = await api.me();
        setUser(me.user);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  return (
    <Panel className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-lg text-brass-300">{t("daily.title")}</h2>
        <p className="text-sm text-ink-muted">
          {reward
            ? t("daily.claimed", { chips: reward.chips, gems: reward.gems })
            : state.claimedToday
              ? t("daily.already")
              : t("daily.prompt")}
        </p>
      </div>
      <Button onClick={() => void claim()} loading={busy} disabled={state.claimedToday}>
        {t("daily.claim")}
      </Button>
    </Panel>
  );
}
