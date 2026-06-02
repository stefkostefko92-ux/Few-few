import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { AuthShell } from "./AuthShell";

type Status = "verifying" | "success" | "failed";

/** Landing target for the verification email link (/verify-email?token=…). */
export function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard StrictMode double-invoke (token is single-use)
    ran.current = true;
    const token = params.get("token");
    if (!token) {
      setStatus("failed");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("failed"));
  }, [params]);

  return (
    <AuthShell title={t("verify.title")}>
      {status === "verifying" ? <p className="text-ink-300">{t("verify.verifying")}</p> : null}

      {status === "success" ? (
        <div className="flex flex-col gap-4">
          <p className="text-ink-100">{t("verify.success")}</p>
          <p className="text-sm text-ink-300">{t("verify.successBody")}</p>
          <Link
            to="/"
            className="mt-2 inline-flex justify-center rounded-card bg-gradient-to-b from-brass-300 to-brass-400 px-5 py-2.5 font-semibold text-charcoal-900"
          >
            {t("verify.continue")}
          </Link>
        </div>
      ) : null}

      {status === "failed" ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-loss">
            {t("verify.failed")}
          </p>
          <Link to="/login" className="text-center text-sm text-brass-300 hover:text-brass-100">
            {t("verify.backToLogin")}
          </Link>
        </div>
      ) : null}
    </AuthShell>
  );
}
