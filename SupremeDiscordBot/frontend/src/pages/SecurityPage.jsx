// frontend/src/pages/SecurityPage.jsx
// Сигурност на акаунта: втори фактор (TOTP) — записване, резервни кодове,
// изключване. Задължителен за staff ролите (MFA_ENFORCE_STAFF); наличен за всеки.
//
// Тайната идва от сървъра САМО при записване (setup) и се показва като QR +
// текст за ръчно въвеждане; след потвърждение никога повече не се показва.
// Резервните кодове се показват ЕДИН път — страницата настоява да се запазят.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { KeyRound, ShieldCheck, ShieldAlert, Copy, RefreshCw, Trash2 } from "lucide-react";
import { getMfaStatus, mfaSetup, mfaEnable, mfaDisable, mfaRegenerateCodes } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "../contexts/I18nContext";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/Modal";

function BackupCodes({ codes }) {
  const { t } = useT();
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(codes.join("\n")); toast.success(t("security.copied")); }
    catch { toast.error(t("auto.actionFailed")); }
  };
  return (
    <div className="bg-cs-bg border border-cs-gold/30 rounded-lg p-4">
      <p className="text-sm font-semibold text-cs-gold mb-1">{t("security.backupTitle")}</p>
      <p className="text-xs text-cs-muted mb-3">{t("security.backupBody")}</p>
      <div className="grid grid-cols-2 gap-1 font-mono text-sm text-cs-text">
        {codes.map((c) => <code key={c}>{c}</code>)}
      </div>
      <button type="button" onClick={copy} className="cs-btn-secondary mt-3 flex items-center gap-2 text-sm">
        <Copy className="w-4 h-4" /> {t("security.copyCodes")}
      </button>
    </div>
  );
}

