// frontend/src/pages/PrivacySettingsPage.jsx
// Self-service GDPR rights: data export, account deletion, consent withdrawal.

import { useState } from "react";
import { Download, Trash2, AlertTriangle, Shield, FileText } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ConfirmDialog from "../components/ConfirmDialog";
import api from "../api";

export default function PrivacySettingsPage() {
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
      setMessage({ type: "success", text: "Data exported successfully. File downloaded." });
    } catch (err) {
      setMessage({ type: "error", text: err?.response?.data?.error || "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const requestDelete = () => {
    if (confirmId !== user.id) {
      setMessage({ type: "error", text: "Confirmation ID does not match your Discord user ID." });
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
      setMessage({ type: "success", text: "Account deleted. Redirecting..." });
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (err) {
      setConfirmOpen(false);
      setMessage({ type: "error", text: err?.response?.data?.error || "Deletion failed" });
      setDeleting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-cs-text mb-2">Privacy & Your Data</h1>
        <p className="text-cs-muted">
          Your rights under the EU General Data Protection Regulation (GDPR). Exercise
          any of these rights at any time — no support ticket required.
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
            <h2 className="text-xl font-bold text-cs-text mb-1">Export your data</h2>
            <p className="text-sm text-cs-muted mb-3">
              Article 15 (right of access) + Article 20 (data portability). Download
              a JSON file containing all personal data we hold about you.
            </p>
            <p className="text-xs text-cs-dim mb-4">
              Includes: profile, servers you manage, tickets, applications, API keys,
              affiliate codes, audit log entries.
            </p>
            <button onClick={exportData} disabled={exporting} className="cs-btn-primary">
              <Download className="w-4 h-4" />
              {exporting ? "Preparing export..." : "Download my data (JSON)"}
            </button>
          </div>
        </div>
      </section>

      {/* Subprocessors */}
      <section className="cs-card mb-6">
        <div className="flex items-start gap-4 mb-4">
          <Shield className="w-6 h-6 text-cs-cyan flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-cs-text mb-1">Subprocessors</h2>
            <p className="text-sm text-cs-muted mb-3">
              Third parties that may process your data on behalf of Supreme Bot:
            </p>
            <ul className="text-xs text-cs-muted space-y-2">
              <li className="flex justify-between border-b border-cs-border pb-2">
                <span><strong className="text-cs-text">Hetzner Online GmbH</strong> — Hosting (EU, Germany)</span>
                <a href="https://www.hetzner.com/legal/privacy-policy/" target="_blank" rel="noopener" className="text-cs-cyan">Policy →</a>
              </li>
              <li className="flex justify-between border-b border-cs-border pb-2">
                <span><strong className="text-cs-text">Stripe Payments Europe Ltd</strong> — Payment processing (EU, Ireland)</span>
                <a href="https://stripe.com/privacy" target="_blank" rel="noopener" className="text-cs-cyan">Policy →</a>
              </li>
              <li className="flex justify-between border-b border-cs-border pb-2">
                <span><strong className="text-cs-text">Google LLC (Gemini API)</strong> — AI auto-replies (USA, SCC safeguards)</span>
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" className="text-cs-cyan">Policy →</a>
              </li>
              <li className="flex justify-between">
                <span><strong className="text-cs-text">Discord Inc.</strong> — Authentication + bot API (USA, SCC safeguards)</span>
                <a href="https://discord.com/privacy" target="_blank" rel="noopener" className="text-cs-cyan">Policy →</a>
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
            <h2 className="text-xl font-bold text-cs-text mb-1">Legal documents</h2>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <a href="/terms"   className="cs-btn-secondary text-xs">Terms of Service</a>
              <a href="/privacy" className="cs-btn-secondary text-xs">Privacy Policy</a>
              <a href="/cookies" className="cs-btn-secondary text-xs">Cookie Policy</a>
              <a href="/eula"    className="cs-btn-secondary text-xs">EULA</a>
            </div>
          </div>
        </div>
      </section>

      {/* Delete account */}
      <section className="cs-card border-red-500/30">
        <div className="flex items-start gap-4 mb-4">
          <AlertTriangle className="w-6 h-6 text-danger flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-cs-text mb-1">Delete account</h2>
            <p className="text-sm text-cs-muted mb-3">
              Article 17 (right to erasure). Permanently delete your personal data.
              Your profile (username, avatar, tokens, email) is removed.
            </p>
            <p className="text-xs text-danger mb-4">
              <strong>Retained for legal obligations:</strong> Transaction records (invoices,
              audit logs) are retained for 7 years per EU tax law. A non-identifying internal
              reference to your Discord user ID is kept only for record integrity (this is
              pseudonymized data, no longer linkable to an active account) — a permitted
              limitation under Article 17(3).
            </p>
            <p className="text-xs text-cs-dim mb-3">
              Before proceeding, cancel any active Premium subscriptions via your server's
              Premium page.
            </p>
            <label htmlFor="confirm-discord-id" className="block text-xs text-cs-muted mb-1">
              Type your Discord ID <code className="text-cs-cyan">{user?.id}</code> to confirm:
            </label>
            <input
              id="confirm-discord-id"
              type="text"
              value={confirmId}
              onChange={(e) => setConfirmId(e.target.value)}
              placeholder="Your Discord user ID"
              className="cs-input mb-3 font-mono text-sm"
            />
            <button
              onClick={requestDelete}
              disabled={deleting || confirmId !== user?.id}
              className="cs-btn-danger"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {deleting ? "Anonymizing..." : "Permanently delete my account"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete your account?"
        message="This action cannot be undone. Your personal data will be permanently deleted (a non-identifying reference is kept only for record integrity). Continue with account deletion?"
        confirmLabel="Permanently delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
