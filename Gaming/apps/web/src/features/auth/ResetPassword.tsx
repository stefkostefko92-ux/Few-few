import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field } from "../../ui";
import { ApiError, api } from "../../lib/api";
import { AuthShell } from "./AuthShell";
import { fieldErrorsFrom } from "./authErrors";

/** Landing target for the reset email link (/reset-password?token=…). */
export function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(undefined);
    setBusy(true);
    try {
      await api.resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "unknown";
      if (err instanceof ApiError && code === "validation_error") {
        const fields = fieldErrorsFrom(err, t);
        // Грешка по полето „парола“ → под полето; иначе (напр. повреден токен) → линкът е невалиден.
        if (fields.password) setPasswordError(fields.password);
        else setError(t("reset.invalid"));
      } else if (code === "invalid_token") {
        setError(t("reset.invalid"));
      } else if (code === "rate_limited") {
        setError(t("errors.rate_limited"));
      } else {
        setError(t("auth.errorGeneric"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title={t("reset.title")}>
        <p role="alert" className="text-loss">
          {t("reset.invalid")}
        </p>
        <Link
          to="/forgot-password"
          className="mt-4 block text-center text-sm text-brass-300 hover:text-brass-100"
        >
          {t("reset.requestNew")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("reset.title")}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p className="text-ink-100">{t("reset.success")}</p>
          <Link
            to="/login"
            className="inline-flex justify-center rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-5 py-2.5 font-semibold text-charcoal-900"
          >
            {t("reset.goLogin")}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-ink-300">{t("reset.intro")}</p>
          <Field
            label={t("reset.newPassword")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            hint={t("auth.rulesPassword")}
            error={passwordError}
            required
          />
          {error ? (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={busy} className="mt-2 w-full">
            {t("reset.submit")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