export default function SecurityPage() {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [params] = useSearchParams();

  const { data: status, isLoading } = useQuery({ queryKey: ["mfa-status"], queryFn: getMfaStatus });

  // Записване
  const [pending, setPending] = useState(null); // { secret, otpauth, qr }
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [newCodes, setNewCodes] = useState(null);

  const errText = (err) => {
    const c = err?.response?.data?.code;
    if (c === "TOO_MANY_FAILED_ATTEMPTS") return t("security.tooMany", { sec: err.response.data.retryAfterSeconds });
    if (c === "MFA_INVALID_CODE") return t("security.invalidCode");
    return err?.response?.data?.error || t("auto.actionFailed");
  };

  const setupMut = useMutation({
    mutationFn: mfaSetup,
    onSuccess: async (d) => {
      let qr = null;
      try { qr = await QRCode.toDataURL(d.otpauth, { margin: 1, width: 192 }); } catch { qr = null; }
      setPending({ ...d, qr }); setError(null); setCode("");
    },
    onError: (err) => setError(errText(err)),
  });
  const enableMut = useMutation({
    mutationFn: () => mfaEnable(code.trim()),
    onSuccess: (d) => {
      setNewCodes(d.backupCodes); setPending(null); setCode("");
      setUser((u) => (u ? { ...u, mfa: { ...(u.mfa || {}), enabled: true, enrollmentRequired: false, verifiedInSession: true } } : u));
      qc.invalidateQueries({ queryKey: ["mfa-status"] });
      toast.success(t("security.enabledToast"));
    },
    onError: (err) => setError(errText(err)),
  });

  // Изключване / нови кодове — искат код в модал
  const [modal, setModal] = useState(null); // "disable" | "regenerate"
  const [modalCode, setModalCode] = useState("");
  const [modalError, setModalError] = useState(null);
  const disableMut = useMutation({
    mutationFn: () => mfaDisable(modalCode.trim()),
    onSuccess: () => {
      setModal(null); setModalCode(""); setNewCodes(null);
      setUser((u) => (u ? { ...u, mfa: { ...(u.mfa || {}), enabled: false, verifiedInSession: false, enrollmentRequired: !!u.mfa?.required } } : u));
      qc.invalidateQueries({ queryKey: ["mfa-status"] });
      toast.success(t("security.disabledToast"));
    },
    onError: (err) => setModalError(errText(err)),
  });
  const regenMut = useMutation({
    mutationFn: () => mfaRegenerateCodes(modalCode.trim()),
    onSuccess: (d) => { setModal(null); setModalCode(""); setNewCodes(d.backupCodes); qc.invalidateQueries({ queryKey: ["mfa-status"] }); },
    onError: (err) => setModalError(errText(err)),
  });

  // ?enroll=1 (пренасочен staff) — започваме записването веднага.
  useEffect(() => {
    if (params.get("enroll") === "1" && status && !status.enabled && !pending && !setupMut.isPending) setupMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (isLoading) return <div className="p-4 sm:p-6 lg:p-8"><div className="cs-card h-40 animate-pulse" /></div>;

  const enabled = !!status?.enabled;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="cs-heading font-display font-bold text-cs-text text-3xl flex items-center gap-2">
          <KeyRound className="w-7 h-7 text-cs-cyan" /> {t("security.title")}
        </h1>
        <p className="text-cs-muted mt-2">{t("security.subtitle")}</p>
      </div>

      {status?.enrollmentRequired && (
        <div role="alert" className="cs-card bg-warning/10 border-warning/30 mb-6 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-sm text-cs-text">{t("security.enrollmentRequired")}</p>
        </div>
      )}

      {/* Състояние */}
      <div className="cs-card mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {enabled ? <ShieldCheck className="w-6 h-6 text-success" /> : <ShieldAlert className="w-6 h-6 text-cs-dim" />}
          <div>
            <p className="font-semibold text-cs-text">{enabled ? t("security.statusEnabled") : t("security.statusDisabled")}</p>
            <p className="text-xs text-cs-dim">
              {enabled
                ? t("security.enabledOn", { date: new Date(status.enabledAt).toLocaleDateString(), n: status.backupCodesLeft })
                : (status?.required ? t("security.requiredStaff") : t("security.optional"))}
            </p>
          </div>
        </div>
        {enabled ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setModal("regenerate"); setModalCode(""); setModalError(null); }} className="cs-btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" /> {t("security.regenerate")}
            </button>
            <button type="button" onClick={() => { setModal("disable"); setModalCode(""); setModalError(null); }} className="cs-btn-ghost text-danger flex items-center gap-2 text-sm border border-danger/30">
              <Trash2 className="w-4 h-4" /> {t("security.disable")}
            </button>
          </div>
        ) : (
          !pending && (
            <button type="button" onClick={() => setupMut.mutate()} disabled={setupMut.isPending} className="cs-btn-primary">
              {setupMut.isPending ? t("premium.loading") : t("security.enable")}
            </button>
          )
        )}
      </div>

      {/* Записване */}
      {pending && !enabled && (
        <div className="cs-card space-y-4 mb-6">
          <div>
            <p className="font-semibold text-cs-text">{t("security.step1")}</p>
            <div className="flex flex-wrap items-start gap-4 mt-3">
              {pending.qr
                ? <img src={pending.qr} alt={t("security.qrAlt")} width={192} height={192} className="bg-white rounded p-1" />
                : <div className="w-48 h-48 bg-cs-bg rounded flex items-center justify-center text-xs text-cs-dim">QR</div>}
              <div className="text-sm text-cs-muted max-w-xs">
                <p>{t("security.secretManual")}</p>
                <code className="block mt-2 font-mono text-cs-text break-all select-all">{pending.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
              </div>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); enableMut.mutate(); }} className="space-y-3">
            <p className="font-semibold text-cs-text">{t("security.step2")}</p>
            <label className="block max-w-xs">
              <span className="cs-label">{t("security.codeLabel")}</span>
              <input className="cs-input font-mono tracking-widest text-lg" value={code} onChange={(e) => setCode(e.target.value)}
                inputMode="numeric" autoComplete="one-time-code" placeholder={t("security.codePh")} maxLength={8} />
            </label>
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={enableMut.isPending || code.trim().length < 6} className="cs-btn-primary">
                {enableMut.isPending ? t("premium.loading") : t("security.confirm")}
              </button>
              <button type="button" onClick={() => { setPending(null); setError(null); }} className="cs-btn-secondary">{t("common.cancel")}</button>
            </div>
          </form>
        </div>
      )}

      {newCodes && <div className="mb-6"><BackupCodes codes={newCodes} /></div>}

      <div className="cs-card text-sm text-cs-muted space-y-2">
        <p>{t("security.explainer1")}</p>
        <p>{t("security.explainer2")}</p>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "disable" ? t("security.disableTitle") : t("security.regenerateTitle")}>
        <p className="text-sm text-cs-muted mb-4">{modal === "disable" ? t("security.disableBody") : t("security.regenerateBody")}</p>
        <form onSubmit={(e) => { e.preventDefault(); (modal === "disable" ? disableMut : regenMut).mutate(); }} className="space-y-3">
          <label className="block">
            <span className="cs-label">{t("security.codeLabel")}</span>
            <input className="cs-input font-mono tracking-widest text-lg" value={modalCode} onChange={(e) => setModalCode(e.target.value)}
              inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder={t("security.codePh")} maxLength={16} />
          </label>
          <p className="text-xs text-cs-dim">{t("security.useBackup")}</p>
          {modalError && <p role="alert" className="text-danger text-sm">{modalError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModal(null)} className="cs-btn-secondary">{t("common.cancel")}</button>
            <button type="submit" disabled={modalCode.trim().length < 6 || disableMut.isPending || regenMut.isPending}
              className={modal === "disable" ? "cs-btn-primary bg-danger border-danger" : "cs-btn-primary"}>
              {modal === "disable" ? t("security.disable") : t("security.regenerate")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
