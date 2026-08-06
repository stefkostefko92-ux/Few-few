// frontend/src/components/TrialBanner.jsx
// Appears at the top of the dashboard when:
//   1. Server is eligible for trial (never used, not premium) → "Start 14-day trial"
//   2. Trial is active → "X days left"
//   3. Trial is about to expire (≤ 3 days) → warning-token urgency state
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Clock, AlertTriangle, X, XCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { getTrialStatus, startTrial, cancelTrial } from "../api";
import ConfirmDialog from "./ConfirmDialog";
import { useT } from "../contexts/I18nContext";

export default function TrialBanner() {
  const { t } = useT();
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(
    typeof window !== "undefined" && localStorage.getItem(`trial-banner-dismissed-${serverId}`) === "1"
  );
  // TrialBanner живее в Layout-а и НЕ се демонтира при смяна на сървър, затова
  // useState инициализаторът (веднъж, с първия serverId) правеше „скрит" на
  // сървър A да важи и за сървър B. Пречитаме per-server флага при смяна.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem(`trial-banner-dismissed-${serverId}`) === "1");
  }, [serverId]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const { data: trial } = useQuery({
    queryKey: ["trial", serverId],
    queryFn: () => getTrialStatus(serverId),
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000,
  });

  const startMut = useMutation({
    mutationFn: () => startTrial(serverId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trial", serverId] });
      qc.invalidateQueries({ queryKey: ["server", serverId] });
      qc.invalidateQueries({ queryKey: ["premium-catalog"] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelTrial(serverId),
    onSuccess: () => {
      setConfirmCancel(false);
      qc.invalidateQueries({ queryKey: ["trial", serverId] });
      qc.invalidateQueries({ queryKey: ["server", serverId] });
    },
    onError: (err) => {
      setConfirmCancel(false);
      setCancelError(t("trial.cancelFailed", { error: err?.response?.data?.error || err.message }));
    },
  });

  if (!serverId || !trial) return null;

  // Eligible — not yet used, not premium
  if (trial.eligible && !dismissed) {
    return (
      <div className="bg-gradient-to-r from-cs-gold/15 via-cs-gold/10 to-transparent border-b border-cs-gold/30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <Star className="w-5 h-5 text-cs-gold fill-current flex-shrink-0" />
            <div>
              <div className="text-sm text-cs-text font-bold">
                {t("trial.tryFree")}
              </div>
              <div className="text-xs text-cs-muted">
                {t("trial.tryFreeDesc")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="px-4 py-1.5 rounded-full bg-cs-gold hover:bg-cs-goldDim text-black text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {startMut.isPending ? t("trial.starting") : t("trial.startFree")}
            </button>
            <button
              onClick={() => {
                localStorage.setItem(`trial-banner-dismissed-${serverId}`, "1");
                setDismissed(true);
              }}
              className="text-cs-dim hover:text-white p-1"
              aria-label={t("common.dismiss")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active trial — show days left
  if (trial.active && trial.daysLeft > 0) {
    const urgent = trial.daysLeft <= 3;
    return (
      <div className={`border-b px-4 py-2 ${urgent ? "bg-warning/15 border-warning/40" : "bg-cs-cyan/10 border-cs-cyan/30"}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            {urgent
              ? <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              : <Clock className="w-4 h-4 text-cs-cyan flex-shrink-0" />}
            <div className="text-sm">
              <span className="text-cs-text font-bold">
                {urgent ? t("trial.endingSoon") : t("trial.activePrefix")}
              </span>
              <span className={urgent ? "text-warning" : "text-cs-muted"}>
                {trial.daysLeft === 1 ? t("trial.dayLeft", { count: trial.daysLeft }) : t("trial.daysLeft", { count: trial.daysLeft })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/dashboard/${serverId}/premium`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                urgent
                  ? "bg-warning hover:bg-warning/80 text-black"
                  : "bg-cs-cyan hover:bg-cs-cyan/80 text-black"
              }`}
            >
              {t("trial.subscribe")}
            </Link>
            <button
              onClick={() => setConfirmCancel(true)}
              disabled={cancelMut.isPending}
              className="px-3 py-1 rounded-full bg-transparent border border-cs-border text-cs-muted hover:text-danger hover:border-red-500/50 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
              title={t("trial.endEarly")}
            >
              {cancelMut.isPending ? t("trial.cancelling") : t("trial.cancelTrial")}
            </button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmCancel}
          title={t("trial.cancelTitle")}
          message={t("trial.cancelMsg")}
          confirmLabel={t("trial.cancelConfirm")}
          cancelLabel={t("trial.keepTrial")}
          destructive
          loading={cancelMut.isPending}
          onConfirm={() => cancelMut.mutate()}
          onCancel={() => setConfirmCancel(false)}
        />
        {cancelError && (
          <p role="alert" className="max-w-7xl mx-auto mt-2 text-xs text-danger">{cancelError}</p>
        )}
      </div>
    );
  }

  // Trial used but expired, not premium — gentle reminder
  if (trial.trialUsed && !trial.active && !dismissed) {
    return (
      <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
            <div className="text-sm">
              <span className="text-cs-text font-bold">{t("trial.ended")}</span>
              <span className="text-cs-muted ml-2">{t("trial.lockedNow")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/dashboard/${serverId}/premium`}
              className="px-3 py-1 rounded-full bg-cs-gold hover:bg-cs-goldDim text-black text-xs font-bold uppercase tracking-wider transition-colors"
            >
              {t("trial.subscribeKeep")}
            </Link>
            <button
              onClick={() => {
                localStorage.setItem(`trial-banner-dismissed-${serverId}`, "1");
                setDismissed(true);
              }}
              className="text-cs-dim hover:text-white p-1"
              aria-label={t("common.dismiss")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
