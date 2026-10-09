// frontend/src/components/MfaGate.jsx
// Предизвикателство за втория фактор (TOTP / резервен код).
//
// Две употреби:
//   1. Обвивка на админ конзолата: докато сесията не е потвърдена, вместо децата
//      се показва карта с поле за код (RequireSuperUser в App.jsx).
//   2. Step-up: когато API-то върне 403 MFA_STEP_UP/MFA_REQUIRED, интерсепторът
//      в api/index.js пуска събитие "mfa-challenge" → тук се отваря модал; след
//      успешно потвърждение потребителят повтаря действието (нищо не се
//      преиграва автоматично — разрушително действие не бива да „се случи само“).
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { mfaVerify } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "../contexts/I18nContext";
import Modal from "./Modal";

function CodeForm({ onDone, compact = false }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await mfaVerify(code.trim());
      setCode("");
      onDone?.(r);
    } catch (err) {
      const c = err?.response?.data?.code;
      setError(c === "TOO_MANY_FAILED_ATTEMPTS"
        ? t("security.tooMany", { sec: err.response.data.retryAfterSeconds })
        : t("security.invalidCode"));
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="cs-label">{t("security.codeLabel")}</span>
        <input
          className="cs-input font-mono tracking-widest text-lg"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder={t("security.codePh")}
          maxLength={16}
        />
      </label>
      <p className="text-xs text-cs-dim">{t("security.useBackup")}</p>
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <button type="submit" disabled={busy || code.trim().length < 6} className={`cs-btn-primary ${compact ? "" : "w-full"}`}>
        {busy ? t("premium.loading") : t("security.verify")}
      </button>
    </form>
  );
}

export default function MfaGate({ children }) {
  const { t } = useT();
  const { user, setUser } = useAuth();
  const [modal, setModal] = useState(null); // null | { code, reason }

  // Step-up / изтекла проверка по време на работа — модал върху страницата.
  useEffect(() => {
    const onChallenge = (e) => setModal(e.detail || { code: "MFA_REQUIRED" });
    window.addEventListener("mfa-challenge", onChallenge);
    return () => window.removeEventListener("mfa-challenge", onChallenge);
  }, []);

  const markVerified = () => setUser((u) => (u ? { ...u, mfa: { ...(u.mfa || {}), verifiedInSession: true } } : u));

  const needsGate = user?.mfa?.required && !user?.mfa?.verifiedInSession;

  if (needsGate) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-md">
        <div className="cs-card">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-cs-cyan" />
            <h1 className="text-xl font-bold text-cs-text">{t("security.verifyTitle")}</h1>
          </div>
          <p className="text-sm text-cs-muted mb-4">{t("security.verifyBody")}</p>
          <CodeForm onDone={markVerified} />
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.code === "MFA_STEP_UP" ? t("security.stepUpTitle") : t("security.verifyTitle")}>
        <p className="text-sm text-cs-muted mb-4">
          {modal?.code === "MFA_STEP_UP" ? t("security.stepUpBody") : t("security.verifyBody")}
        </p>
        <CodeForm compact onDone={() => { markVerified(); setModal(null); }} />
      </Modal>
    </>
  );
}
