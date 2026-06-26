// frontend/src/components/ConfirmDialog.jsx
// Accessible, branded replacement for window.confirm(). Controlled component:
// render it with `open`, supply `onConfirm`/`onCancel`. Built on <Modal>.
import Modal from "./Modal";

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="text-cs-muted text-sm leading-relaxed whitespace-pre-line mb-6">
        {message}
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="cs-btn-secondary" disabled={loading}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={destructive ? "cs-btn-danger" : "cs-btn-primary"}
        >
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
