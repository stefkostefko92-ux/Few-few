import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button, Field } from "../../ui";
import { api } from "../../lib/api";
import { AuthShell } from "./AuthShell";

/** Request a password-reset link. The server answers the same way regardless
 *  of whether the email exists, so we always show the neutral "sent" state. */
export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.forgotPassword({ email });
    } catch {
      // Intentionally ignore — never reveal whether the address is registered.
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("forgot.title")}>
      {sent ? (
        <div className="flex flex-col gap-4">
          <p className="text-ink-100">{t("forgot.sent")}</p>
          <Link to="/login" className="text-center text-sm text-brass-300 hover:text-brass-100">
            {t("forgot.backToLogin")}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-ink-300">{t("forgot.intro")}</p>
          <Field
            label={t("auth.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Button type="submit" loading={busy} className="mt-2 w-full">
            {t("forgot.submit")}
          </Button>
          <Link to="/login" className="text-center text-sm text-ink-muted hover:text-brass-100">
            {t("forgot.backToLogin")}
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
