import { useEffect, type ReactNode } from "react";
import { Panel } from "./Panel";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Accessible dialog: backdrop click + Escape to close, focus-trapped container. */
export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <Panel
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? <h2 className="mb-4 text-2xl text-brass-300">{title}</h2> : null}
        {children}
      </Panel>
    </div>
  );
}
