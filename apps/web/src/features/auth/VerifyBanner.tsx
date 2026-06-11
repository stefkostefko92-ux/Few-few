import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";

/**
 * Soft email-verification nudge. Email verification is not a hard gate on play,
 * so we surface a dismissible banner with a one-click resend instead.
 */
export function VerifyBanner() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [sent, setSent] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user || user.emailVerified || dismissed) return null;

  async function resend() {
    if (!user) return;
    setBusy(true);
    try {
      await api.resendVerification(user.email);
      setSent(true);
    } catch {
      setSent(true); // neutral: never reveal delivery state
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-brass-400/20 bg-brass-300/10 px-4 py-2 text-center text-sm text-ink-100">
      <span>{t("auth.emailUnverified")}</span>
      {sent ? (
        <span className="text-win">{t("auth.resendSent")}</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="font-semibold text-brass-300 underline-offset-2 hover:text-brass-100 hover:underline disabled:opacity-60"
        >
          {t("auth.resend")}
        </button>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("common.dismiss")}
        className="text-ink-muted hover:text-ink-100"
      >
        ✕
      </button>
    </div>
  );
}
