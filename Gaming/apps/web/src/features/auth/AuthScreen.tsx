import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { LOCALES, type Locale } from "@aso/shared";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Panel } from "../../ui";
import { ApiError, api } from "../../lib/api";
import { afterLogin } from "../../lib/session";
import { LanguageSwitcher } from "../../app/LanguageSwitcher";
import { OAuthButtons } from "./OAuthButtons";
import { bannedMessage, fieldErrorsFrom, type AuthField } from "./authErrors";

type Mode = "login" | "register";

export function AuthScreen({ mode }: { mode: Mode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, string>>>({});
  const [busy, setBusy] = useState(false);
  // Mirror OAuthButtons' provider gate so the 18+/ToS notice only shows when the
  // Google/Facebook buttons actually render (both hide when none are configured).
  const [oauthAvailable, setOauthAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .oauthProviders()
      .then((p) => {
        if (!cancelled) setOauthAvailable(Boolean(p.google || p.facebook));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Surface a redirect-back error from the OAuth flow (e.g. ?error=oauth_state).
  const oauthError = params.get("error");

  function messageFor(err: ApiError): string {
    if (err.code === "unauthorized") return t("auth.errorCredentials");
    if (err.code === "email_taken") return t("auth.errorEmailTaken");
    if (err.code === "banned") {
      // DSA art. 17: surface the staff reason (if any), the expiry of a temp ban
      // and how to appeal.
      return bannedMessage(t, i18n.resolvedLanguage, err.message, err.details.until);
    }
    if (err.code === "rate_limited") return t("errors.rate_limited");
    if (err.code === "validation_error") return t("auth.errorValidation");
    return t("auth.errorGeneric");
  }

  function oauthMessageFor(code: string): string {
    if (code === "oauth_no_email") return t("auth.oauthNoEmail");
    if (code === "oauth_unavailable") return t("auth.oauthUnavailable");
    // Блокиран акаунт през Google/Facebook — същият текст като при вход с парола
    // (причината не пътува в URL-а на пренасочването).
    if (code === "banned") return bannedMessage(t, i18n.resolvedLanguage);
    return t("auth.oauthFailed");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      // Езикът на интерфейса става езикът на акаунта (имейли, известия) — само bg/en/it.
      const lang = i18n.resolvedLanguage;
      const locale = (LOCALES as readonly string[]).includes(lang ?? "") ? (lang as Locale) : undefined;
      const res =
        mode === "login"
          ? await api.login({ email, password })
          : await api.register({ email, password, displayName, acceptedTerms: true, locale });
      await afterLogin(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(fieldErrorsFrom(err, t));
        setError(messageFor(err));
      } else {
        setError(t("auth.errorGeneric"));
      }
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

        {oauthError ? (
          <p role="alert" className="mb-4 rounded-card bg-loss/10 px-3 py-2 text-sm text-loss">
            {oauthMessageFor(oauthError)}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {mode === "register" && (
            <Field
              label={t("auth.displayName")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              hint={t("auth.rulesDisplayName")}
              error={fieldErrors.displayName}
              required
            />
          )}
          <Field
            label={t("auth.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            hint={mode === "register" ? t("auth.rulesEmail") : undefined}
            error={fieldErrors.email}
            required
          />
          <Field
            label={t("auth.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            hint={mode === "register" ? t("auth.rulesPassword") : undefined}
            error={fieldErrors.password}
            required
          />

          {mode === "register" ? (
            <label className="flex items-start gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brass-300"
                required
              />
              <span>
                {t("auth.consentPre")}{" "}
                <a href="/terms/" target="_blank" rel="noreferrer" className="text-brass-300 hover:text-brass-100">
                  {t("auth.consentTerms")}
                </a>{" "}
                {t("auth.consentAnd")}{" "}
                <a href="/privacy/" target="_blank" rel="noreferrer" className="text-brass-300 hover:text-brass-100">
                  {t("auth.consentPrivacy")}
                </a>
                .
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            loading={busy}
            disabled={mode === "register" && !accepted}
            className="mt-2 w-full"
          >
            {mode === "login" ? t("auth.loginCta") : t("auth.registerCta")}
          </Button>
        </form>

        {mode === "login" ? (
          <Link
            to="/forgot-password"
            className="mt-4 block text-center text-sm text-ink-muted hover:text-brass-100"
          >
            {t("auth.forgotPassword")}
          </Link>
        ) : null}

        {/* 18+/ToS notice sits on BOTH login and register: an OAuth sign-up from
            /login records termsAcceptedAt, so consent must be disclosed here too. */}
        {oauthAvailable ? (
          <p className="mt-6 text-center text-xs text-ink-muted">
            {t("auth.oauthConsent")}{" "}
            <a href="/terms/" target="_blank" rel="noreferrer" className="text-brass-300 hover:text-brass-100">
              {t("auth.consentTerms")}
            </a>{" "}
            {t("auth.consentAnd")}{" "}
            <a href="/privacy/" target="_blank" rel="noreferrer" className="text-brass-300 hover:text-brass-100">
              {t("auth.consentPrivacy")}
            </a>
            .
          </p>
        ) : null}

        <OAuthButtons />

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
