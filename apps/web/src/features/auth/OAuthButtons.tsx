import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, oauthStartUrl, type OAuthProviders } from "../../lib/api";

/**
 * Federated sign-in buttons. Only providers the server has credentials for are
 * shown (fetched from /auth/oauth/providers). Clicking is a full-page
 * navigation to the API start endpoint so the auth cookies are set server-side.
 */
export function OAuthButtons() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<OAuthProviders | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .oauthProviders()
      .then((p) => {
        if (!cancelled) setProviders(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!providers || (!providers.google && !providers.facebook)) return null;

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-widest text-ink-muted">
        <span className="h-px flex-1 bg-brass-400/20" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-brass-400/20" />
      </div>

      <div className="flex flex-col gap-3">
        {providers.google ? (
          <a
            href={oauthStartUrl("google")}
            className="flex w-full items-center justify-center gap-3 rounded-card border border-brass-400/20 bg-white py-2.5 font-semibold text-charcoal-900 transition-colors hover:bg-ink-100"
          >
            <GoogleIcon />
            {t("auth.continueGoogle")}
          </a>
        ) : null}

        {providers.facebook ? (
          <a
            href={oauthStartUrl("facebook")}
            className="flex w-full items-center justify-center gap-3 rounded-card bg-[#1877F2] py-2.5 font-semibold text-white transition-opacity hover:opacity-90"
          >
            <FacebookIcon />
            {t("auth.continueFacebook")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}
