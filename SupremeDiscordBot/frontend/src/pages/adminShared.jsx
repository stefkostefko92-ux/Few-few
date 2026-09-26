// frontend/src/pages/adminShared.jsx
// Общи градивни части на админ конзолата (AdminPage.jsx, AdminManageTabs.jsx).
// Конзолата е EN-only (изключена от i18n) — както останалите ѝ табове.
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import Modal from "../components/Modal";

/** Грешка от сървъра като текст (interceptor-ът вече нормализира Zod обекти). */
export const adminErr = (err) => err?.response?.data?.error || "Action failed. Please try again.";

/**
 * Страници за списъците. Досега Users/Servers/Payments/Audit взимаха първите
 * 100–200 записа без страниране — сървър №101 не можеше да се управлява
 * (одит 26.09.2026). `total` идва от backend-а.
 */
export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3 mt-4 text-xs text-cs-muted" aria-label="Pagination">
      <span>Page {page} of {pages} · {total} total</span>
      <div className="flex gap-2">
        <button type="button" className="cs-btn-ghost cs-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Prev
        </button>
        <button type="button" className="cs-btn-ghost cs-btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export function ConfirmModal({ title, message, children, confirmLabel, onConfirm, onCancel, loading, error, danger }) {
  return (
    <Modal open onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 border flex items-center justify-center ${danger ? "border-danger text-danger" : "border-cs-cyan text-cs-cyan"}`}>
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </div>
        {danger && <span className="sr-only">Warning</span>}
      </div>

      {message && <p className="text-sm text-cs-muted leading-relaxed mb-4">{message}</p>}
      {children}

      {error && (
        <div className="border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger mt-3" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-cs-border">
        <button className="cs-btn-ghost" onClick={onCancel} disabled={loading}>Cancel</button>
        <button
          className={danger ? "cs-btn-danger" : "cs-btn-primary"}
          disabled={loading}
          onClick={onConfirm}
        >{loading ? "Working..." : confirmLabel}</button>
      </div>
    </Modal>
  );
}
