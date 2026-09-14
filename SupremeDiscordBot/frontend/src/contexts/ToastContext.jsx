// frontend/src/contexts/ToastContext.jsx
// Minimal toast context — success/error notifications for mutations that
// previously failed or succeeded silently. Auto-dismisses after 5s; each
// toast also has a manual close button. aria-live="polite" via ToastHost.
import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    if (!message) return;
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const value = {
    toasts,
    dismiss,
    success: (message) => push("success", message),
    error: (message) => push("error", message),
  };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/** { success(msg), error(msg) } — fire-and-forget notifications. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft outside the provider (e.g. in isolated tests) instead of crashing the page.
    return { success: () => {}, error: () => {} };
  }
  return ctx;
}

export function useToastList() {
  return useContext(ToastContext);
}
