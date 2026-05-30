import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, Field, Panel } from "../../ui";
import { ApiError, api } from "../../lib/api";
import { useAuthStore } from "../../lib/store";
import { LanguageSwitcher } from "../../app/LanguageSwitcher";

type Mode = "login" | "register";

export function AuthScreen({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function messageFor(code: string): string {
    if (code === "unauthorized") return t("auth.errorCredentials");
    if (code === "email_taken") return t("auth.errorEmailTaken");
    return t("auth.errorGeneric");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({ email, password, displayName });
      setUser(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? messageFor(err.code) : t("auth.errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="font-display text-6xl tracking-wide text-brass-300">{t("brand")}</h1>
        <p className="mt-2 text-ink-300">{t("tagline")}</p>
      </div>

      <Panel className="w-full max-w-md">
        <h2 className="mb-6 text-2xl text-ink-100">
          {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
        </h2>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {mode === "register" && (
            <Field
              label={t("auth.displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              required
            />
          )}
          <Field
            label={t("auth.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Field
            label={t("auth.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />

          {error ? (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={busy} className="mt-2 w-full">
            {mode === "login" ? t("auth.loginCta") : t("auth.registerCta")}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => navigate(mode === "login" ? "/register" : "/login")}
          className="mt-5 w-full text-center text-sm text-brass-300 hover:text-brass-100"
        >
          {mode === "login" ? t("auth.toRegister") : t("auth.toLogin")}
        </button>
      </Panel>

      <div className="mt-6">
        <LanguageSwitcher />
      </div>
    </main>
  );
}
