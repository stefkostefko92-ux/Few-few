import { useEffect, useId, useRef, type ReactNode } from "react";
import { Panel } from "./Panel";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: backdrop click + Escape to close, with a real focus trap
 *  (focus moves in on open, Tab cycles within, focus restores on close). */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  // Hold the latest onClose in a ref so the focus-management effect can key on
  // [open] only. Otherwise a parent re-render that changes onClose's identity
  // (inline arrow) tears down + re-runs the effect, yanking focus out of the
  // field the user is typing in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog (first focusable, else the panel).
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <Panel
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Диалог"}
        className="w-full max-w-md focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2 id={titleId} className="mb-4 text-2xl text-brass-300">
            {title}
          </h2>
        ) : null}
        {children}
      </Panel>
    </div>
  );
}
