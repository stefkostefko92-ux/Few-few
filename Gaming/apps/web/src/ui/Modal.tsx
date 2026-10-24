import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Panel } from "./Panel";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned under the scrolling body — always on screen (primary action). */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: a visible close button, backdrop click and Escape to
 *  close, with a real focus trap (focus moves in on open, Tab cycles within,
 *  focus restores on close).
 *
 *  Rendered through a portal on <body>: a `position: fixed` overlay inside a
 *  transformed or z-indexed ancestor (the game stage's entrance animation)
 *  is positioned against THAT box, not the viewport — the dialog ended up
 *  half off-screen with its title hidden and a backdrop that no longer
 *  covered the page, so nothing could close it with the mouse. The panel is
 *  capped to the viewport height and scrolls inside, so the close button is
 *  always on screen. */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const { t } = useTranslation();
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

  return createPortal(
    <div
      className="fixed inset-0 z-[66] flex items-center justify-center bg-charcoal-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <Panel
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : t("a11y.dialog")}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden !p-0 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-2 pt-5">
          {title ? (
            <h2 id={titleId} className="text-2xl text-brass-300">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            data-modal-close=""
            className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-xl leading-none text-ink-300 transition hover:bg-felt-700/60 hover:text-brass-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass-300"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className={`min-h-0 overflow-y-auto overscroll-contain px-6 pt-2 ${footer ? "pb-4" : "pb-6"}`}>{children}</div>
        {footer ? <div className="shrink-0 border-t border-brass-400/15 px-6 py-4">{footer}</div> : null}
      </Panel>
    </div>,
    document.body,
  );
}
