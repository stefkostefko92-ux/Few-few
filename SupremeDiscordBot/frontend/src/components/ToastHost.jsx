// frontend/src/components/ToastHost.jsx
// Renders the active toast stack from ToastContext. Mount once (Layout).
// aria-live="polite" so screen readers announce new toasts without
// interrupting; each toast auto-closes after 5s (ToastContext) and also
// has a manual close button (WCAG 2.2.2 — no timing trap, user control).
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useToastList } from "../contexts/ToastContext";
import { useT } from "../contexts/I18nContext";

export default function ToastHost() {
  const ctx = useToastList();
  const { t } = useT();
  if (!ctx || ctx.toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {ctx.toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto cs-card !p-3 flex items-start gap-2.5 shadow-cs-lift border-2 ${
            item.type === "error" ? "border-danger/50 bg-danger/10" : "border-success/50 bg-success/10"
          }`}
        >
          {item.type === "error"
            ? <AlertCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
            : <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" aria-hidden="true" />}
          <p className="text-cs-text text-sm flex-1 min-w-0 break-words">{typeof item.message === "string" ? item.message : String(item.message?.message || t("toast.fallback"))}</p>
          <button
            type="button"
            onClick={() => ctx.dismiss(item.id)}
            aria-label={t("toast.dismiss")}
            className="text-cs-dim hover:text-white p-0.5 -m-0.5 flex-shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
