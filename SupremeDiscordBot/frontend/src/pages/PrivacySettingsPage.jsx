// frontend/src/pages/PrivacySettingsPage.jsx
// Self-service GDPR rights: data export, account deletion, consent withdrawal.

import { useState } from "react";
import { Download, Trash2, AlertTriangle, Shield, FileText } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { useT } from "../contexts/I18nContext";
import api from "../api";

export default function PrivacySettingsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const [confirmId, setConfirmId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const exportData = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await api.get("/gdpr/export", { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `supreme-bot-data-${user.id}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: t("privacy.exportSuccess") });
    } catch (err) {
      setMessage({ type: "error", text: err?.response?.data?.error || t("privacy.exportFailed") });
    } finally {
      setExporting(false);
    }
  };

  const requestDelete = () => {
    if (confirmId !== user.id) {
      setMessage({ type: "error", text: t("privacy.idMismatch") });
      return;
    }
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setMessage(null);
    try {
      await api.post("/gdpr/delete-account", { confirmDiscordId: user.id });
      setConfirmOpen(false);
      setMessage({ type: "success", text: t("privacy.deleteSuccess") });
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err) {
      setConfirmOpen(false);
      setMessage({ type: "error", text: err?.response?.data?.error || t("privacy.deleteFailed") });
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-cs-text mb-2">{t("privacy.title")}</h1>
        <p className="text-cs-muted">
          {t("privacy.subtitle")}
        </p>
      </div>

      {message && (
        <div
          role={message.type === "success" ? "status" : "alert"}
          className={`cs-card mb-6 border ${
            message.type === "success" ? "border-green-500/50 bg-green-500/10" : "border-red-500/50 bg-red-500/10"
          }`}
        >
          <p className={message.type === "success" ? "text-success" : "text-danger"}>{message.text}</p>
        </div>
      )}

      {/* Export data */}
      <section className="cs-card mb-6">
        <div className="flex items-start gap-4 mb-4">
          <Download className="w-6 h-6 text-cs-cyan flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-cs-text mb-1">{t("privacy.exportTitle")}</h2>
            <p className="text-sm text-cs-muted mb-3">
              {t("privacy.exportDesc")}
            </p>
            <p className="text-xs text-cs-dim mb-4">
              {t("privacy.exportIncludes")}
            </p>
            <button onClick={exportData} disabled={exporting} className="cs-btn-primary">
              <Download className="w-4 h-4" />
              {exporting ? t("privacy.preparing") : t("privacy.downloadBtn")}
            </button>
          </div>
        </div>
      </section>

      {/* Subprocessors */}
      <section className="cs-card mb-6">
        <div className="flex items-start gap-4 mb-4">
          <Shield className="w-6 h-6 text-cs-cyan flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-cs-text mb-1">{t("privacy.subprocessorsTitle")}</h2>
            <p className="text-sm text-cs-muted mb-3">
              {t("privacy.subprocessorsDesc")}
            </p>
            <ul className="text-xs text-cs-muted space-y-2">
              <li className="flex justify-between border-b border-cs-border pb-2">
                <span><strong className="text-cs-text">Hetzner Online GmbH</strong> — {t("privacy.sub.hetzner")}</span>
                <a href="https://www.hetzner.com/legal/privacy-policy/" target="_blank" rel="noopener" className="text-cs-cyan">{t("privacy.policy")}</a>
              </li>
              <li className="flex justify-between border-b border-cs-border pb-2">
                <span><strong className="text-cs-text">Stripe Payments Europe Ltd</strong> — {t("privacy.sub.stripe")}</span>
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener" className="text-cs-cyan">{t("privacy.policy")}</a>
              </li>
              <li className="flex justify-between border-b border-cs-border pb-2">
                <span><strong className="text-cs-text">Google LLC (Gemini API)</strong> — {t("privacy.sub.google")}</span>
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" className="text-cs-cyan">{t("privacy.policy")}</a>
              </li>
              <li className="flex justify-between">
                <span><strong className="text-cs-text">Discord Inc.</strong> — {t("privacy.sub.discord")}</span>
                <a href="https://discord.com/privacy" target="_blank" rel="noopener" className="text-cs-cyan">{t("privacy.policy")}</a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Legal documents */}
      <section className="cs-card mb-6">
        <div className="flex items-start gap-4">
          <FileText className="w-6 h-6 text-cs-cyan flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-cs-text mb-1">{t("privacy.legalTitle")}</h2>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <a href="/terms"   className="cs-btn-secondary text-xs">{t("privacy.terms")}</a>
              <a href="/privacy" className="cs-btn-secondary text-xs">{t("privacy.privacyPolicy")}</a>
              <a href="/cookies" className="cs-btn-secondary text-xs">{t("privacy.cookies")}</a>
              <a href="/eula"    className="cs-btn-secondary text-xs">{t("privacy.eula")}</a>
            </div>
          </div>
        </div>
      </section>

      {/* Delete account */}
      <section className="cs-card border-red-500/30">
        <div className="flex items-start gap-4 mb-4">
          <AlertTriangle className="w-6 h-6 text-danger flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-cs-text mb-1">{t("privacy.deleteTitle")}</h2>
            <p className="text-sm text-cs-muted mb-3">
              {t("privacy.deleteDesc")}
            </p>
            <p className="text-xs text-danger mb-4">
              <strong>{t("privacy.retainedLabel")}</strong> {t("privacy.retainedBody")}
            </p>
            <p className="text-xs text-cs-dim mb-3">
              {t("privacy.cancelFirst")}
            </p>
            <label htmlFor="confirm-discord-id" className="block text-xs text-cs-muted mb-1">
              {t("privacy.typeIdBefore")}<code className="text-cs-cyan">{user?.id}</code>{t("privacy.typeIdAfter")}
            </label>
            <input
              id="confirm-discord-id"
              type="text"
              value={confirmId}
              onChange={(e) => setConfirmId(e.target.value)}
              placeholder={t("privacy.idPh")}
              className="cs-input mb-3 font-mono text-sm"
            />
            <button
              onClick={requestDelete}
              disabled={deleting || confirmId !== user?.id}
              className="cs-btn-danger"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {deleting ? t("privacy.anonymizing") : t("privacy.deleteBtn")}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title={t("privacy.confirmTitle")}
        message={t("privacy.confirmMsg")}
        confirmLabel={t("privacy.confirmDelete")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
