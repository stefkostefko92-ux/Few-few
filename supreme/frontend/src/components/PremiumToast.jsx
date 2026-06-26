// frontend/src/components/PremiumToast.jsx
// Listens for `premium-required` and `limit-reached` events on window
// (emitted by the axios interceptor) and shows a dismissible toast + CTA.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Star, X, AlertTriangle } from "lucide-react";

export default function PremiumToast() {
  const [toast, setToast] = useState(null);
  const { serverId } = useParams();

  useEffect(() => {
    const onPremium = (e) => {
      setToast({
        type: "premium",
        title: "Premium required",
        message: e.detail?.error || "This feature is available with a Premium subscription.",
        feature: e.detail?.featureLabel,
        category: e.detail?.category,
      });
    };
    const onLimit = (e) => {
      setToast({
        type: "limit",
        title: "Limit reached",
        message: e.detail?.error || "You've reached the limit for your current tier.",
      });
    };

    window.addEventListener("premium-required", onPremium);
    window.addEventListener("limit-reached", onLimit);
    return () => {
      window.removeEventListener("premium-required", onPremium);
      window.removeEventListener("limit-reached", onLimit);
    };
  }, []);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const isPremium = toast.type === "premium";
  const upgradeHref = serverId ? `/dashboard/${serverId}/premium` : "/dashboard";

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-slide-up">
      <div className={`cs-card border-2 shadow-2xl ${isPremium ? "border-amber-500/50 bg-amber-500/10" : "border-red-500/50 bg-red-500/10"}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {isPremium
              ? <Star className="w-5 h-5 text-amber-400 fill-current" />
              : <AlertTriangle className="w-5 h-5 text-red-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-bold text-sm">{toast.title}</h4>
            <p className="text-cs-muted text-xs mt-1">{toast.message}</p>
            {toast.feature && (
              <p className="text-xs text-amber-300 mt-1">
                <strong>{toast.feature}</strong>
                {toast.category && ` — ${toast.category}`}
              </p>
            )}
            {isPremium && (
              <Link
                to={upgradeHref}
                onClick={() => setToast(null)}
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold uppercase tracking-wider transition-colors"
              >
                <Star className="w-3 h-3 fill-current" />
                Upgrade Now
              </Link>
            )}
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-cs-dim hover:text-white p-1 -m-1 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
