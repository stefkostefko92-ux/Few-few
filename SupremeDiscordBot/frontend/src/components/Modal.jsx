// frontend/src/components/Modal.jsx
// Accessible modal dialog (WCAG 2.1.2 / 4.1.2): role=dialog + aria-modal,
// labelled by its title, Escape-to-close, focus moved in on open and
// restored on close, and Tab focus trapped within the dialog.
import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
import { useT } from "../contexts/I18nContext";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, maxWidth = "max-w-lg" }) {
  const { t } = useT();
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);
  const titleId = useId();

  // Фокусът се мести в диалога САМО при отваряне. Държим го в отделен ефект
  // с deps [open]: старият комбиниран ефект зависеше и от onClose, който
  // почти навсякъде е inline стрелка → нова референция при ВСЕКИ render на
  // родителя → ефектът се преизпълняваше и КРАДЕШЕ фокуса след всеки натиснат
  // клавиш в контролиран input (бъг: „пиша 1 символ и губя фокуса").
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const node = dialogRef.current;
    const focusables = node?.querySelectorAll(FOCUSABLE);
    (focusables?.[0] || node)?.focus();
    return () => { previouslyFocused.current?.focus?.(); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const node = dialogRef.current;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Tab" && node) {
        const items = node.querySelectorAll(FOCUSABLE);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cs-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`cs-modal ${maxWidth} w-full outline-none`}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id={titleId} className="font-display text-xl font-bold text-cs-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.closeDialog")}
            className="text-cs-muted hover:text-cs-text transition-colors p-1.5 rounded-lg hover:bg-white/5"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
