// frontend/src/components/TrialBanner.jsx
// Appears at the top of the dashboard when:
//   1. Server is eligible for trial (never used, not premium) → "Start 14-day trial"
//   2. Trial is active → "X days left"
//   3. Trial is about to expire (≤ 3 days) → amber warning
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Clock, AlertTriangle, X, XCircle } from "lucide-react";
import { useState } from "react";
import { getTrialStatus, startTrial, cancelTrial } from "../api";
import ConfirmDialog from "./ConfirmDialog";

export default function TrialBanner() {
  const { serverId } = useParams();
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(
    typeof window !== "undefined" && localStorage.getItem(`trial-banner-dismissed-${serverId}`) === "1"
  );
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
      setCancelError(`Failed to cancel: ${err?.response?.data?.error || err.message}`);
    },
  });

  if (!serverId || !trial) return null;

  // Eligible — not yet used, not premium
  if (trial.eligible && !dismissed) {
    return (
      <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-b border-amber-500/30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <Star className="w-5 h-5 text-amber-400 fill-current flex-shrink-0" />
            <div>
              <div className="text-sm text-cs-text font-bold">
                Try Premium free for 14 days
              </div>
              <div className="text-xs text-cs-muted">
                Unlock all features — no credit card required, no auto-charge.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {startMut.isPending ? "Starting…" : "Start Free Trial"}
            </button>
            <button
              onClick={() => {
                localStorage.setItem(`trial-banner-dismissed-${serverId}`, "1");
                setDismissed(true);
              }}
              className="text-cs-dim hover:text-white p-1"
              aria-label="Dismiss"
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
      <div className={`border-b px-4 py-2 ${urgent ? "bg-amber-500/15 border-amber-500/40" : "bg-cs-cyan/10 border-cs-cyan/30"}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            {urgent
              ? <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              : <Clock className="w-4 h-4 text-cs-cyan flex-shrink-0" />}
            <div className="text-sm">
              <span className="text-cs-text font-bold">
                {urgent ? "Trial ending soon: " : "Premium trial active: "}
              </span>
              <span className={urgent ? "text-amber-300" : "text-cs-muted"}>
                {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"} left
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/dashboard/${serverId}/premium`}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
                urgent
                  ? "bg-amber-500 hover:bg-amber-400 text-black"
                  : "bg-cs-cyan hover:bg-cs-cyan/80 text-black"
              }`}
            >
              Subscribe →
            </Link>
            <button
              onClick={() => setConfirmCancel(true)}
              disabled={cancelMut.isPending}
              className="px-3 py-1 rounded-full bg-transparent border border-cs-border text-cs-muted hover:text-danger hover:border-red-500/50 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
              title="End trial early"
            >
              {cancelMut.isPending ? "Cancelling…" : "Cancel Trial"}
            </button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmCancel}
          title="Cancel your trial?"
          message="You'll lose Premium features immediately. This can't be undone — the trial is one-time per server."
          confirmLabel="Cancel trial"
          cancelLabel="Keep trial"
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
              <span className="text-cs-text font-bold">Your Premium trial has ended.</span>
              <span className="text-cs-muted ml-2">Premium features are now locked.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/dashboard/${serverId}/premium`}
              className="px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Subscribe to keep access
            </Link>
            <button
              onClick={() => {
                localStorage.setItem(`trial-banner-dismissed-${serverId}`, "1");
                setDismissed(true);
              }}
              className="text-cs-dim hover:text-white p-1"
              aria-label="Dismiss"
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
